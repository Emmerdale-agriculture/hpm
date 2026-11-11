/**
 * /api/tender-watch — daily council-contract scan.
 *
 * GET  — Vercel cron (vercel.json: 06:00 UTC daily). Open tenders +
 *        Find a Tender every day; the renewal sweep on Mondays only.
 * POST — manual trigger. Query flags:
 *          ?dryRun=1          report what would be created, write nothing
 *          ?since=2026-10-01  page Find a Tender back to this date (backfill)
 *          ?skipRenewals=1    skip the 5-year awarded-contract sweep
 *
 * Both require `Authorization: Bearer <CRON_SECRET>`.
 */

import { NextResponse } from 'next/server';
import { checkCronAuth } from '../seo-agent/lib/auth';
import { runTenderWatch, type WatchSummary } from '@/lib/tenders/watch';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function report(summary: WatchSummary) {
  return {
    ok: true,
    dryRun: summary.dryRun,
    fetched: summary.fetched,
    kept: summary.kept,
    updated: summary.updated,
    created: summary.created.map((c) => ({
      kind: c.kind,
      fit: c.fit,
      title: c.title,
      buyer: c.buyer,
      actionBy: c.actionBy?.slice(0, 10) ?? null,
      valueHigh: c.valueHigh,
      incumbent: c.incumbent,
      score: c.score,
      url: c.url,
    })),
    errors: summary.errors,
  };
}

export async function GET(req: Request) {
  const unauth = checkCronAuth(req);
  if (unauth) return unauth;
  try {
    const summary = await runTenderWatch({ skipRenewals: new Date().getUTCDay() !== 1 });
    if (summary.errors.length) console.warn('[tender-watch] errors:', summary.errors);
    return NextResponse.json(report(summary));
  } catch (err) {
    console.error('[tender-watch] run failed:', err);
    return NextResponse.json({ ok: false, error: 'internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const unauth = checkCronAuth(req);
  if (unauth) return unauth;
  const q = new URL(req.url).searchParams;
  const sinceParam = q.get('since');
  const since = sinceParam ? new Date(sinceParam) : undefined;
  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json({ ok: false, error: 'bad since date' }, { status: 400 });
  }
  try {
    const summary = await runTenderWatch({
      dryRun: q.get('dryRun') === '1',
      skipRenewals: q.get('skipRenewals') === '1',
      findATenderSince: since,
    });
    return NextResponse.json(report(summary));
  } catch (err) {
    console.error('[tender-watch] manual run failed:', err);
    return NextResponse.json({ ok: false, error: 'internal error' }, { status: 500 });
  }
}
