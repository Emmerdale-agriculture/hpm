/**
 * Draft generation — Opus 4.7 for all three opportunity types.
 *
 * Each function returns the structured draft or `null` if generation
 * failed twice. The caller persists null drafts as `pending` so Tom
 * still sees the candidate.
 */

import { callJson, OPUS_MODEL, type TokenBudget } from './anthropic';
import { formatPageContext, normalisePath, type PageContext } from './page-context';
import type {
  MetaRewriteDraft,
  OnPageTweakDraft,
  NewArticleDraft,
} from './types';

const ARTICLE_SYSTEM = `You are writing a draft article for Hampshire Paddock Management's website. Tom Oswald, the owner, will review and edit before publishing. Your draft should be ready for him to refine, not perfect.

VOICE:
- Practical, plain English, contractor-confident.
- Tom runs the machinery himself — write as someone who knows the work, not a marketing copywriter.
- No hype, no superlatives, no "in today's fast-paced world" openings.
- British English spelling.

CONSTRAINTS:
- 700-1200 words.
- One H1 (the title), then H2/H3 only. No deeper.
- Never invent statistics, case studies, customer quotes, or regulatory citations.
- Never quote prices or promise specific timelines/outcomes.
- Geography: Hampshire and surrounding counties only. Do not write as if national.
- Mention relevant HPM services where natural, with internal link suggestions in markdown link syntax pointing to the slugs provided.
- End with a soft CTA paragraph pointing to the contact page, not a hard sales pitch.

OUTPUT (strict JSON, no preamble):
{
  "title": "...",
  "metaDescription": "max 155 chars",
  "slug": "kebab-case",
  "bodyMarkdown": "...",
  "suggestedInternalLinks": [{"anchor": "...", "slug": "..."}]
}`;

const META_SYSTEM = `You write title tags and meta descriptions for Hampshire Paddock Management. Produce three alternatives that improve CTR for the target query while staying truthful and on-brand.

CONSTRAINTS:
- Title: max 60 characters including spaces. Aim for 50–58.
- Meta: max 155 characters including spaces. Aim for 140–150 to leave headroom.
- Always end with a complete sentence. Never truncate mid-word or mid-thought to fit the limit — rephrase shorter instead.
- Never use ellipsis ("...") to indicate continuation. Each alternative must read as finished copy.
- British English.
- Do not promise prices, speed, or guarantees.
- Include the geographic qualifier (Hampshire / South of England) where it fits naturally.
- You are given the page's current title, meta and body. Every claim must be supported by the page body or sidebar; never name a machine, service or timing the page doesn't.
- Each alternative must differ materially from the current title/meta — re-wording the same pitch won't move CTR.
- If several queries are listed, they share this one SERP listing: write for the primary query without making the copy unreadable for the others.

OUTPUT (strict JSON):
{
  "alternatives": [
    {"title": "...", "meta": "...", "rationale": "why this might lift CTR"},
    {"title": "...", "meta": "...", "rationale": "..."},
    {"title": "...", "meta": "...", "rationale": "..."}
  ]
}`;

const ONPAGE_SYSTEM = `You suggest specific, surgical content additions for a page that ranks in striking distance for a query but isn't winning. Suggestions must be applicable without restructuring the page.

You are given the page's live content: its headings, the questions it already answers, the internal links already on it, its body, and (for service pages) a sidebar of equipment and timing facts.

CONSTRAINTS:
- Hampshire Paddock Management voice: plain English, contractor-confident, no hype.
- British English. No invented stats, quotes, or prices.
- Ground every factual claim (machinery, depths, timings, frequencies) in the page body or sidebar. If the page doesn't state a fact you'd need, write around it rather than supplying a number or a machine. The sidebar's equipment list is the complete list of machines — never mention one that isn't on it.
- Do not propose an H2 or FAQ that the page already covers, even reworded. Fill a gap the existing headings leave for the query. Return an empty faqAdditions array rather than repeat a question already answered.
- Do not suggest links the page already has. Internal link suggestions must use a path exactly as listed in the site map (e.g. "/services/harrowing", "/notes/…"), in the "slug" field.
- If several queries are listed, they are variants Google already serves this page for; one addition should serve them together.
- If another URL on the site also ranks for the query, say in the rationale which page should own it and whether that page needs a link to this one (or vice versa). Cannibalisation is often the real problem, not missing copy.

OUTPUT (strict JSON):
{
  "newH2": "an H2 to add to the page",
  "newH2Body": "1-2 paragraphs of body copy under the H2, markdown",
  "internalLinksToAdd": [{"anchor": "...", "slug": "...", "reason": "..."}],
  "faqAdditions": [{"question": "...", "answer": "..."}],
  "rationale": "why these additions should help the page rank for the query"
}`;

