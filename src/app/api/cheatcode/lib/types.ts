/**
 * Shared types for the weekly Cheatcode SEO agent.
 *
 * The pipeline shape:
 *   GscRowPlus -> ClassifiedQuery -> Opportunity (one of three variants)
 *
 * Each variant carries its own `draftContent` shape so the Payload
 * `draftContent` JSON column has a known schema by `type`.
 */

import type { GscRow } from '@/lib/gsc';

export type Intent =
  | 'transactional'
  | 'navigational'
  | 'commercial'
  | 'informational'
  | 'local';

/** Types raised per search query (triage bands + classifier). */
export type QueryOpportunityType =
  | 'meta_rewrite'
  | 'on_page_tweak'
  | 'new_article';

/**
 * `link_target` is raised per PAGE, not per query: a page the external
 * backlink agency should point links at this month (see link-targets.ts).
 */
export type OpportunityType = QueryOpportunityType | 'link_target';

export type ClassifierVerdict = QueryOpportunityType | 'skip';

/** GA4 engagement for an opportunity's target page (same window as GSC). */
export type PageAnalytics = {
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  avgSessionDuration: number;
  keyEvents: number;
};

/** A single GSC row keyed by query (and optionally page) with parsed dims. */
export type GscRowPlus = GscRow & {
  query: string;
  page?: string;
  /**
   * Other site URLs Google served for this query with meaningful volume
   * (see groupByQuery). Non-empty means the query is split — cannibalisation.
   */
  otherPages?: Array<{ page: string; impressions: number; position: number }>;
};

export type Classification = {
  intent: Intent;
  type: ClassifierVerdict;
  rationale: string;
};

export type ClassifiedQuery = {
  query: string;
  page?: string;
  metrics: {
    impressions: number;
    clicks: number;
    ctr: number;
    position: number;
  };
  classification: Classification;
};

export type MetaRewriteDraft = {
  alternatives: Array<{
    title: string;
    meta: string;
    rationale: string;
  }>;
};

export type OnPageTweakDraft = {
  newH2: string;
  newH2Body: string;
  internalLinksToAdd: Array<{ anchor: string; slug: string; reason: string }>;
  faqAdditions: Array<{ question: string; answer: string }>;
  rationale: string;
};

export type NewArticleDraft = {
  title: string;
  metaDescription: string;
  slug: string;
  bodyMarkdown: string;
  suggestedInternalLinks: Array<{ anchor: string; slug: string }>;
};

/**
 * The brief for the backlink agency: which page, how many links, the DA to
 * aim for (from the band in Cheatcode settings), and anchor text drawn from
 * the queries the page is already being shown for.
 */
export type LinkTargetDraft = {
  pageUrl: string;
  /** Highest-impression query the page is chasing; outcomes re-measure this. */
  leadQuery: string;
  queries: Array<{ query: string; impressions: number; clicks: number; position: number }>;
  linksRequested: number;
  targetDa: number;
  daBand: { min: number; max: number };
  anchors: Array<{ text: string; kind: 'exact' | 'partial' | 'branded' | 'url'; share: number }>;
  /** One anchor per requested link, rotated monthly so the mix holds over time. */
  anchorPlan?: string[];
};

export type DraftContent = MetaRewriteDraft | OnPageTweakDraft | NewArticleDraft | LinkTargetDraft | null;

export type OpportunityBase = {
  query: string;
  intent: Intent;
  weekIdentified: string;
  metrics: {
    impressions: number;
    clicks: number;
    ctr: number;
    position: number;
    expectedCtr?: number;
  };
  rationale: string;
  /**
   * Other queries clustered into this opportunity because GSC serves the
   * same page for them (e.g. "grass harrowing" + "harrowing grass"). Each
   * is persisted as its own superseded row so the cooldown covers it.
   */
  relatedQueries?: Array<{ query: string; impressions: number; position: number }>;
  /** Other URLs on the site Google shows for the primary query. */
  competingPages?: Array<{ page: string; impressions: number; position: number }>;
  /** Slug or URL of the page the opportunity targets, if any. */
  targetPageSlug?: string;
  /** Resolved Payload doc id for the targetPage relationship, set by persist. */
  targetPageId?: number;
  targetPageCollection?: 'pages' | 'posts' | 'services';
  /** GA4 for the target page; null when GA4 is off or had no row for it. */
  analytics?: PageAnalytics | null;
};

export type MetaRewriteOpportunity = OpportunityBase & {
  type: 'meta_rewrite';
  draftContent: MetaRewriteDraft | null;
};

export type OnPageTweakOpportunity = OpportunityBase & {
  type: 'on_page_tweak';
  draftContent: OnPageTweakDraft | null;
};

export type NewArticleOpportunity = OpportunityBase & {
  type: 'new_article';
  draftContent: NewArticleDraft | null;
  /** Top-3 by score get drafted; the rest are deferred (draftContent null). */
  deferred?: boolean;
};

export type LinkTargetOpportunity = OpportunityBase & {
  type: 'link_target';
  draftContent: LinkTargetDraft;
};

export type Opportunity =
  | MetaRewriteOpportunity
  | OnPageTweakOpportunity
  | NewArticleOpportunity
  | LinkTargetOpportunity;

export type AgentRunSummary = {
  runId: string;
  weekIdentified: string;
  startedAt: string;
  finishedAt: string;
  gscRange: { start: string; end: string };
  counts: {
    rowsFromGsc: number;
    classified: number;
    metaRewrites: number;
    onPageTweaks: number;
    newArticles: number;
    deferred: number;
    superseded: number;
    linkTargets: number;
  };
  /** Links-weighted average target DA across this run's backlink targets. */
  linkBrief: {
    linksTotal: number;
    averageTargetDa: number | null;
    daBand: { min: number; max: number };
    /** Pages that ranked for a link but GA4 shows losing visitors: fix them first. */
    fixFirst: Array<{ path: string; sessions: number; engagementRate: number }>;
  } | null;
  /** True when GA4 data was joined onto opportunities this run. */
  ga4Joined: boolean;
  opportunities: Opportunity[];
  /** Queries that qualified but were held back by the cooldown (no draft). */
  heldBack: Array<{ query: string; type: OpportunityType; priorId: number }>;
  /** Completed opportunities 6–26 weeks old, re-measured against this run's GSC pull. */
  outcomes: OutcomeCheck[];
  errors: string[];
};

export type OutcomeCheck = {
  id: number;
  query: string;
  type: OpportunityType;
  decidedAt: string;
  weekIdentified: string;
  before: { impressions: number; clicks: number; position: number };
  /** null = the query had no impressions in this run's window. */
  now: { impressions: number; clicks: number; position: number; page?: string } | null;
  verdict: 'improved' | 'flat' | 'worse' | 'gone';
};

/** ISO-week label, e.g. "2026-W17". UTC week, ISO 8601. */
export function isoWeekLabel(d: Date = new Date()): string {
  // ISO week: Monday is day 1; week 1 contains the first Thursday.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Position-expected CTR benchmarks (industry aggregate). */
export const POSITION_CTR: Record<number, number> = {
  1: 0.28,
  2: 0.15,
  3: 0.10,
  4: 0.07,
  5: 0.05,
};

/** CTR threshold for a meta-rewrite opportunity = 70% of position-expected. */
export function expectedCtrForPosition(position: number): number | undefined {
  const rounded = Math.round(position);
  return POSITION_CTR[rounded as 1 | 2 | 3 | 4 | 5];
}
