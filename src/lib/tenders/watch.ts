/**
 * Tender watch — fetch, score, dedupe and upsert into the `tenders` collection.
 *
 * Ownership rule: the watcher creates rows and refreshes *factual* fields
 * (dates, values, incumbent, url). It never touches status / fit / notes /
 * actionBy once a human could have edited them — except to move a row from
 * open → renewal when the contract it tracks gets awarded.
 */

import { getPayload } from 'payload';
import config from '@payload-config';
import {
  addMonths,
  contractKey,
  MIN_SCORE,
  RENEWAL_LEAD_MONTHS,
  scoreRelevance,
  type Fit,
} from './match';
import {
  fetchContractsFinderAwards,
  fetchContractsFinderOpen,
  fetchFindATender,
  type RawNotice,
} from './sources';

type Kind = 'open' | 'pipeline' | 'renewal' | 'lead';

export interface Candidate {
  sourceKey: string;
  kind: Kind;
  fit: Fit | 'subcontract';
  title: string;
  buyer: string;
  description: string;
  url: string;
  source: RawNotice['source'] | 'manual';
  publishedAt: string | null;
  deadline: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  actionBy: string | null;
  valueLow: number | null;
  valueHigh: number | null;
  incumbent: string | null;
  postcode: string | null;
  distanceMiles: number | null;
  cpv: string;
  matched: string;
  score: number;
}

export interface WatchSummary {
  dryRun: boolean;
  fetched: { contractsFinderOpen: number; contractsFinderAwards: number; findATender: number };
  kept: { open: number; pipeline: number; renewal: number; lead: number };
  created: Candidate[];
  updated: number;
  errors: string[];
}

/**
 * Framework holders to approach for subcontract work. HCC's Grounds
 * Maintenance Framework 2025–29 (£15–21m, awarded Apr 2025) went to these
 * three; nobody else can be appointed to it until it's re-let for 2029.
 */
const LEADS: Candidate[] = [
  'General Farming & Contracting Ltd',
  "John O'Conner (GM) Ltd",
  'Scandor Landscape Contractors Ltd',
].map((name) => ({
  sourceKey: `lead:hcc-gm-framework-2025:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  kind: 'lead',
  fit: 'subcontract',
  title: `Subcontract to ${name} — HCC Grounds Maintenance Framework 2025–29`,
  buyer: name,
  description:
    `${name} holds a place on Hampshire County Council's Grounds Maintenance Framework 2025–2029 ` +
    '(grass cutting, hedge & border maintenance, weed control for HCC, schools and other local authorities; ' +
    '£15–21m over 4 years). Pitch HPM as a rural subcontractor: flailing, hedge cutting, topping, ditching, ' +
    'spraying (NPTC PA1/PA6), mole ploughing. Best approached before the spring cutting season.',
  url: 'https://www.contractsfinder.service.gov.uk/Notice/80ccb322-0200-4a22-ba83-1a2d7ab5a111',
  source: 'manual',
  publishedAt: '2025-04-23T00:00:00Z',
  deadline: null,
  contractStart: '2025-04-01T00:00:00Z',
  contractEnd: '2029-03-31T00:00:00Z',
  actionBy: '2027-01-15T00:00:00Z',
  valueLow: null,
  valueHigh: null,
  incumbent: name,
  postcode: null,
  distanceMiles: null,
  cpv: '77314000',
  matched: 'manual lead',
  score: 0,
}));

