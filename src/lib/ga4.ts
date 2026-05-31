import { getGoogleAccessToken } from './gsc';

/**
 * Google Analytics 4 Data API client.
 *
 * Uses the same OAuth refresh token stored by the GSC connect flow —
 * the OAuth consent already requests `analytics.readonly`.
 *
 * Required env var: GA4_PROPERTY_ID (the numeric property id, NOT the
 * Measurement ID G-XXXXX. Find it in GA4 → Admin → Property settings.)
 */

export type Ga4Row = {
  dimensionValues: Array<{ value: string }>;
  metricValues: Array<{ value: string }>;
};

export type Ga4ReportArgs = {
  startDate: string;
  endDate: string;
  dimensions: string[];
  metrics: string[];
  rowLimit?: number;
  orderBy?: { metric: string; desc?: boolean };
};

export function isGa4Configured(): boolean {
  return Boolean(process.env.GA4_PROPERTY_ID);
}

export async function runGa4Report(args: Ga4ReportArgs): Promise<Ga4Row[]> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error('GA4_PROPERTY_ID not set');
  const token = await getGoogleAccessToken();

  const body: Record<string, unknown> = {
    dateRanges: [{ startDate: args.startDate, endDate: args.endDate }],
    dimensions: args.dimensions.map((name) => ({ name })),
    metrics: args.metrics.map((name) => ({ name })),
    limit: String(args.rowLimit ?? 100),
  };
  if (args.orderBy) {
    body.orderBys = [
      {
        metric: { metricName: args.orderBy.metric },
        desc: args.orderBy.desc ?? true,
      },
    ];
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    // Bound the call so a stalled GA4 upstream can't hang the request
    // (matches the timeouts used on every GSC call).
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`GA4 report failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { rows?: Ga4Row[] };
  return json.rows ?? [];
}

/** Build a path → { sessions, engagedSessions, avgSessionDuration } map. */
export async function fetchGa4PageMetrics(
  startDate: string,
  endDate: string,
): Promise<
  Map<
    string,
    { sessions: number; engagedSessions: number; avgSessionDuration: number }
  >
> {
  const rows = await runGa4Report({
    startDate,
    endDate,
    dimensions: ['pagePath'],
    metrics: ['sessions', 'engagedSessions', 'averageSessionDuration'],
    rowLimit: 500,
    orderBy: { metric: 'sessions', desc: true },
  });
  const out = new Map<
    string,
    { sessions: number; engagedSessions: number; avgSessionDuration: number }
  >();
  for (const r of rows) {
    const path = r.dimensionValues[0]?.value ?? '';
    out.set(path, {
      sessions: Number(r.metricValues[0]?.value ?? 0),
      engagedSessions: Number(r.metricValues[1]?.value ?? 0),
      avgSessionDuration: Number(r.metricValues[2]?.value ?? 0),
    });
  }
  return out;
}
