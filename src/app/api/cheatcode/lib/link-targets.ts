/**
 * Link targets — the monthly brief for the external backlink agency.
 *
 * The agency builds the links and owns their Domain Authority. Cheatcode's
 * job is to say WHICH of our pages the links should point at, how many each,
 * the DA to aim for (inside the band set in Cheatcode settings), and the
 * anchor text — all derived from GSC/GA4 numbers, no model call, so nothing
 * here is invented.
 *
 * A page qualifies when it is already in contention but not winning:
 *   - it is the primary page for queries at position 4–20 (page 1 bottom
 *     to page 2 — where authority moves rank), each with ≥10 impressions
 *     and ≥30 across the page;
 *   - the query is NOT split across several of our URLs (links into a
 *     cannibalised query feed the confusion; fix ownership first);
 *   - it isn't a commentary post (not the business), a utility page
 *     (/contact, /privacy…), and the query isn't a brand search;
 *   - GA4 doesn't show visitors bouncing off it (≥10 sessions and under
 *     35% engaged): more traffic to a page that loses people is wasted
 *     spend, so those are reported as "fix the page first" instead.
 */

import type { GscRowPlus, LinkTargetDraft, PageAnalytics } from './types';

export type LinkSettings = {
  daMin: number;
  daMax: number;
  linksPerMonth: number;
  maxLinkPages: number;
};

export const DEFAULT_LINK_SETTINGS: LinkSettings = {
  daMin: 30,
  daMax: 40,
  linksPerMonth: 10,
  maxLinkPages: 3,
};

/** Clamp/repair whatever the admin global holds into a usable band. */
export function normaliseLinkSettings(raw: Partial<Record<keyof LinkSettings, unknown>> | null | undefined): LinkSettings {
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  let daMin = Math.max(0, Math.min(100, num(raw?.daMin, DEFAULT_LINK_SETTINGS.daMin)));
  let daMax = Math.max(0, Math.min(100, num(raw?.daMax, DEFAULT_LINK_SETTINGS.daMax)));
  if (daMin > daMax) [daMin, daMax] = [daMax, daMin];
  return {
    daMin,
    daMax,
    linksPerMonth: Math.max(0, Math.round(num(raw?.linksPerMonth, DEFAULT_LINK_SETTINGS.linksPerMonth))),
    maxLinkPages: Math.max(1, Math.min(10, Math.round(num(raw?.maxLinkPages, DEFAULT_LINK_SETTINGS.maxLinkPages)))),
  };
}

const MIN_POSITION = 3.5; // rounds to 4: positions 1–3 already get the clicks
const MAX_POSITION = 20;
/** A query counts toward a page at ≥10 impressions; the page needs ≥30 in total. */
const MIN_QUERY_IMPRESSIONS = 10;
const MIN_IMPRESSIONS = 30;
/** GA4 gate: below this engagement rate, with enough sessions to judge, fix the page first. */
const LOW_ENGAGEMENT_RATE = 0.35;
const MIN_SESSIONS_TO_JUDGE = 10;

const BRAND_ANCHOR = 'Hampshire Paddock Management';

/**
 * Brand/navigational searches: people looking for us (or Tom's other
 * ventures) by name. Links don't win those, and in Nov 2026 they put
 * /contact ("emmerdale agriculture") at the top of the brief.
 */
const BRAND_QUERY = /\b(emmerdale|hampshire paddock management|hpm|lumenira|clickasnap|videscape|oswald)\b/i;

/** Pages that never deserve a paid link: they rank for brand, not topics. */
const UTILITY_PATH = /^\/(contact|privacy|privacy-policy|terms|cookies|cookie-policy|thank-you|thanks|admin|api)(\/|$)/i;

export function isBrandQuery(q: string): boolean {
  return BRAND_QUERY.test(q);
}

export type LinkCandidate = {
  page: string;
  path: string;
  /** Opportunity key: link targets are per page, so the cooldown is per page. */
  key: string;
  queries: Array<{ query: string; impressions: number; clicks: number; position: number }>;
  impressions: number;
  clicks: number;
  /** Impression-weighted position across the qualifying queries. */
  position: number;
  score: number;
  analytics: PageAnalytics | null;
};

export function linkTargetKey(path: string): string {
  return `links → ${path}`;
}

function pathOf(url: string): string {
  try {
    const p = new URL(url).pathname;
    return p.length > 1 ? p.replace(/\/+$/, '') : p;
  } catch {
    return url;
  }
}

/**
 * Rank every page that qualifies, best first. Pages GA4 says lose their
 * visitors come back separately so the digest can say why they were skipped.
 */
