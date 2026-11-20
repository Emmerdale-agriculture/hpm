/**
 * Orchestrator — runs the full pull→triage→classify→dedupe→generate→persist
 * pipeline. Used by both the cron route and the local dry-run script.
 *
 * Persistence is incremental: each opportunity is written immediately after
 * its draft is generated. A timeout mid-run still leaves earlier opportunities
 * persisted (brief §10).
 *
 * Idempotency is checked BEFORE generation, so a re-run of the same week's
 * data is cheap — no Anthropic spend on rows already in the collection.
 */

import { gscQuery, isoDaysAgo } from '@/lib/gsc';
import { fetchGa4PageEngagement, isGa4Configured, normaliseGa4Path } from '@/lib/ga4';
import { TokenBudget } from './anthropic';
import { classifyQuery, type ClassifyContext } from './classify';
import { findCollision } from './cannibalisation';
import { generateArticle, generateMetaRewrite, generateOnPageTweak } from './generate';
import {
  fetchExistingDocs,
  findActivePriorOpportunity,
  findExistingOpportunity,
  getPayloadClient,
  persistOpportunity,
  resolveTargetPage,
} from './persist';
import { fetchPageContext, type PageContext } from './page-context';
import { reviewOutcomes } from './outcomes';
import { readLinkSettings, runLinkBrief } from './link-brief';
import { articleScore, groupByQuery, isCompetitorQuery, triageRow } from './triage';
import {
  expectedCtrForPosition,
  isoWeekLabel,
  type AgentRunSummary,
  type Opportunity,
  type PageAnalytics,
  type QueryOpportunityType,
} from './types';
import type { ExistingDoc } from './cannibalisation';

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://hampshirepaddockmanagement.com').replace(/\/$/, '');

/** Public path for a Payload doc: services and posts (notes) are prefixed. */
function docPath(d: ExistingDoc): string {
  if (d.collection === 'services') return `/services/${d.slug}`;
  if (d.collection === 'posts') return `/notes/${d.slug}`;
  return `/${d.slug}`;
}

/** A button-made campaign this recent stands in for the cron's monthly brief. */
const CAMPAIGN_COVERS_DAYS = 25;

class SkipLinkBrief extends Error {}

export type RunOptions = {
  dryRun: boolean;
  /** GSC lookback in days. Brief: 28. */
  lookbackDays?: number;
  /** Max new article drafts to generate per run. Brief: 3. */
  articleCap?: number;
  /** Override "today" for the ISO week label (used by tests). */
  now?: Date;
  /** USD soft cap on Anthropic spend per run. Default 2.5 (~£2). */
  budgetUsd?: number;
};

type WorkItem = {
  type: QueryOpportunityType;
  row: {
    query: string;
    page?: string;
    impressions: number;
    clicks: number;
    ctr: number;
    position: number;
    otherPages?: Array<{ page: string; impressions: number; position: number }>;
  };
  /** Same-page, same-type variants folded into this item (step 9). */
  members?: WorkItem[];
  classification: Awaited<ReturnType<typeof classifyQuery>>;
  /** True for new_article rows past the per-week cap. Persisted with no draft. */
  deferred?: boolean;
};

