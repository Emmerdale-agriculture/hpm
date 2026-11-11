/**
 * Notice fetchers for the tender watch.
 *
 *  - Contracts Finder (contractsfinder.service.gov.uk) — below-threshold
 *    public contracts. Councils must publish here above ~£30k; this is where
 *    parish/town council grounds contracts appear. Also our source for the
 *    renewal pipeline (awarded notices carry contract end + supplier).
 *  - Find a Tender (find-tender.service.gov.uk) — above-threshold notices,
 *    and since the Procurement Act 2023 (Feb 2025) the central platform for
 *    pipeline/award notices. OCDS release packages, cursor-paginated.
 *
 * Both APIs are public and unauthenticated.
 */

import {
  SEARCH_KEYWORDS,
  LOCAL_REGIONS,
  decodeEntities,
  milesFromBase,
  postcodeIsLocal,
  RADIUS_MILES,
} from './match';

export interface RawNotice {
  source: 'contracts_finder' | 'find_a_tender';
  noticeId: string;
  /** open | pipeline | award (award = candidate renewal) */
  stage: 'open' | 'pipeline' | 'award';
  title: string;
  buyer: string;
  description: string;
  url: string;
  publishedAt: string | null;
  deadline: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  valueLow: number | null;
  valueHigh: number | null;
  supplier: string | null;
  postcode: string | null;
  distanceMiles: number | null;
  cpvCodes: string[];
}

const UA = { 'User-Agent': 'hpm-tender-watch/1.0', Accept: 'application/json' };

// ---------------------------------------------------------------------------
// Contracts Finder
// ---------------------------------------------------------------------------

interface CfItem {
  id: string;
  title: string;
  description?: string;
  organisationName?: string;
  noticeType?: string;
  noticeStatus?: string;
  publishedDate?: string;
  deadlineDate?: string;
  start?: string;
  end?: string;
  valueLow?: number;
  valueHigh?: number;
  awardedValue?: number;
  awardedSupplier?: string;
  postcode?: string;
  coordinates?: string;
  cpvCodes?: string;
}

const CF_PAGE = 1000;