export function rankLinkCandidates(
  rows: GscRowPlus[],
  opts: {
    isExcludedPage: (url: string) => boolean;
    isExcludedQuery: (query: string) => boolean;
    analyticsFor: (url: string) => PageAnalytics | null;
  },
): { ranked: LinkCandidate[]; lowEngagement: LinkCandidate[] } {
  const byPage = new Map<string, LinkCandidate>();
  for (const r of rows) {
    if (!r.page) continue;
    if (r.position < MIN_POSITION || r.position > MAX_POSITION) continue;
    if (r.impressions < MIN_QUERY_IMPRESSIONS) continue;
    if (r.otherPages?.length) continue; // split query — ownership first
    if (opts.isExcludedQuery(r.query) || opts.isExcludedPage(r.page)) continue;
    if (isBrandQuery(r.query)) continue;
    const path = pathOf(r.page);
    if (UTILITY_PATH.test(path)) continue;
    const c =
      byPage.get(r.page) ??
      ({
        page: r.page,
        path,
        key: linkTargetKey(path),
        queries: [],
        impressions: 0,
        clicks: 0,
        position: 0,
        score: 0,
        analytics: null,
      } satisfies LinkCandidate);
    c.queries.push({ query: r.query, impressions: r.impressions, clicks: r.clicks, position: r.position });
    // Payoff: demand × how close to the top it already sits (pos 4 ≈ 1, pos 20 ≈ 0.06).
    c.score += r.impressions * ((MAX_POSITION + 1 - r.position) / (MAX_POSITION + 1 - 4));
    byPage.set(r.page, c);
  }

  const ranked: LinkCandidate[] = [];
  const lowEngagement: LinkCandidate[] = [];
  for (const c of byPage.values()) {
    if (c.queries.reduce((s, q) => s + q.impressions, 0) < MIN_IMPRESSIONS) continue;
    c.queries.sort((a, b) => b.impressions - a.impressions);
    c.impressions = c.queries.reduce((s, q) => s + q.impressions, 0);
    c.clicks = c.queries.reduce((s, q) => s + q.clicks, 0);
    c.position = c.queries.reduce((s, q) => s + q.position * q.impressions, 0) / Math.max(c.impressions, 1);
    c.analytics = opts.analyticsFor(c.page);
    const a = c.analytics;
    if (a && a.sessions >= MIN_SESSIONS_TO_JUDGE && a.engagementRate < LOW_ENGAGEMENT_RATE) {
      lowEngagement.push(c);
    } else {
      ranked.push(c);
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  lowEngagement.sort((a, b) => b.score - a.score);
  return { ranked, lowEngagement };
}

/**
 * Where in the DA band a page's links should sit, 0 (easy) → 1 (hard):
 * 60% how far down it ranks (pos 4 → 0, pos 20 → 1), 40% how much demand
 * it competes for (30 imp → 0, 900+ imp → 1, log scale).
 */
export function difficulty(position: number, impressions: number): number {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const rank = clamp((position - 4) / (MAX_POSITION - 4));
  const demand = clamp(Math.log(Math.max(impressions, 1) / MIN_IMPRESSIONS) / Math.log(30));
  return 0.6 * rank + 0.4 * demand;
}

export function targetDaFor(c: Pick<LinkCandidate, 'position' | 'impressions'>, s: LinkSettings): number {
  return Math.round(s.daMin + difficulty(c.position, c.impressions) * (s.daMax - s.daMin));
}

/** Split `total` links across candidates by score (largest remainder, ≥1 each). */
export function allocateLinks(scores: number[], total: number): number[] {
  if (scores.length === 0 || total <= 0) return scores.map(() => 0);
  const n = Math.min(scores.length, total);
  const out = scores.map((_, i) => (i < n ? 1 : 0));
  let left = total - n;
  if (left <= 0) return out;
  const sum = scores.slice(0, n).reduce((a, b) => a + b, 0) || 1;
  const exact = scores.slice(0, n).map((s) => (s / sum) * left);
  const floors = exact.map(Math.floor);
  floors.forEach((f, i) => (out[i] += f));
  left -= floors.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < left; k++) out[order[k % order.length][1]]++;
  return out;
}

/**
 * Anchor mix. Mostly branded/URL so the profile stays natural; one exact
 * match on the lead query and partials on the next queries. Shares are
 * percentages of this page's links and sum to 100.
 */
export function anchorsFor(c: LinkCandidate): LinkTargetDraft['anchors'] {
  const lead = c.queries[0]?.query;
  // Skip word-order variants of an anchor already used ("pipe laying mole
  // plough" vs "mole plough pipe laying") — same anchor to Google.
  const bag = (t: string) => t.toLowerCase().split(/\s+/).sort().join(' ');
  const seen = new Set(lead ? [bag(lead)] : []);
  const partials: string[] = [];
  for (const q of c.queries.slice(1)) {
    if (partials.length >= 2) break;
    if (seen.has(bag(q.query))) continue;
    seen.add(bag(q.query));
    partials.push(q.query);
  }
  const anchors: LinkTargetDraft['anchors'] = [];
  if (lead) anchors.push({ text: lead, kind: 'exact', share: 20 });
  if (partials.length) {
    const each = Math.floor(20 / partials.length);
    partials.forEach((p) => anchors.push({ text: p, kind: 'partial', share: each }));
  }
  const used = anchors.reduce((s, a) => s + a.share, 0);
  const url = 20;
  anchors.push({ text: BRAND_ANCHOR, kind: 'branded', share: 100 - used - url });
  anchors.push({ text: `hampshirepaddockmanagement.com${c.path === '/' ? '' : c.path}`, kind: 'url', share: url });
  return anchors;
}

export function buildLinkDraft(c: LinkCandidate, links: number, s: LinkSettings): LinkTargetDraft {
  return {
    pageUrl: c.page,
    leadQuery: c.queries[0]?.query ?? '',
    queries: c.queries.slice(0, 8),
    linksRequested: links,
    targetDa: targetDaFor(c, s),
    daBand: { min: s.daMin, max: s.daMax },
    anchors: anchorsFor(c),
  };
}

/** Links-weighted average target DA; null when no links were requested. */
export function averageTargetDa(drafts: Array<Pick<LinkTargetDraft, 'linksRequested' | 'targetDa'>>): number | null {
  const links = drafts.reduce((s, d) => s + d.linksRequested, 0);
  if (links === 0) return null;
  return Math.round((drafts.reduce((s, d) => s + d.targetDa * d.linksRequested, 0) / links) * 10) / 10;
}
