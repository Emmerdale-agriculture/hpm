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
import { articleScore, groupByQuery, isCompetitorQuery, triageRow } from './triage';
import {
  expectedCtrForPosition,
  isoWeekLabel,
  type AgentRunSummary,
  type Opportunity,
  type OpportunityType,
} from './types';
import type { ExistingDoc } from './cannibalisation';

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
  type: OpportunityType;
  row: { query: string; page?: string; impressions: number; clicks: number; ctr: number; position: number };
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
  const budget = new TokenBudget(opts.budgetUsd ?? 2.5);

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
  const postSummaries = existing
    .filter((d) => d.collection === 'posts')
    .slice(0, 30)
    .map((d) => d.title);
  const ctx: ClassifyContext = { servicePages, postSummaries };

  // 3) Triage + competitor filter
  const grouped = groupByQuery(rows);
  const triaged = grouped
    .filter((r) => !isCompetitorQuery(r.query))
    .map((r) => ({ row: r, triage: triageRow(r) }))
    .filter((c): c is { row: typeof c.row; triage: Extract<typeof c.triage, { candidate: true }> } => c.triage.candidate);

  // 4) Classify each candidate (Haiku — cheap)
  const classified: Array<{
    row: (typeof triaged)[number]['row'];
    classification: Awaited<ReturnType<typeof classifyQuery>>;
  }> = [];
  for (const c of triaged) {
    if (budget.exceeded()) {
      errors.push(`Budget exceeded after ${classified.length} classifications`);
      break;
    }
    try {
      const classification = await classifyQuery(c.row, ctx, budget);
      classified.push({ row: c.row, classification });
    } catch (err) {
      errors.push(`Classify "${c.row.query}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 5) Promote to typed candidates (drop classifier 'skip')
  const promoted: WorkItem[] = [];
  for (const c of classified) {
    if (c.classification.type === 'skip') continue;
    promoted.push({ row: c.row, type: c.classification.type, classification: c.classification });
  }

  // 6) Cannibalisation: downgrade colliding new_article -> on_page_tweak
  const newArticleCands: WorkItem[] = [];
  const others: WorkItem[] = [];
  for (const cand of promoted) {
    if (cand.type !== 'new_article') {
      others.push(cand);
      continue;
    }
    const hit = findCollision(cand.row.query, undefined, existing);
    if (hit) {
      others.push({
        ...cand,
        type: 'on_page_tweak',
        row: { ...cand.row, page: cand.row.page ?? `/${hit.doc.slug}` },
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

  // 9) Per-item: idempotency check → prior check → generate (if needed) → persist immediately
  const opportunities: Opportunity[] = [];
  const counts = { skipped: 0, superseded: 0 };
  const siteMap = existing.map((d) => ({ slug: d.slug, title: d.title }));

  for (const item of work) {
    // Idempotency: already done this week?
    if (!opts.dryRun) {
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
    }

    // Active prior from earlier week?
    let priorId: number | null = null;
    if (!opts.dryRun) {
      try {
        priorId = await findActivePriorOpportunity(payload, item.row.query, item.type);
      } catch (err) {
        // Skip — falling through with priorId=null would burn Anthropic
        // budget and persist a duplicate `pending` row when one already
        // exists. Next week's run retries.
        errors.push(`Prior check "${item.row.query}" failed: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }

    // Build the opportunity (may have null draftContent)
    const opp = await buildOpportunity({
      item,
      weekIdentified,
      existing,
      siteMap,
      servicePages,
      postSummaries,
      budget,
      // Skip Opus generation when superseded or deferred or budget exceeded
      generate: !priorId && !item.deferred && !budget.exceeded(),
    });
    opportunities.push(opp);

    if (opts.dryRun) continue;

    try {
      const status: 'pending' | 'superseded' = priorId ? 'superseded' : 'pending';
      const result = await persistOpportunity(payload, opp, runId, status);
      if (status === 'superseded') counts.superseded++;
      if (result.postError) errors.push(`"${opp.query}": ${result.postError}`);
    } catch (err) {
      errors.push(`Persist "${opp.query}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
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
      weekTotals = {
        metaRewrites: docs.filter((d) => d.type === 'meta_rewrite').length,
        onPageTweaks: docs.filter((d) => d.type === 'on_page_tweak').length,
        newArticles: docs.filter((d) => d.type === 'new_article' && !d.deferred).length,
        deferred: docs.filter((d) => d.type === 'new_article' && d.deferred === true).length,
        superseded: docs.filter((d) => d.status === 'superseded').length,
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
    opportunities,
    errors,
  };
}

async function buildOpportunity(args: {
  item: WorkItem;
  weekIdentified: string;
  existing: ExistingDoc[];
  siteMap: Array<{ slug: string; title: string }>;
  servicePages: string[];
  postSummaries: string[];
  budget: TokenBudget;
  generate: boolean;
}): Promise<Opportunity> {
  const { item, weekIdentified, existing, siteMap, servicePages, postSummaries, budget, generate } = args;
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
    rationale: item.classification.rationale,
    targetPageSlug: targetDoc?.slug,
    targetPageId: target?.id,
    targetPageCollection: target?.collection,
  };

  if (item.type === 'meta_rewrite') {
    const expected = expectedCtrForPosition(item.row.position) ?? 0.05;
    const draft = generate
      ? await generateMetaRewrite(
          {
            query: item.row.query,
            url: item.row.page ?? '',
            currentTitle: targetDoc?.title ?? '',
            currentMeta: '',
            ctr: item.row.ctr,
            expectedCtr: expected,
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
            url: item.row.page ?? '',
            excerpt: targetDoc?.title ?? '', // v1: title only; full-content fetch is v2
            position: item.row.position,
            siteMap,
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
    },
    opportunities: [],
    errors: args.errors,
  };
}