export type GenerateArticleArgs = {
  query: string;
  intent: string;
  serviceSlugs: string[];
  existingPostsSummary: string;
  rationale: string;
};

export async function generateArticle(
  args: GenerateArticleArgs,
  budget?: TokenBudget,
): Promise<NewArticleDraft | null> {
  try {
    const draft = await callJson<NewArticleDraft>({
      model: OPUS_MODEL,
      system: ARTICLE_SYSTEM,
      user: [
        `Target query: ${args.query}`,
        `Search intent: ${args.intent}`,
        `Available service pages (for internal linking): ${args.serviceSlugs.join(', ')}`,
        `Existing posts to avoid duplicating: ${args.existingPostsSummary || 'none'}`,
        `Why this query was selected: ${args.rationale}`,
      ].join('\n'),
      maxTokens: 4000,
      budget,
    });
    return validateArticle(draft);
  } catch (err) {
    console.error('[seo-agent] generateArticle failed', err);
    return null;
  }
}

export type GenerateMetaArgs = {
  query: string;
  /** Other queries the same page is served for, with impressions. */
  relatedQueries?: string[];
  url: string;
  currentTitle: string;
  currentMeta: string;
  ctr: number;
  expectedCtr: number;
  page?: PageContext | null;
};

export async function generateMetaRewrite(
  args: GenerateMetaArgs,
  budget?: TokenBudget,
): Promise<MetaRewriteDraft | null> {
  try {
    const draft = await callJson<MetaRewriteDraft>({
      model: OPUS_MODEL,
      system: META_SYSTEM,
      user: [
        `Target query: ${args.query}`,
        ...(args.relatedQueries?.length ? [`Other queries this page is served for: ${args.relatedQueries.join('; ')}`] : []),
        `Current page URL: ${args.url}`,
        `Current CTR: ${(args.ctr * 100).toFixed(2)}% (expected at this position: ${(args.expectedCtr * 100).toFixed(0)}%)`,
        args.page
          ? formatPageContext(args.page)
          : `Current title: ${args.currentTitle}\nCurrent meta: ${args.currentMeta || '(unknown — page fetch failed)'}`,
      ].join('\n\n'),
      maxTokens: 1200,
      budget,
    });
    return validateMeta(draft);
  } catch (err) {
    console.error('[seo-agent] generateMetaRewrite failed', err);
    return null;
  }
}

export type GenerateOnPageArgs = {
  query: string;
  /** Other queries the same page is served for, with impressions/position. */
  relatedQueries?: string[];
  /** Other site URLs Google also shows for the primary query. */
  competingPages?: string[];
  url: string;
  /** Fallback when the live fetch fails: the page title. */
  excerpt: string;
  position: number;
  /** Site pages as full paths ("/services/x", "/notes/y", "/z"). */
  siteMap: Array<{ path: string; title: string }>;
  page?: PageContext | null;
};

export async function generateOnPageTweak(
  args: GenerateOnPageArgs,
  budget?: TokenBudget,
): Promise<OnPageTweakDraft | null> {
  try {
    const draft = await callJson<OnPageTweakDraft>({
      model: OPUS_MODEL,
      system: ONPAGE_SYSTEM,
      user: [
        `Target query: ${args.query}`,
        ...(args.relatedQueries?.length ? [`Other queries this page is served for: ${args.relatedQueries.join('; ')}`] : []),
        ...(args.competingPages?.length
          ? [`Other URLs on this site Google also shows for the target query: ${args.competingPages.join('; ')}`]
          : []),
        `Page URL: ${args.url}`,
        `Current position: ${args.position.toFixed(1)}`,
        args.page
          ? formatPageContext(args.page)
          : `Page title (live fetch failed — you have no body; keep suggestions generic and claim no specifics): ${args.excerpt}`,
        `Other pages on the site (for internal linking): ${args.siteMap
          .map((p) => `${p.path} — ${p.title}`)
          .join('; ')}`,
      ].join('\n\n'),
      maxTokens: 2500,
      budget,
    });
    return validateOnPage(draft, args.page, args.siteMap, args.url);
  } catch (err) {
    console.error('[seo-agent] generateOnPageTweak failed', err);
    return null;
  }
}

