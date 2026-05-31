import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getPayload } from 'payload';
import config from '@payload-config';

import { gscQuery, isoDaysAgo, type GscRow } from '@/lib/gsc';

export const dynamic = 'force-dynamic';

const RANGE_DAYS = 28;
const TIMESERIES_DAYS = 90;
const GSC_LAG_DAYS = 3;

/**
 * /admin-stats/export/{file}
 *
 * Returns text/csv for one of:
 *   queries.csv                  — full long tail
 *   queries-almost-there.csv     — positions 4–10 by impressions
 *   queries-ctr-opps.csv         — high-impression below-median CTR
 *   pages.csv                    — every URL clicks/impressions/ctr/pos
 *   timeseries.csv               — daily clicks + impressions over 90d
 *
 * Auth: Payload session cookie (same as the admin-stats pages).
 */

function escape(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCsv(headerRow: string[], rows: (string | number)[][]): string {
  const lines = [headerRow.map(escape).join(',')];
  for (const r of rows) lines.push(r.map(escape).join(','));
  return lines.join('\n') + '\n';
}

function csvResponse(filename: string, body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ file: string }> },
) {
  const payload = await getPayload({ config });
  const h = await headers();
  const { user } = await payload.auth({ headers: h });
  if (!user) {
    return NextResponse.redirect(
      new URL('/admin/login?redirect=/admin-stats', req.url),
    );
  }

  const { file } = await ctx.params;
  const endDate = isoDaysAgo(GSC_LAG_DAYS);
  const startDate = isoDaysAgo(GSC_LAG_DAYS + RANGE_DAYS);

  try {
    if (file === 'queries.csv') {
      const rows = await gscQuery({
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 1000,
      });
      const sorted = [...rows].sort((a, b) => b.clicks - a.clicks);
      return csvResponse(
        file,
        toCsv(
          ['query', 'clicks', 'impressions', 'ctr', 'position'],
          sorted.map((r) => [
            r.keys?.[0] ?? '',
            r.clicks,
            r.impressions,
            r.ctr,
            r.position,
          ]),
        ),
      );
    }

    if (file === 'queries-almost-there.csv') {
      const rows = await gscQuery({
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 500,
      });
      const filtered = rows
        .filter((r) => r.position >= 4 && r.position <= 10 && r.impressions > 0)
        .sort((a, b) => b.impressions - a.impressions);
      return csvResponse(
        file,
        toCsv(
          ['query', 'clicks', 'impressions', 'ctr', 'position'],
          filtered.map((r) => [
            r.keys?.[0] ?? '',
            r.clicks,
            r.impressions,
            r.ctr,
            r.position,
          ]),
        ),
      );
    }

    if (file === 'queries-ctr-opps.csv') {
      const rows = await gscQuery({
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 500,
      });
      const positiveImpr = rows.filter((r: GscRow) => r.impressions > 0);
      const sortedCtr = [...positiveImpr]
        .map((r) => r.ctr)
        .sort((a, b) => a - b);
      const median = sortedCtr.length
        ? sortedCtr[Math.floor(sortedCtr.length / 2)] ?? 0
        : 0;
      const opps = positiveImpr
        .filter((r) => r.impressions >= 25 && r.ctr < median)
        .sort((a, b) => b.impressions - a.impressions);
      return csvResponse(
        file,
        toCsv(
          ['query', 'impressions', 'ctr', 'position', 'median_ctr'],
          opps.map((r) => [
            r.keys?.[0] ?? '',
            r.impressions,
            r.ctr,
            r.position,
            median,
          ]),
        ),
      );
    }

    if (file === 'pages.csv') {
      const rows = await gscQuery({
        startDate,
        endDate,
        dimensions: ['page'],
        rowLimit: 1000,
      });
      const sorted = [...rows].sort((a, b) => b.clicks - a.clicks);
      return csvResponse(
        file,
        toCsv(
          ['url', 'clicks', 'impressions', 'ctr', 'position'],
          sorted.map((r) => [
            r.keys?.[0] ?? '',
            r.clicks,
            r.impressions,
            r.ctr,
            r.position,
          ]),
        ),
      );
    }

    if (file === 'timeseries.csv') {
      const tsStart = isoDaysAgo(GSC_LAG_DAYS + TIMESERIES_DAYS);
      const rows = await gscQuery({
        startDate: tsStart,
        endDate,
        dimensions: ['date'],
        rowLimit: 1000,
      });
      const sorted = [...rows].sort((a, b) =>
        (a.keys?.[0] ?? '').localeCompare(b.keys?.[0] ?? ''),
      );
      return csvResponse(
        file,
        toCsv(
          ['date', 'clicks', 'impressions', 'ctr', 'position'],
          sorted.map((r) => [
            r.keys?.[0] ?? '',
            r.clicks,
            r.impressions,
            r.ctr,
            r.position,
          ]),
        ),
      );
    }

    return NextResponse.json({ error: 'unknown export' }, { status: 404 });
  } catch (err) {
    // Log the real error server-side; don't echo upstream text (which can
    // include the site URL, token/quota details, etc.) back to the client.
    console.error('[admin-stats/export] failed:', err);
    return NextResponse.json({ error: 'export failed' }, { status: 502 });
  }
}