export async function runAgent(opts: RunOptions): Promise<AgentRunSummary> {
  const startedAt = new Date();
  const runId = `run_${startedAt.getTime()}`;
  const lookback = opts.lookbackDays ?? 28;
  const articleCap = opts.articleCap ?? 3;
  const weekIdentified = isoWeekLabel(opts.now ?? startedAt);
  const errors: string[] = [];
  // Stop at 270s: drafts are sequential and each thinks first, so a run
  // with many leads must stop starting calls before maxDuration (300s).
  const budget = new TokenBudget(opts.budgetUsd ?? 2.5, startedAt.getTime() + 270_000);

  const gscRange = {
    start: isoDaysAgo(lookback),
    end: isoDaysAgo(1), // GSC's most recent day is usually 1d behind
  };

  // 1) Pull from GSC
  let rows: Awaited<ReturnType<typeof gscQuery>> = [];
  try {
    rows = await gscQuery({
      startDate: gscRange.start,
      endDate: gscRange.end,
      dimensions: ['query', 'page'],
      rowLimit: 1000,
    });
  } catch (err) {
    errors.push(`GSC pull failed: ${err instanceof Error ? err.message : String(err)}`);
    return emptySummary({ runId, weekIdentified, startedAt, gscRange, errors });
  }

  // 1b) GA4 engagement per page, same window as GSC. Optional: a GA4 failure
  //     costs the analytics columns and the engagement gate, not the run.
  let ga4: Map<string, PageAnalytics> | null = null;
  if (isGa4Configured()) {
    try {
      ga4 = await fetchGa4PageEngagement(gscRange.start, gscRange.end);
    } catch (err) {
      errors.push(`GA4 pull failed (run continues without it): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const analyticsFor = (url?: string): PageAnalytics | null =>
    url && ga4 ? (ga4.get(normaliseGa4Path(url)) ?? null) : null;

  // 2) Connect to Payload (errors here also non-fatal — we still send the digest)
  let payload: Awaited<ReturnType<typeof getPayloadClient>>;
  let existing: ExistingDoc[];
  try {
    payload = await getPayloadClient();
    existing = await fetchExistingDocs(payload);
  } catch (err) {
    errors.push(`Payload init failed: ${err instanceof Error ? err.message : String(err)}`);
    return emptySummary({ runId, weekIdentified, startedAt, gscRange, errors });
  }
  const servicePages = existing.filter((d) => d.collection === 'services').map((d) => d.slug);
  // Commentary posts (Videscape/Clickasnap) draw search traffic but aren't
  // the business: never optimise them, and keep them out of the prompts.
  const commentarySlugs = new Set(
    existing.filter((d) => d.collection === 'posts' && d.category === 'commentary').map((d) => d.slug),
  );
  const optimisable = existing.filter((d) => !(d.collection === 'posts' && d.category === 'commentary'));
  const postSummaries = optimisable
    .filter((d) => d.collection === 'posts')
    .slice(0, 30)
    .map((d) => d.title);
  const ctx: ClassifyContext = { servicePages, postSummaries };

  // 3) Triage + competitor filter
  const grouped = groupByQuery(rows);
  const isCommentaryUrl = (url?: string) => {
    if (!url) return false;
    const leaf = url.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() ?? '';
    return /\/notes\//.test(url) && commentarySlugs.has(leaf);
  };
  const triaged = grouped
    .filter((r) => !isCompetitorQuery(r.query))
    .filter((r) => !isCommentaryUrl(r.page))
    .map((r) => ({ row: r, triage: triageRow(r) }))
    .filter((c): c is { row: typeof c.row; triage: Extract<typeof c.triage, { candidate: true }> } => c.triage.candidate);

  // 4) Classify each candidate (Haiku — cheap). The classifier owns INTENT and
  //    the keep/skip decision only; the opportunity TYPE is decided by triage's
  //    position bands (step 5). The model has no position thresholds, so left to
  //    type things itself it mislabels — e.g. a position-21 query as a
  //    meta_rewrite when its rank only justifies a new article.
  const classified: Array<{
    row: (typeof triaged)[number]['row'];
    suggestedType: QueryOpportunityType;
    classification: Awaited<ReturnType<typeof classifyQuery>>;
  }> = [];
  // Four at a time: Haiku 5.5 thinks before answering, and 30 serial calls
  // would eat the time drafts need. Results keep triage order.
  const slots: Array<(typeof classified)[number] | null> = new Array(triaged.length).fill(null);
  let nextIdx = 0;
  let budgetNoted = false;
  await Promise.all(
    Array.from({ length: Math.min(4, triaged.length) }, async () => {
      while (nextIdx < triaged.length) {
        const i = nextIdx++;
        const c = triaged[i];
        if (budget.exceeded()) {
          if (!budgetNoted) errors.push(`Budget exceeded during classification`);
          budgetNoted = true;
          return;
        }
        try {
          const classification = await classifyQuery(c.row, ctx, budget);
          slots[i] = { row: c.row, suggestedType: c.triage.suggestedType, classification };
        } catch (err) {
          errors.push(`Classify "${c.row.query}" failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }),
  );
  for (const x of slots) if (x) classified.push(x);

  // 5) Promote to typed candidates. Type is authoritative from triage's
  //    position bands; the classifier only gates keep/skip and supplies intent.
  //    Re-apply the brief's guard here (it used to live in the classifier, back
  //    when the classifier set the type): never raise a new_article for
  //    transactional or local intent — tweak the service page or skip instead.
  const promoted: WorkItem[] = [];
  for (const c of classified) {
    if (c.classification.type === 'skip') continue;
    // Brand/navigational searches ("emmerdale agriculture" landing on
    // /contact) aren't won with an extra H2 or a new article; at most the
    // snippet is worth rewriting.
    if (c.classification.intent === 'navigational' && c.suggestedType !== 'meta_rewrite') continue;
    if (
      c.suggestedType === 'new_article' &&
      (c.classification.intent === 'transactional' || c.classification.intent === 'local')
    ) {
      continue;
    }
    promoted.push({ row: c.row, type: c.suggestedType, classification: c.classification });
  }

  // 6) Cannibalisation: downgrade colliding new_article -> on_page_tweak
  const newArticleCands: WorkItem[] = [];
  const others: WorkItem[] = [];
  for (const cand of promoted) {
    if (cand.type !== 'new_article') {
      others.push(cand);
      continue;
    }
    // Commentary posts are never optimisation targets, so never collide with them.
    const hit = findCollision(cand.row.query, undefined, optimisable);
    if (hit) {
      others.push({
        ...cand,
        type: 'on_page_tweak',
        // Absolute URL: page-context fetch()es it and clustering keys on it,
        // and GSC reports full URLs.
        row: { ...cand.row, page: cand.row.page ?? `${SITE_ORIGIN}${docPath(hit.doc)}` },
      });
    } else {
      newArticleCands.push(cand);
    }
  }

  // 7) Article cap (top N by score; rest deferred with no draft)
  newArticleCands.sort((a, b) => articleScore(b.row) - articleScore(a.row));
  const articlesActive = newArticleCands.slice(0, articleCap);
  const articlesDeferred = newArticleCands.slice(articleCap).map((w) => ({
    ...w,
    deferred: true,
    classification: {
      ...w.classification,
      rationale: `Deferred — capacity cap (${articleCap}/week). ${w.classification.rationale}`,
    },
  }));

  // 8) Build the unified work list, prioritised cheapest-first so a timeout
  //    leaves the highest-ROI work persisted.
  const work: WorkItem[] = [
    ...others.filter((w) => w.type === 'meta_rewrite'),
    ...others.filter((w) => w.type === 'on_page_tweak'),
    ...articlesActive,
    ...articlesDeferred,
  ];

  // 9) Per-item gates, cheapest first: idempotency (already raised this
  //    week) → cooldown (raised/resolved recently). Items past both gates go
  //    on to clustering; cooldown hits are recorded as superseded, no draft.
  const opportunities: Opportunity[] = [];
  const counts = { skipped: 0, superseded: 0 };
  const siteMap = optimisable.map((d) => ({ path: docPath(d), title: d.title }));
  const heldBack: AgentRunSummary['heldBack'] = [];

  // Gates are reads only, so a dry run applies them too — otherwise a dry
  // run can't show which queries the cooldown is holding back.
  const live: WorkItem[] = [];
  for (const item of work) {
    try {
      const exists = await findExistingOpportunity(payload, {
        weekIdentified,
        query: item.row.query,
        type: item.type,
      });
      if (exists) {
        counts.skipped++;
        continue;
      }
    } catch (err) {
      errors.push(`Idempotency check "${item.row.query}" failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    let priorId: number | null = null;
    try {
      priorId = await findActivePriorOpportunity(payload, item.row.query);
    } catch (err) {
      // Skip — falling through with priorId=null would burn Anthropic
      // budget and persist a duplicate `pending` row when one already
      // exists. Next run retries.
      errors.push(`Prior check "${item.row.query}" failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (!priorId) {
      live.push(item);
      continue;
    }
    heldBack.push({ query: item.row.query, type: item.type, priorId });
    counts.superseded++;
    if (opts.dryRun) continue;
    const opp = await buildOpportunity({
      item,
      weekIdentified,
      existing,
      siteMap,
      servicePages,
      postSummaries,
      budget,
      generate: false,
      page: null,
      analytics: analyticsFor(item.row.page),
    });
    try {
      const result = await persistOpportunity(payload, opp, runId, 'superseded');
      if (result.postError) errors.push(`"${opp.query}": ${result.postError}`);
    } catch (err) {
      errors.push(`Persist "${opp.query}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 9b) Backlink brief for the agency. Per page, not per query; no model
  //     call, so it's cheap and runs before drafting to survive a timeout.
  //     Cooldown is per page (key "links → /path"): a page briefed in the
  //     last 120 days, or still pending, gives its slot to the next one.
  let linkBrief: AgentRunSummary['linkBrief'] = null;
  try {
    // One campaign a month: if Tom already made this month's with the
    // Backlink campaign button, the cron doesn't add a second brief (the
    // cooldown would only push it on to the next page — a double order).
    const recentCampaign = await payload.find({
      collection: 'seo-opportunities',
      where: {
        and: [
          { type: { equals: 'link_target' } },
          { agentRunId: { like: 'campaign_' } },
          { createdAt: { greater_than: new Date(Date.now() - CAMPAIGN_COVERS_DAYS * 86_400_000).toISOString() } },
        ],
      },
      limit: 1,
      depth: 0,
    });
    if (recentCampaign.docs.length) {
      throw new SkipLinkBrief(`#${recentCampaign.docs[0].id} (${recentCampaign.docs[0].weekIdentified})`);
    }
    const settings = await readLinkSettings(payload, errors);
    const brief = await runLinkBrief({
      payload,
      grouped,
      existing,
      analyticsFor,
      isExcludedPage: (url) => isCommentaryUrl(url),
      settings,
      weekIdentified,
      runId,
      dryRun: opts.dryRun,
      errors,
    });
    opportunities.push(...brief.opportunities);
    heldBack.push(...brief.heldBack);
    linkBrief = brief.linkBrief;
  } catch (err) {
    if (err instanceof SkipLinkBrief) {
      linkBrief = { linksTotal: 0, averageTargetDa: null, daBand: { min: 0, max: 0 }, fixFirst: [], coveredBy: err.message };
    } else {
      errors.push(`Link brief failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 10) Cluster same-page, same-type items. GSC splits one intent into many
  //     strings — "paddock harrowing", "grass harrowing", "harrowing grass",
  //     "harrowing a field" were 4 rows aimed at post 29 in W44 alone, each
  //     with its own Opus draft proposing much the same section. Now the
  //     highest-impression query leads, one draft serves all of them, and
  //     the rest are recorded as superseded members (so the cooldown covers
  //     every variant, not just the lead).
  const clustered: WorkItem[] = [];
  const byKey = new Map<string, WorkItem>();
  for (const item of live) {
    if (item.type === 'new_article' || !item.row.page) {
      clustered.push(item);
      continue;
    }
    const key = `${item.type}|${item.row.page}`;
    const lead = byKey.get(key);
    if (!lead) {
      const fresh = { ...item, members: [] };
      byKey.set(key, fresh);
      clustered.push(fresh);
    } else if (item.row.impressions > lead.row.impressions) {
      // Promote: the new item leads, the old lead becomes a member.
      const promoted = { ...item, members: [{ ...lead, members: undefined }, ...(lead.members ?? [])] };
      byKey.set(key, promoted);
      clustered[clustered.indexOf(lead)] = promoted;
    } else {
      lead.members!.push(item);
    }
  }

  // 11) Fetch every lead's page up front, in parallel (each capped at 10s),
  //     so serial fetches can't eat the 300s function budget. Then generate +
  //     persist each lead immediately (timeout-safe).
  const pageUrls = Array.from(
    new Set(clustered.filter((w) => w.type !== 'new_article' && !w.deferred && w.row.page).map((w) => w.row.page!)),
  );
  const pages = new Map(
    await Promise.all(pageUrls.map(async (u) => [u, await fetchPageContext(u)] as const)),
  );

  for (const item of clustered) {
    const generate = !item.deferred && !budget.exceeded() && budget.msLeft() > 60_000;
    const page = generate && item.type !== 'new_article' && item.row.page ? (pages.get(item.row.page) ?? null) : null;
    if (generate && item.type !== 'new_article' && item.row.page && !page) {
      errors.push(`Page fetch failed for ${item.row.page} — "${item.row.query}" drafted from title only`);
    }
    const opp = await buildOpportunity({
      item,
      weekIdentified,
      existing,
      siteMap,
      servicePages,
      postSummaries,
      budget,
      generate,
      page,
      analytics: analyticsFor(item.row.page),
    });
    opportunities.push(opp);
    if (opts.dryRun) continue;

    let leadId: number | null = null;
    try {
      const result = await persistOpportunity(payload, opp, runId, 'pending');
      leadId = result.opportunityId;
      if (result.postError) errors.push(`"${opp.query}": ${result.postError}`);
    } catch (err) {
      errors.push(`Persist "${opp.query}" failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    // Only a lead with a draft covers its variants. Without one (budget hit,
    // generation failed) the members are recorded but don't start a cooldown,
    // so they can come back next run instead of hiding behind an empty lead.
    const covered = opp.draftContent !== null;
    for (const member of item.members ?? []) {
      const memberOpp = await buildOpportunity({
        item: member,
        weekIdentified,
        existing,
        siteMap,
        servicePages,
        postSummaries,
        budget,
        generate: false,
        page: null,
        analytics: analyticsFor(member.row.page),
      });
      try {
        // decidedAt marks this as a real decision (the agent merged it), so
        // findActivePriorOpportunity starts its cooldown — unlike plain
        // auto-superseded rows, which deliberately don't.
        await persistOpportunity(
          payload,
          memberOpp,
          runId,
          'superseded',
          covered
            ? {
                decidedAt: new Date().toISOString(),
                notes: `Clustered into #${leadId} ("${opp.query}"): same page, one draft covers both.`,
              }
            : { notes: `Clustered into #${leadId} ("${opp.query}"), but the lead has no draft; not held back.` },
        );
      } catch (err) {
        errors.push(`Persist member "${member.row.query}" failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 12) Did earlier changes work? DB + the GSC rows already pulled, plus an
  //     exact lookup for any query that fell below the pull's row cap.
  let outcomes: AgentRunSummary['outcomes'] = [];
  try {
    outcomes = await reviewOutcomes(payload, grouped, gscRange);
  } catch (err) {
    errors.push(`Outcome review failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const finishedAt = new Date();

  // Counts reflect the WEEK'S total, not just this run's new opportunities.
  // Idempotent skips never enter `opportunities[]`, so deriving counts from
  // the in-memory array under-reported on re-runs (the digest would say
  // "0 new articles" even when articles already existed for the week).
  // Re-query persisted state when not dry-running.
  let weekTotals = {
    metaRewrites: opportunities.filter((o) => o.type === 'meta_rewrite').length,
    onPageTweaks: opportunities.filter((o) => o.type === 'on_page_tweak').length,
    newArticles: opportunities.filter((o) => o.type === 'new_article' && !(o as { deferred?: boolean }).deferred).length,
    deferred: opportunities.filter((o) => o.type === 'new_article' && (o as { deferred?: boolean }).deferred).length,
    superseded: counts.superseded,
    linkTargets: opportunities.filter((o) => o.type === 'link_target').length,
  };
  if (!opts.dryRun) {
    try {
      const persisted = await payload.find({
        collection: 'seo-opportunities',
        where: { weekIdentified: { equals: weekIdentified } },
        limit: 500,
        depth: 0,
      });
      const docs = persisted.docs;
      // Type counts are OPEN work only; superseded rows (cooldown hits and
      // cluster members) used to inflate "found N opportunities".
      const open = docs.filter((d) => d.status !== 'superseded');
      weekTotals = {
        metaRewrites: open.filter((d) => d.type === 'meta_rewrite').length,
        onPageTweaks: open.filter((d) => d.type === 'on_page_tweak').length,
        newArticles: open.filter((d) => d.type === 'new_article' && !d.deferred).length,
        deferred: open.filter((d) => d.type === 'new_article' && d.deferred === true).length,
        superseded: docs.filter((d) => d.status === 'superseded').length,
        linkTargets: open.filter((d) => d.type === 'link_target').length,
      };
    } catch (err) {
      errors.push(`Week-totals query failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    runId,
    weekIdentified,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    gscRange,
    counts: {
      rowsFromGsc: rows.length,
      classified: classified.length,
      ...weekTotals,
    },
    linkBrief,
    ga4Joined: ga4 !== null,
    opportunities,
    heldBack,
    outcomes,
    errors,
  };
}

async function buildOpportunity(args: {
  item: WorkItem;
  weekIdentified: string;
  existing: ExistingDoc[];
  siteMap: Array<{ path: string; title: string }>;
  servicePages: string[];
  postSummaries: string[];
  budget: TokenBudget;
  generate: boolean;
  page: PageContext | null;
  analytics?: PageAnalytics | null;
}): Promise<Opportunity> {
  const { item, weekIdentified, existing, siteMap, servicePages, postSummaries, budget, generate, page } = args;
  const relatedQueries = (item.members ?? []).map((m) => ({
    query: m.row.query,
    impressions: m.row.impressions,
    position: m.row.position,
  }));
  const competingPages = item.row.otherPages ?? [];
  const relatedLines = relatedQueries.map(
    (r) => `${r.query} (${r.impressions} imp, pos ${r.position.toFixed(1)})`,
  );
  const competingLines = competingPages.map(
    (p) => `${p.page} (${p.impressions} imp, pos ${p.position.toFixed(1)})`,
  );
  const rationale = [
    item.classification.rationale,
    relatedLines.length ? `Also covers: ${relatedLines.join('; ')}.` : '',
    competingLines.length ? `SPLIT — Google also shows: ${competingLines.join('; ')}. Check which page should own this query before adding copy.` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const target = resolveTargetPage(item.row.page, existing);
  const targetDoc = target ? existing.find((d) => d.id === target.id) : undefined;
  const baseMetrics = {
    impressions: item.row.impressions,
    clicks: item.row.clicks,
    ctr: item.row.ctr,
    position: item.row.position,
  };
  const base = {
    query: item.row.query,
    intent: item.classification.intent,
    weekIdentified,
    rationale,
    relatedQueries: relatedQueries.length ? relatedQueries : undefined,
    competingPages: competingPages.length ? competingPages : undefined,
    targetPageSlug: targetDoc?.slug,
    targetPageId: target?.id,
    targetPageCollection: target?.collection,
    analytics: args.analytics ?? null,
  };

  if (item.type === 'meta_rewrite') {
    const expected = expectedCtrForPosition(item.row.position) ?? 0.05;
    const draft = generate
      ? await generateMetaRewrite(
          {
            query: item.row.query,
            relatedQueries: relatedLines,
            url: item.row.page ?? '',
            currentTitle: targetDoc?.title ?? '',
            currentMeta: '',
            ctr: item.row.ctr,
            expectedCtr: expected,
            page,
          },
          budget,
        )
      : null;
    return {
      ...base,
      type: 'meta_rewrite',
      metrics: { ...baseMetrics, expectedCtr: expected },
      draftContent: draft,
    };
  }

  if (item.type === 'on_page_tweak') {
    const draft = generate
      ? await generateOnPageTweak(
          {
            query: item.row.query,
            relatedQueries: relatedLines,
            competingPages: competingLines,
            url: item.row.page ?? '',
            excerpt: targetDoc?.title ?? '',
            position: item.row.position,
            siteMap,
            page,
            analytics: base.analytics,
          },
          budget,
        )
      : null;
    return {
      ...base,
      type: 'on_page_tweak',
      metrics: baseMetrics,
      draftContent: draft,
    };
  }

  // new_article (or deferred new_article)
  const draft = generate
    ? await generateArticle(
        {
          query: item.row.query,
          intent: item.classification.intent,
          serviceSlugs: servicePages,
          existingPostsSummary: postSummaries.join('; '),
          rationale: item.classification.rationale,
        },
        budget,
      )
    : null;
  return {
    ...base,
    type: 'new_article',
    metrics: baseMetrics,
    draftContent: draft,
    deferred: item.deferred,
  };
}

function emptySummary(args: {
  runId: string;
  weekIdentified: string;
  startedAt: Date;
  gscRange: { start: string; end: string };
  errors: string[];
}): AgentRunSummary {
  const finishedAt = new Date();
  return {
    runId: args.runId,
    weekIdentified: args.weekIdentified,
    startedAt: args.startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    gscRange: args.gscRange,
    counts: {
      rowsFromGsc: 0,
      classified: 0,
      metaRewrites: 0,
      onPageTweaks: 0,
      newArticles: 0,
      deferred: 0,
      superseded: 0,
      linkTargets: 0,
    },
    linkBrief: null,
    ga4Joined: false,
    opportunities: [],
    heldBack: [],
    outcomes: [],
    errors: args.errors,
  };
}