async function cfSearch(
  criteria: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ items: CfItem[]; hitCount: number }> {
  const res = await fetch('https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json', {
    method: 'POST',
    headers: { ...UA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ searchCriteria: criteria, size: CF_PAGE }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Contracts Finder ${res.status}`);
  const json = (await res.json()) as { hitCount?: number; noticeList?: Array<{ item: CfItem }> };
  const items = (json.noticeList ?? []).map((n) => n.item);
  return { items, hitCount: json.hitCount ?? items.length };
}

function cfToRaw(it: CfItem): RawNotice | null {
  let distance: number | null = null;
  if (it.coordinates) {
    const [lat, lon] = it.coordinates.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon)) distance = Math.round(milesFromBase(lat, lon));
  }
  const local = distance !== null ? distance <= RADIUS_MILES : postcodeIsLocal(it.postcode);
  if (!local) return null;

  const status = (it.noticeStatus ?? '').toLowerCase();
  const type = (it.noticeType ?? '').toLowerCase();
  const stage: RawNotice['stage'] =
    status === 'awarded' || status === 'closed'
      ? 'award'
      : type === 'pipeline' || type === 'preprocurement'
        ? 'pipeline'
        : 'open';

  return {
    source: 'contracts_finder',
    noticeId: it.id,
    stage,
    title: decodeEntities(it.title),
    buyer: decodeEntities(it.organisationName),
    description: decodeEntities(it.description),
    url: `https://www.contractsfinder.service.gov.uk/Notice/${it.id}`,
    publishedAt: it.publishedDate ?? null,
    deadline: it.deadlineDate ?? null,
    contractStart: it.start ?? null,
    contractEnd: it.end ?? null,
    valueLow: it.valueLow || null,
    valueHigh: it.valueHigh || it.awardedValue || null,
    supplier: decodeEntities(it.awardedSupplier) || null,
    postcode: it.postcode?.toUpperCase() ?? null,
    distanceMiles: distance,
    cpvCodes: (it.cpvCodes ?? '').split(/\s+/).filter(Boolean),
  };
}

/**
 * One keyword over a published-date window, splitting the window in half
 * while CF reports more hits than it returned (it caps at CF_PAGE).
 *
 * CF has no working location filter (Nov 2026: `postcode` is a text match
 * on the buyer's postcode, `radius` and `regions` are ignored), so we pull
 * every phrase match nationally and apply the distance check locally.
 */
async function cfSearchWindowed(
  criteria: Record<string, unknown>,
  from: Date | null,
  to: Date | null,
  deadline: number,
  errors: string[],
  label: string,
): Promise<CfItem[]> {
  const left = deadline - Date.now();
  if (left < 10_000) throw new Error('time budget hit');
  const window = from && to
    ? { publishedFrom: from.toISOString().slice(0, 19), publishedTo: to.toISOString().slice(0, 19) }
    : {};
  const { items, hitCount } = await cfSearch({ ...criteria, ...window }, Math.min(120_000, left));
  if (hitCount <= items.length) return items;
  if (!from || !to || to.getTime() - from.getTime() < 14 * 86_400_000) {
    errors.push(`CF ${label} "${String(criteria.keyword)}": ${hitCount} hits, only ${items.length} returned (truncated)`);
    return items;
  }
  const mid = new Date((from.getTime() + to.getTime()) / 2);
  const a = await cfSearchWindowed(criteria, from, mid, deadline, errors, label);
  const b = await cfSearchWindowed(criteria, mid, to, deadline, errors, label);
  return [...a, ...b];
}

/**
 * Run every keyword search with modest concurrency; failures are reported,
 * not fatal. The API is slow on bad days (single queries >100s seen), so
 * the sweep stops starting new keywords once `budgetMs` is spent. Keyword
 * order rotates daily so a slow day doesn't always drop the same terms.
 */
async function cfKeywordSweep(
  criteria: Record<string, unknown>,
  window: { from: Date; to: Date } | null,
  errors: string[],
  label: string,
  budgetMs: number,
): Promise<RawNotice[]> {
  const out = new Map<string, RawNotice>();
  const deadline = Date.now() + budgetMs;
  const shift = Math.floor(Date.now() / 86_400_000) % SEARCH_KEYWORDS.length;
  const queue = [...SEARCH_KEYWORDS.slice(shift), ...SEARCH_KEYWORDS.slice(0, shift)];
  const skipped: string[] = [];
  const worker = async () => {
    for (let kw = queue.shift(); kw; kw = queue.shift()) {
      if (deadline - Date.now() < 10_000) {
        skipped.push(kw);
        continue;
      }
      try {
        const items = await cfSearchWindowed(
          { keyword: `"${kw}"`, ...criteria },
          window?.from ?? null,
          window?.to ?? null,
          deadline,
          errors,
          label,
        );
        for (const it of items) {
          const raw = cfToRaw(it);
          if (raw) out.set(raw.noticeId, raw);
        }
      } catch (e) {
        errors.push(`CF ${label} "${kw}": ${(e as Error).message}`);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (skipped.length) errors.push(`CF ${label}: time budget hit, skipped ${skipped.join(', ')}`);
  return [...out.values()];
}

/** Live tenders + early-warning notices (small hit counts — no window needed). */
export function fetchContractsFinderOpen(errors: string[], budgetMs = 120_000) {
  return cfKeywordSweep({ statuses: ['Open'] }, null, errors, 'open', budgetMs);
}

/** Awarded/closed notices from the last `years` years — the renewal pipeline. */
export function fetchContractsFinderAwards(errors: string[], years = 5, budgetMs = 200_000) {
  const to = new Date();
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - years);
  return cfKeywordSweep({ statuses: ['Awarded', 'Closed'] }, { from, to }, errors, 'awards', budgetMs);
}

// ---------------------------------------------------------------------------
// Find a Tender (OCDS)
// ---------------------------------------------------------------------------

interface OcdsAddress { postalCode?: string; region?: string }
interface OcdsRelease {
  id: string;
  ocid: string;
  tag?: string[];
  date?: string;
  parties?: Array<{ name?: string; roles?: string[]; address?: OcdsAddress }>;
  tender?: {
    title?: string;
    description?: string;
    classification?: { id?: string };
    items?: Array<{ deliveryAddresses?: OcdsAddress[]; additionalClassifications?: Array<{ id?: string }> }>;
    tenderPeriod?: { endDate?: string };
    contractPeriod?: { startDate?: string; endDate?: string };
    value?: { amount?: number };
    minValue?: { amount?: number };
  };
  awards?: Array<{
    suppliers?: Array<{ name?: string }>;
    value?: { amount?: number };
    contractPeriod?: { startDate?: string; endDate?: string };
  }>;
}

function ftsToRaw(r: OcdsRelease): RawNotice | null {
  const tags = r.tag ?? [];
  const stage: RawNotice['stage'] | null = tags.some((t) => t.startsWith('award') || t.startsWith('contract'))
    ? 'award'
    : tags.some((t) => t.startsWith('tender'))
      ? 'open'
      : tags.includes('planning')
        ? 'pipeline'
        : null;
  if (!stage) return null;

  const buyer = r.parties?.find((p) => p.roles?.includes('buyer'));
  const t = r.tender ?? {};
  const regions = (t.items ?? []).flatMap((i) => i.deliveryAddresses ?? []).map((a) => a.region ?? '');
  const local =
    regions.some((reg) => LOCAL_REGIONS.some((l) => reg.startsWith(l))) ||
    // No delivery region given → fall back to the buyer's own postcode.
    (regions.length === 0 && postcodeIsLocal(buyer?.address?.postalCode));
  if (!local) return null;

  const award = r.awards?.[0];
  const cpv = [
    t.classification?.id,
    ...(t.items ?? []).flatMap((i) => (i.additionalClassifications ?? []).map((c) => c.id)),
  ].filter((x): x is string => Boolean(x));

  return {
    source: 'find_a_tender',
    noticeId: r.id,
    stage,
    title: decodeEntities(t.title),
    buyer: decodeEntities(buyer?.name),
    description: decodeEntities(t.description),
    url: `https://www.find-tender.service.gov.uk/Notice/${r.id}`,
    publishedAt: r.date ?? null,
    deadline: t.tenderPeriod?.endDate ?? null,
    contractStart: award?.contractPeriod?.startDate ?? t.contractPeriod?.startDate ?? null,
    contractEnd: award?.contractPeriod?.endDate ?? t.contractPeriod?.endDate ?? null,
    valueLow: t.minValue?.amount ?? null,
    valueHigh: award?.value?.amount ?? t.value?.amount ?? null,
    supplier: award?.suppliers?.map((s) => s.name).filter(Boolean).join(', ') || null,
    postcode: buyer?.address?.postalCode?.toUpperCase() ?? null,
    distanceMiles: null,
    cpvCodes: cpv,
  };
}

/**
 * Every release updated since `since`. Find a Tender has no keyword or
 * location filter, so we page through everything (a few hundred releases
 * a day) and filter locally.
 *
 * The API is slow and flaky (observed Nov 2026: 504s after 10s, a 502
 * after 166s, 429s after ~30 unthrottled pages), so it gets a hard time
 * budget and returns whatever it managed to fetch. The cron runs daily
 * with a multi-day lookback, so a bad day is covered by the next run.
 */
export async function fetchFindATender(
  since: Date,
  errors: string[],
  budgetMs = 150_000,
): Promise<RawNotice[]> {
  const out: RawNotice[] = [];
  const deadline = Date.now() + budgetMs;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let url: string | null =
    `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=100&updatedFrom=${since
      .toISOString()
      .slice(0, 19)}`;
  let page = 0;
  let retries = 0;
  while (url) {
    const left = deadline - Date.now();
    if (left < 5_000) {
      errors.push(`Find a Tender: time budget hit after ${page} pages (partial — next run's lookback covers the rest)`);
      break;
    }
    try {
      const res: Response = await fetch(url, {
        headers: UA,
        signal: AbortSignal.timeout(Math.min(30_000, left)),
      });
      if ((res.status === 429 || res.status >= 500) && retries < 3) {
        retries++;
        const after = Number(res.headers.get('retry-after'));
        await sleep((Number.isFinite(after) && after > 0 ? after : 5 * retries) * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      retries = 0;
      const json = (await res.json()) as { releases?: OcdsRelease[]; links?: { next?: string } };
      for (const r of json.releases ?? []) {
        const raw = ftsToRaw(r);
        if (raw) out.push(raw);
      }
      page++;
      url = json.releases?.length ? (json.links?.next ?? null) : null;
      // Find a Tender rate-limits bursts.
      if (url) await sleep(750);
    } catch (e) {
      // Timeouts / network errors: retry like a 5xx while budget remains.
      if (retries < 3) {
        retries++;
        await sleep(5_000 * retries);
        continue;
      }
      errors.push(`Find a Tender page ${page}: ${(e as Error).message} (partial)`);
      break;
    }
  }
  return out;
}