function toCandidate(n: RawNotice, now: Date): Candidate | null {
  const rel = scoreRelevance(n.title, n.description, n.cpvCodes);
  if (rel.score < MIN_SCORE) return null;

  let kind: Kind;
  let actionBy: string | null;
  if (n.stage === 'award') {
    // Only contracts still running are worth tracking for renewal.
    if (!n.contractEnd || new Date(n.contractEnd) < now) return null;
    kind = 'renewal';
    actionBy = addMonths(new Date(n.contractEnd), -RENEWAL_LEAD_MONTHS).toISOString();
  } else {
    // Contracts Finder keeps some "Open" notices whose deadline has passed.
    if (n.deadline && new Date(n.deadline) < now) return null;
    kind = n.stage;
    actionBy = n.deadline;
  }

  return {
    sourceKey: contractKey(n.buyer, n.title),
    kind,
    fit: rel.fit,
    title: n.title.slice(0, 300),
    buyer: n.buyer,
    description: n.description.slice(0, 4000),
    url: n.url,
    source: n.source,
    publishedAt: n.publishedAt,
    deadline: n.deadline,
    contractStart: n.contractStart,
    contractEnd: n.contractEnd,
    actionBy,
    valueLow: n.valueLow,
    valueHigh: n.valueHigh,
    incumbent: n.supplier,
    postcode: n.postcode,
    distanceMiles: n.distanceMiles,
    cpv: n.cpvCodes.join(' ').slice(0, 300),
    matched: rel.matched.join(', ').slice(0, 500),
    score: rel.score,
  };
}

/**
 * Merge candidates that describe the same contract (tender + closed +
 * award notices). Prefer open over renewal (live beats historical), then
 * whichever has a supplier, then the most recently published.
 */
function dedupe(cands: Candidate[]): Candidate[] {
  const rank = (c: Candidate) =>
    (c.kind === 'open' ? 4 : c.kind === 'pipeline' ? 3 : 0) + (c.incumbent ? 1 : 0);
  const best = new Map<string, Candidate>();
  for (const c of cands) {
    const prev = best.get(c.sourceKey);
    if (
      !prev ||
      rank(c) > rank(prev) ||
      (rank(c) === rank(prev) && (c.publishedAt ?? '') > (prev.publishedAt ?? ''))
    ) {
      best.set(c.sourceKey, { ...c, incumbent: c.incumbent ?? prev?.incumbent ?? null });
    }
  }
  return [...best.values()];
}

type ExistingTender = {
  kind: Kind;
  status: string;
  actionBy?: string | null;
  deadline?: string | null;
  publishedAt?: string | null;
};

/**
 * Decide what to write onto an existing row for a freshly-seen candidate.
 * Returns null when there is nothing to do.
 *
 * Rows are keyed on buyer + title, and parishes reuse titles every term
 * ("Grounds Maintenance Contract"), so one row tracks a contract across
 * re-lets:  renewal → open (re-tendered) → renewal (awarded) → …
 *
 *  - A candidate published BEFORE what the row already holds is stale (e.g.
 *    the previous term's award notice, re-seen by the Monday sweep while the
 *    new tender is live) — ignored, so the row can't flap back.
 *  - renewal → open/pipeline: the re-let is out. Kind + actionBy follow it,
 *    and a 'watching' row becomes 'new' so it lands in the badge count.
 *  - open/pipeline → renewal: awarded. Same, 'new' becomes 'watching'.
 *  - Same kind: an open tender's actionBy follows a deadline extension unless
 *    someone set actionBy by hand (i.e. it no longer equals the old deadline).
 *  - Factual fields only overwrite with non-empty values.
 */
export function transition(
  doc: ExistingTender,
  c: Candidate,
  factual: Record<string, unknown>,
): Record<string, unknown> | null {
  const t = (d?: string | null) => (d ? Date.parse(d) : NaN);
  if (t(c.publishedAt) < t(doc.publishedAt)) return null;

  const data: Record<string, unknown> = Object.fromEntries(
    Object.entries(factual).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  );

  const live = (k: Kind) => k === 'open' || k === 'pipeline';
  if (doc.kind === 'renewal' && live(c.kind)) {
    data.kind = c.kind;
    data.actionBy = c.actionBy;
    if (doc.status === 'watching') data.status = 'new';
  } else if (live(doc.kind) && c.kind === 'renewal') {
    data.kind = 'renewal';
    data.actionBy = c.actionBy;
    if (doc.status === 'new') data.status = 'watching';
  } else if (live(doc.kind) && live(c.kind)) {
    if (c.kind !== doc.kind) data.kind = c.kind;
    const untouched = !doc.actionBy || t(doc.actionBy) === t(doc.deadline);
    if (untouched && c.actionBy && t(c.actionBy) !== t(doc.actionBy)) data.actionBy = c.actionBy;
  }
  return data;
}

