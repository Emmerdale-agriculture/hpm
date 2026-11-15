/**
 * Outcome review — did the changes we shipped actually move anything?
 *
 * The agent had no feedback loop: it raised, Tom/Claude shipped or closed,
 * and nobody re-measured except by hand in the monthly review. This compares
 * each completed opportunity's metrics at raise time with the same query in
 * this run's GSC pull: one DB read, the rows already fetched, plus an exact
 * GSC lookup only for queries missing from that pull.
 *
 * Caveats the digest states alongside the table:
 *   - Seasonality: the "before" window is a different month. Position is the
 *     fairer signal; clicks/impressions swing with the season
 *     (brand query is ~0 Nov–Apr). Verdicts lean on position for that reason.
 *   - The main pull is capped at 1,000 query+page rows, so a query missing
 *     from it may just be small. Those are looked up one by one with an
 *     exact-match filter before being called "gone".
 *   - Recrawl lag: this site's pages can wait months for a recrawl, so a
 *     change under ~6 weeks old isn't judged at all.
 */

import { gscQuery } from '@/lib/gsc';
import type { getPayloadClient } from './persist';
import type { GscRowPlus, OpportunityType, OutcomeCheck } from './types';

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

const MIN_AGE_DAYS = 42;
const MAX_AGE_DAYS = 182;
/** Positions moved by at least this much count as a real change. */
const POSITION_DELTA = 2;

export async function reviewOutcomes(
  payload: Payload,
  grouped: GscRowPlus[],
  range: { start: string; end: string },
): Promise<OutcomeCheck[]> {
  const now = Date.now();
  const res = await payload.find({
    collection: 'seo-opportunities',
    where: {
      and: [
        { status: { equals: 'completed' } },
        { decidedAt: { greater_than: new Date(now - MAX_AGE_DAYS * 86_400_000).toISOString() } },
        { decidedAt: { less_than: new Date(now - MIN_AGE_DAYS * 86_400_000).toISOString() } },
      ],
    },
    sort: '-decidedAt',
    limit: 200,
    depth: 0,
  });

  const current = new Map(grouped.map((r) => [r.query, r]));
  const seen = new Set<string>();
  const out: OutcomeCheck[] = [];
  for (const d of res.docs) {
    const query = String(d.query);
    if (seen.has(query)) continue; // latest decision per query only
    seen.add(query);
    const before = {
      impressions: Number(d.metrics?.impressions ?? 0),
      clicks: Number(d.metrics?.clicks ?? 0),
      position: Number(d.metrics?.position ?? 0),
    };
    const row = current.get(query);
    let nowM: OutcomeCheck['now'] = row
      ? { impressions: row.impressions, clicks: row.clicks, position: row.position, page: row.page }
      : null;
    if (!nowM) {
      // Below the main pull's row cap? Ask for this query alone.
      let exact: Awaited<ReturnType<typeof gscQuery>>;
      try {
        exact = await gscQuery({
          startDate: range.start,
          endDate: range.end,
          dimensions: ['query'],
          filters: [{ dimension: 'query', expression: query }],
          rowLimit: 1,
        });
      } catch {
        continue; // can't tell flat from gone — leave it out rather than guess
      }
      const r = exact[0];
      if (r && r.impressions > 0) nowM = { impressions: r.impressions, clicks: r.clicks, position: r.position };
    }
    out.push({
      id: Number(d.id),
      query,
      type: d.type as OpportunityType,
      decidedAt: String(d.decidedAt),
      weekIdentified: String(d.weekIdentified),
      before,
      now: nowM,
      verdict: verdictFor(before, nowM),
    });
  }
  // Worst first: those are the ones that need a different approach.
  const order = { worse: 0, gone: 1, flat: 2, improved: 3 } as const;
  return out.sort((a, b) => order[a.verdict] - order[b.verdict]);
}

export function verdictFor(
  before: { clicks: number; position: number },
  now: { clicks: number; position: number } | null,
): OutcomeCheck['verdict'] {
  if (!now) return 'gone';
  // Lower position number = better ranking.
  const moved = before.position - now.position;
  if (before.position > 0 && moved >= POSITION_DELTA) return 'improved';
  if (before.position > 0 && moved <= -POSITION_DELTA) return 'worse';
  if (now.clicks >= before.clicks + 3 && now.clicks >= before.clicks * 1.5) return 'improved';
  return 'flat';
}
