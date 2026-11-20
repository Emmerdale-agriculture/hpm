/**
 * Link brief runner — shared by the monthly cron (orchestrate.ts) and the
 * "Backlink campaign" admin page (/admin-stats/backlinks), so both pick
 * pages, allocate links and set target DA identically.
 */

import { gscQuery, isoDaysAgo } from '@/lib/gsc';
import { fetchGa4PageEngagement, isGa4Configured, normaliseGa4Path } from '@/lib/ga4';
import type { ExistingDoc } from './cannibalisation';
import {
  allocateLinks,
  averageTargetDa,
  buildLinkDraft,
  normaliseLinkSettings,
  rankLinkCandidates,
  type LinkCandidate,
  type LinkSettings,
} from './link-targets';
import {
  fetchExistingDocs,
  findActivePriorOpportunity,
  findExistingOpportunity,
  getPayloadClient,
  persistOpportunity,
  resolveTargetPage,
} from './persist';
import { groupByQuery, isCompetitorQuery } from './triage';
import {
  isoWeekLabel,
  type AgentRunSummary,
  type GscRowPlus,
  type LinkTargetDraft,
  type LinkTargetOpportunity,
  type PageAnalytics,
} from './types';

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export type LinkBriefResult = {
  opportunities: LinkTargetOpportunity[];
  heldBack: AgentRunSummary['heldBack'];
  linkBrief: NonNullable<AgentRunSummary['linkBrief']>;
};

/** Read the Cheatcode settings global; defaults (and a note) if unreadable. */
export async function readLinkSettings(payload: Payload, errors: string[]): Promise<LinkSettings> {
  try {
    const raw = (await payload.findGlobal({ slug: 'cheatcode-settings', depth: 0 })) as unknown as Record<string, unknown>;
    return normaliseLinkSettings(raw);
  } catch (err) {
    errors.push(`Cheatcode settings unreadable, using defaults: ${err instanceof Error ? err.message : String(err)}`);
    return normaliseLinkSettings(null);
  }
}

/**
 * Pick pages, apply the per-page cooldown, allocate links, and (unless
 * dryRun) persist each target as a pending `link_target` opportunity.
 */
