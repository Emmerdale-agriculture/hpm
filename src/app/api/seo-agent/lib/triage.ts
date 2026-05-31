/**
 * Triage — turn raw GSC rows into pipeline candidates.
 *
 * The classifier (Claude) is expensive, so we filter aggressively here
 * before sending anything for classification. The thresholds come from
 * the brief §4 (meta_rewrite, on_page_tweak, new_article triggers).
 */

import type { GscRowPlus, ClassifiedQuery, OpportunityType } from './types';
import { expectedCtrForPosition } from './types';

export type TriageVerdict =
  | { candidate: false; reason: string }
  | { candidate: true; suggestedType: OpportunityType; reason: string };

/**
 * Cheap pre-classification triage. Returns the strongest opportunity type
 * the row qualifies for, or rejects it. The Claude classifier still has
 * the final say on intent and may downgrade to skip.
 */
export function triageRow(row: GscRowPlus): TriageVerdict {
  const { impressions, position, ctr } = row;

  // Meta rewrite: ranks well, CTR below benchmark
  if (position >= 1 && position <= 5 && impressions >= 30) {
    const expected = expectedCtrForPosition(position);
    if (expected && ctr < expected * 0.7) {
      return {
        candidate: true,
        suggestedType: 'meta_rewrite',
        reason: `pos ${position.toFixed(1)}, CTR ${(ctr * 100).toFixed(1)}% vs expected ${(expected * 100).toFixed(0)}%`,
      };
    }
  }

  // On-page tweak: striking distance. Starts at position 5 to close the
  // gap with meta_rewrite (≤5) — positions 6–7 are bottom-of-page-1 and
  // worth tweaking. Impressions threshold matches the other buckets at
  // 30; 50 was inconsistent and silently dropped striking-distance
  // candidates.
  if (position > 5 && position <= 20 && impressions >= 30) {
    return {
      candidate: true,
      suggestedType: 'on_page_tweak',
      reason: `striking distance: pos ${position.toFixed(1)}, ${impressions} imp`,
    };
  }

  // New article: weak/no ranking with demand. Bands are disjoint with the
  // on_page_tweak branch above (which claims position ≤ 20), so position 20
  // is a tweak and anything beyond it is a new-article candidate.
  if (position > 20 && impressions >= 30) {
    return {
      candidate: true,
      suggestedType: 'new_article',
      reason: `low rank: pos ${position.toFixed(1)}, ${impressions} imp`,
    };
  }

  return { candidate: false, reason: 'no trigger matched' };
}

/** Score for ranking new_article candidates (used for the 3/week cap). */
export function articleScore(row: { impressions: number; position: number }): number {
  return row.impressions * (1 / Math.max(row.position, 1));
}

/**
 * Group raw GSC rows by query (taking the best-ranking page per query as
 * the canonical "page" for that query). GSC returns multiple rows per
 * query when several pages rank for it — we want the strongest one.
 */
export function groupByQuery(rows: Array<{ keys?: string[] } & Omit<GscRowPlus, 'query' | 'page'>>): GscRowPlus[] {
  const byQuery = new Map<string, GscRowPlus>();
  for (const r of rows) {
    const query = r.keys?.[0];
    if (!query) continue;
    const page = r.keys?.[1];
    const existing = byQuery.get(query);
    // Keep the row with the lowest (best) position for this query.
    if (!existing || r.position < existing.position) {
      byQuery.set(query, {
        query,
        page,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      });
    }
  }
  return Array.from(byQuery.values());
}

/**
 * Strip queries that mention competitor brand names. Brief §10:
 * "Skip. Do not generate content targeting competitor brand queries."
 *
 * Tom can extend this list as competitors surface in GSC data. Each entry
 * is matched as a whole word (case-insensitive) so a short term like "ag"
 * won't false-positive on every query containing "agriculture".
 */
const COMPETITOR_TERMS: string[] = [
  // Add real competitor names here as we identify them in GSC data.
];

export function isCompetitorQuery(query: string): boolean {
  if (COMPETITOR_TERMS.length === 0) return false;
  const q = query.toLowerCase();
  return COMPETITOR_TERMS.some((term) => {
    const re = new RegExp(`\\b${term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return re.test(q);
  });
}

/** Filter a list of triaged rows by the given verdict-narrowing predicate. */
export function attachClassification(
  row: GscRowPlus,
  classification: ClassifiedQuery['classification'],
): ClassifiedQuery {
  return {
    query: row.query,
    page: row.page,
    metrics: {
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: row.ctr,
      position: row.position,
    },
    classification,
  };
}