// --- validators ---------------------------------------------------------

// Trim to a complete-sentence (or at minimum, complete-word) boundary
// instead of slicing mid-word and appending an ellipsis. The model is
// instructed not to overshoot, but if it does, this keeps the output
// usable as-is on the SERP rather than producing literal "..." in
// production meta tags.
function trimMeta(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  // Prefer cutting at the last sentence boundary that's not too far back
  const sentenceMatch = cut.match(/^.*[.!?](?=\s|$)/s);
  if (sentenceMatch && sentenceMatch[0].length >= Math.floor(max * 0.6)) {
    return sentenceMatch[0].trim();
  }
  // Otherwise cut at the last word boundary, terminate with a period
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > Math.floor(max * 0.5)) {
    return cut.slice(0, lastSpace).replace(/[,;:\-]\s*$/, '').trim() + '.';
  }
  return cut.trim();
}

function trimTitle(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > Math.floor(max * 0.5) ? cut.slice(0, lastSpace) : cut).trim();
}

function validateArticle(d: NewArticleDraft): NewArticleDraft | null {
  if (!d.title || !d.bodyMarkdown || !d.slug) return null;
  if (d.metaDescription) {
    // 155 to match the system prompt and validateMeta below — Google
    // truncates around 155–160 chars on desktop.
    d.metaDescription = trimMeta(d.metaDescription, 155);
  }
  if (!Array.isArray(d.suggestedInternalLinks)) d.suggestedInternalLinks = [];
  return d;
}

/**
 * Belt and braces on the prompt rules: drop FAQ questions and links the page
 * already has. Normalised comparison catches case/punctuation re-wordings;
 * a genuinely reworded duplicate still needs Tom's eye.
 */
function validateOnPage(
  d: OnPageTweakDraft,
  page: PageContext | null | undefined,
  siteMap: Array<{ path: string; title: string }>,
  pageUrl: string,
): OnPageTweakDraft | null {
  if (!d || !d.newH2) return null;
  if (!Array.isArray(d.faqAdditions)) d.faqAdditions = [];
  if (!Array.isArray(d.internalLinksToAdd)) d.internalLinksToAdd = [];

  // Resolve each suggested link to a full site path. Comparing leaf slugs
  // alone conflated /notes/paddock-topping with /services/paddock-topping.
  // A bare slug is accepted only when exactly one site page ends in it.
  const known = new Set(siteMap.map((p) => normalisePath(p.path)));
  const resolve = (raw: string): string | null => {
    const asPath = normalisePath(raw);
    if (known.has(asPath)) return asPath;
    const leaf = asPath.split('/').pop();
    const hits = siteMap.map((p) => normalisePath(p.path)).filter((p) => p.split('/').pop() === leaf);
    return hits.length === 1 ? hits[0] : null;
  };
  const self = normalisePath(pageUrl || '/');
  const linked = new Set(page?.internalLinks ?? []);
  d.internalLinksToAdd = d.internalLinksToAdd
    .map((l) => (l?.slug ? { ...l, slug: resolve(l.slug) ?? '' } : null))
    .filter((l): l is NonNullable<typeof l> => Boolean(l && l.slug && l.slug !== self && !linked.has(l.slug)));

  if (page) {
    const norm = (q: string) => q.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const asked = new Set(page.existingQuestions.map(norm));
    d.faqAdditions = d.faqAdditions.filter((f) => f?.question && !asked.has(norm(f.question)));
  }
  return d;
}

function validateMeta(d: MetaRewriteDraft): MetaRewriteDraft | null {
  if (!Array.isArray(d.alternatives) || d.alternatives.length === 0) return null;
  d.alternatives = d.alternatives
    .filter((a) => a.title && a.meta)
    .map((a) => ({
      title: trimTitle(a.title, 60),
      meta: trimMeta(a.meta, 155),
      rationale: a.rationale ?? '',
    }));
  return d.alternatives.length > 0 ? d : null;
}