export async function runLinkBrief(args: {
  payload: Payload;
  grouped: GscRowPlus[];
  existing: ExistingDoc[];
  analyticsFor: (url?: string) => PageAnalytics | null;
  isExcludedPage: (url: string) => boolean;
  settings: LinkSettings;
  weekIdentified: string;
  runId: string;
  dryRun: boolean;
  errors: string[];
  /** Note stored on each persisted row (e.g. who/what created the campaign). */
  notes?: string;
}): Promise<LinkBriefResult> {
  const { payload, settings, weekIdentified, errors } = args;
  const heldBack: AgentRunSummary['heldBack'] = [];
  const opportunities: LinkTargetOpportunity[] = [];
  const empty = (fixFirst: NonNullable<AgentRunSummary['linkBrief']>['fixFirst'] = []): LinkBriefResult => ({
    opportunities,
    heldBack,
    linkBrief: { linksTotal: 0, averageTargetDa: null, daBand: { min: settings.daMin, max: settings.daMax }, fixFirst },
  });
  if (settings.linksPerMonth <= 0) return empty();

  const { ranked, lowEngagement } = rankLinkCandidates(args.grouped, {
    isExcludedPage: args.isExcludedPage,
    isExcludedQuery: (q) => isCompetitorQuery(q),
    analyticsFor: (url) => args.analyticsFor(url),
  });
  const fixFirst = lowEngagement.slice(0, 5).map((c) => ({
    path: c.path,
    sessions: c.analytics?.sessions ?? 0,
    engagementRate: c.analytics?.engagementRate ?? 0,
  }));

  // Never more pages than links: with 1 link a month only the top page counts.
  const maxPages = Math.min(settings.maxLinkPages, settings.linksPerMonth);
  const chosen: LinkCandidate[] = [];
  for (const c of ranked) {
    if (chosen.length >= maxPages) break;
    if (await findExistingOpportunity(payload, { weekIdentified, query: c.key, type: 'link_target' })) {
      chosen.push(c); // already briefed this week: keep its slot; persist returns the existing row
      continue;
    }
    // Per-page cooldown: briefed in the last 120 days (or still pending)
    // → the next page takes the slot.
    const priorId = await findActivePriorOpportunity(payload, c.key);
    if (priorId) {
      heldBack.push({ query: c.key, type: 'link_target', priorId });
      continue;
    }
    chosen.push(c);
  }

  const alloc = allocateLinks(chosen.map((c) => c.score), settings.linksPerMonth);
  const drafts = chosen
    .map((c, i) => ({ c, draft: buildLinkDraft(c, alloc[i], settings) }))
    .filter((x) => x.draft.linksRequested > 0);

  for (const { c, draft } of drafts) {
    const opp = linkOpportunity(c, draft, weekIdentified, args.existing);
    opportunities.push(opp);
    if (args.dryRun) continue;
    try {
      await persistOpportunity(payload, opp, args.runId, 'pending', args.notes ? { notes: args.notes } : undefined);
    } catch (err) {
      errors.push(`Persist "${opp.query}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    opportunities,
    heldBack,
    linkBrief: {
      linksTotal: drafts.reduce((s, d) => s + d.draft.linksRequested, 0),
      averageTargetDa: averageTargetDa(drafts.map((d) => d.draft)),
      daBand: { min: settings.daMin, max: settings.daMax },
      fixFirst,
    },
  };
}

/**
 * Standalone campaign (admin button): does its own GSC + GA4 pull over
 * the same 28-day window the monthly run uses, then runs the brief.
 */
export async function runLinkCampaign(opts: {
  settings: LinkSettings;
  dryRun: boolean;
  notes?: string;
}): Promise<LinkBriefResult & { errors: string[]; gscRange: { start: string; end: string }; ga4Joined: boolean }> {
  const errors: string[] = [];
  const gscRange = { start: isoDaysAgo(28), end: isoDaysAgo(1) };
  const [rows, ga4] = await Promise.all([
    gscQuery({ startDate: gscRange.start, endDate: gscRange.end, dimensions: ['query', 'page'], rowLimit: 1000 }),
    isGa4Configured()
      ? fetchGa4PageEngagement(gscRange.start, gscRange.end).catch((err) => {
          errors.push(`GA4 pull failed (brief built without it): ${err instanceof Error ? err.message : String(err)}`);
          return null;
        })
      : Promise.resolve(null),
  ]);
  const payload = await getPayloadClient();
  const existing = await fetchExistingDocs(payload);
  const commentarySlugs = new Set(
    existing.filter((d) => d.collection === 'posts' && d.category === 'commentary').map((d) => d.slug),
  );
  const now = new Date();
  const result = await runLinkBrief({
    payload,
    grouped: groupByQuery(rows),
    existing,
    analyticsFor: (url) => (url && ga4 ? (ga4.get(normaliseGa4Path(url)) ?? null) : null),
    isExcludedPage: (url) => isCommentaryUrl(url, commentarySlugs),
    settings: opts.settings,
    weekIdentified: isoWeekLabel(now),
    runId: `campaign_${now.getTime()}`,
    dryRun: opts.dryRun,
    errors,
    notes: opts.notes,
  });
  return { ...result, errors, gscRange, ga4Joined: ga4 !== null };
}

export function isCommentaryUrl(url: string | undefined, commentarySlugs: Set<string>): boolean {
  if (!url) return false;
  const leaf = url.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() ?? '';
  return /\/notes\//.test(url) && commentarySlugs.has(leaf);
}

function linkOpportunity(
  c: LinkCandidate,
  draft: LinkTargetDraft,
  weekIdentified: string,
  existing: ExistingDoc[],
): LinkTargetOpportunity {
  const target = resolveTargetPage(c.page, existing);
  const targetDoc = target ? existing.find((d) => d.id === target.id) : undefined;
  const a = c.analytics;
  const ga = a
    ? ` GA4: ${a.sessions} sessions, ${Math.round(a.engagementRate * 100)}% engaged${a.keyEvents ? `, ${a.keyEvents} key events` : ''}.`
    : ' GA4: no data for this page.';
  return {
    type: 'link_target',
    query: c.key,
    // Per-page brief; intent is the page's commercial value, not a query intent.
    intent: 'commercial',
    weekIdentified,
    metrics: {
      impressions: c.impressions,
      clicks: c.clicks,
      ctr: c.impressions > 0 ? c.clicks / c.impressions : 0,
      position: Math.round(c.position * 10) / 10,
    },
    rationale:
      `Send ${draft.linksRequested} link${draft.linksRequested === 1 ? '' : 's'} at target DA ${draft.targetDa} (band ${draft.daBand.min}–${draft.daBand.max}). ` +
      `Ranks ${c.position.toFixed(1)} (impression-weighted) for ${c.queries.length} quer${c.queries.length === 1 ? 'y' : 'ies'} with ${c.impressions} impressions — in contention, needs authority.` +
      ga,
    targetPageSlug: targetDoc?.slug,
    targetPageId: target?.id,
    targetPageCollection: target?.collection,
    analytics: a,
    draftContent: draft,
  };
}

/** Plain-text brief for the agency (digest + campaign page share it). */
export function agencyBriefText(opps: LinkTargetOpportunity[], brief: LinkBriefResult['linkBrief']): string {
  if (opps.length === 0) return '';
  const head = `Backlink brief — ${brief.linksTotal} link${brief.linksTotal === 1 ? '' : 's'}${
    brief.averageTargetDa !== null ? `, average target DA ${brief.averageTargetDa}` : ''
  } (DA band ${brief.daBand.min}–${brief.daBand.max})`;
  const blocks = opps.map((o) => {
    const d = o.draftContent;
    return [
      `Page: ${d.pageUrl}`,
      `Links: ${d.linksRequested} at DA ~${d.targetDa}`,
      d.anchorPlan?.length
        ? `Anchor text: ${d.anchorPlan.map((t) => `"${t}"`).join(', ')}`
        : `Anchors: ${d.anchors.map((a) => `"${a.text}" ${a.share}%`).join(', ')}`,
      `Topic: ${d.queries.slice(0, 3).map((q) => q.query).join(', ')}`,
    ].join('\n');
  });
  return `${head}\n\n${blocks.join('\n\n')}`;
}