export interface WatchOptions {
  dryRun?: boolean;
  /** How far back to page Find a Tender. Default 3 days (daily cron + overlap for flaky days). */
  findATenderSince?: Date;
  /** Skip the 5-year awarded-contract sweep (renewals change slowly — the cron runs it Mondays only). */
  skipRenewals?: boolean;
}

export async function runTenderWatch(opts: WatchOptions = {}): Promise<WatchSummary> {
  const now = new Date();
  const errors: string[] = [];
  const since = opts.findATenderSince ?? new Date(now.getTime() - 3 * 86_400_000);

  const [cfOpen, cfAwards, fts] = await Promise.all([
    fetchContractsFinderOpen(errors),
    opts.skipRenewals ? Promise.resolve([]) : fetchContractsFinderAwards(errors),
    fetchFindATender(since, errors),
  ]);

  const candidates = dedupe([
    ...[...cfOpen, ...cfAwards, ...fts]
      .map((n) => toCandidate(n, now))
      .filter((c): c is Candidate => c !== null),
    ...LEADS,
  ]);

  const summary: WatchSummary = {
    dryRun: Boolean(opts.dryRun),
    fetched: {
      contractsFinderOpen: cfOpen.length,
      contractsFinderAwards: cfAwards.length,
      findATender: fts.length,
    },
    kept: { open: 0, pipeline: 0, renewal: 0, lead: 0 },
    created: [],
    updated: 0,
    errors,
  };
  for (const c of candidates) summary.kept[c.kind]++;

  const payload = await getPayload({ config });
  const existing = await payload.find({
    collection: 'tenders',
    where: { sourceKey: { in: candidates.map((c) => c.sourceKey) } },
    limit: candidates.length || 1,
    depth: 0,
    pagination: false,
  });
  const byKey = new Map(existing.docs.map((d) => [d.sourceKey, d]));

  for (const c of candidates) {
    const doc = byKey.get(c.sourceKey);
    const factual = {
      title: c.title,
      buyer: c.buyer,
      url: c.url,
      description: c.description,
      deadline: c.deadline,
      contractStart: c.contractStart,
      contractEnd: c.contractEnd,
      valueLow: c.valueLow,
      valueHigh: c.valueHigh,
      incumbent: c.incumbent,
      postcode: c.postcode,
      distanceMiles: c.distanceMiles,
      cpv: c.cpv,
      matched: c.matched,
      score: c.score,
      publishedAt: c.publishedAt,
      lastSeenAt: now.toISOString(),
    };
    try {
      if (!doc) {
        summary.created.push(c);
        if (opts.dryRun) continue;
        await payload.create({
          collection: 'tenders',
          data: {
            ...factual,
            sourceKey: c.sourceKey,
            source: c.source,
            kind: c.kind,
            fit: c.fit,
            actionBy: c.actionBy,
            status: c.kind === 'renewal' ? 'watching' : c.kind === 'lead' ? 'reviewing' : 'new',
          },
        });
      } else {
        summary.updated++;
        if (opts.dryRun) continue;
        // Manual leads are static seed data — don't refresh them.
        if (c.kind === 'lead') continue;
        const data = transition(doc, c, factual);
        if (data) await payload.update({ collection: 'tenders', id: doc.id, data });
      }
    } catch (e) {
      errors.push(`upsert "${c.title}": ${(e as Error).message}`);
    }
  }

  return summary;
}
