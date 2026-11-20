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

/**
 * The GA4 property is shared with emmerdaleagriculture.com, which sends ~10×
 * the traffic and has many of the same paths ("/", "/services",
 * "/paddock-maintenance"...). Every report is therefore filtered to this
 * site's hostname, or per-path numbers silently mix both sites.
 *
 * Host comes from GA4_HOSTNAME if set, else from GSC_SITE_URL
 * ("sc-domain:example.com" or "https://example.com/").
 */
export function ga4Hostname(): string {
  const explicit = process.env.GA4_HOSTNAME?.trim();
  if (explicit) return explicit.replace(/^www\./, '');
  const site = process.env.GSC_SITE_URL ?? '';
  const host = site.startsWith('sc-domain:')
    ? site.slice('sc-domain:'.length)
    : (() => {
        try {
          return new URL(site).hostname;
        } catch {
          return '';
        }
      })();
  const clean = host.trim().replace(/^www\./, '');
  if (!clean) throw new Error('GA4 host unknown: set GA4_HOSTNAME or GSC_SITE_URL');
  return clean;
}

export async function runGa4Report(args: Ga4ReportArgs): Promise<Ga4Row[]> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error('GA4_PROPERTY_ID not set');
  const host = ga4Hostname();
  const token = await getGoogleAccessToken();

  const body: Record<string, unknown> = {
    dateRanges: [{ startDate: args.startDate, endDate: args.endDate }],
    dimensions: args.dimensions.map((name) => ({ name })),
    metrics: args.metrics.map((name) => ({ name })),
    limit: String(args.rowLimit ?? 100),
    dimensionFilter: {
      filter: {
        fieldName: 'hostName',
        inListFilter: { values: [host, `www.${host}`] },
      },
    },
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

export type Ga4PageEngagement = {
  sessions: number;
  engagedSessions: number;
  /** engagedSessions / sessions, 0–1. */
  engagementRate: number;
  /** Seconds. */
  avgSessionDuration: number;
  /** GA4 key events (conversions) on the page; 0 if none are configured. */
  keyEvents: number;
};

/**
 * Per-path engagement for the Cheatcode agent: sessions, engagement rate,
 * average session duration and key events, keyed by pagePath. Paths are
 * normalised without a trailing slash (except "/") so they join cleanly
 * against GSC URLs.
 */
export async function fetchGa4PageEngagement(
  startDate: string,
  endDate: string,
): Promise<Map<string, Ga4PageEngagement>> {
  const rows = await runGa4Report({
    startDate,
    endDate,
    dimensions: ['pagePath'],
    metrics: ['sessions', 'engagedSessions', 'averageSessionDuration', 'keyEvents'],
    rowLimit: 1000,
    orderBy: { metric: 'sessions', desc: true },
  });
  const out = new Map<string, Ga4PageEngagement>();
  for (const r of rows) {
    const path = normaliseGa4Path(r.dimensionValues[0]?.value ?? '');
    const sessions = Number(r.metricValues[0]?.value ?? 0);
    const engagedSessions = Number(r.metricValues[1]?.value ?? 0);
    const avg = Number(r.metricValues[2]?.value ?? 0);
    const keyEvents = Number(r.metricValues[3]?.value ?? 0);
    // "/x" and "/x/" can both appear; merge them.
    const prev = out.get(path);
    const s = (prev?.sessions ?? 0) + sessions;
    const e = (prev?.engagedSessions ?? 0) + engagedSessions;
    out.set(path, {
      sessions: s,
      engagedSessions: e,
      engagementRate: s > 0 ? e / s : 0,
      avgSessionDuration: s > 0 ? ((prev?.avgSessionDuration ?? 0) * (prev?.sessions ?? 0) + avg * sessions) / s : 0,
      keyEvents: (prev?.keyEvents ?? 0) + keyEvents,
    });
  }
  return out;
}

/** "/services/x/?utm=y" or "https://host/services/x/" → "/services/x". */
export function normaliseGa4Path(urlOrPath: string): string {
  let p = urlOrPath;
  try {
    p = new URL(urlOrPath).pathname;
  } catch {
    p = urlOrPath.replace(/[?#].*$/, '');
  }
  if (!p.startsWith('/')) p = `/${p}`;
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}
