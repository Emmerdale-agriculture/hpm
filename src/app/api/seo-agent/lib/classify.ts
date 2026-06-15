/**
 * Classifier — assigns intent + opportunity type to a triaged query.
 *
 * Uses Claude Haiku 4.5 (cheap, fast). System prompt is cached so 50+
 * classifications in a single run share the prompt cost.
 *
 * Output is strict JSON; see types.Classification.
 */

import { callJson, HAIKU_MODEL, type TokenBudget } from './anthropic';
import type { Classification, GscRowPlus, Intent, ClassifierVerdict } from './types';

const SYSTEM = `You are an SEO intent classifier for Hampshire Paddock Management, a paddock and land management contractor in Hampshire, UK. Services: paddock topping, fertiliser application, weed control, harrowing, rolling, and equestrian fencing.

You receive search queries and classify them on two axes:

INTENT (what does the searcher want):
- transactional: wants to hire/buy a service immediately ("paddock topping near me", "fence contractor Hampshire")
- local: explicitly local with service intent ("paddock services Winchester")
- navigational: looking for a specific brand/site
- commercial: comparing options before deciding ("best paddock mower", "cost of paddock topping")
- informational: wants to learn ("how often should you top a paddock", "what is ragwort")

OPPORTUNITY TYPE (what action makes sense):
- meta_rewrite: page ranks well, just needs better title/meta
- on_page_tweak: page is striking distance, needs content additions
- new_article: genuine gap, informational/commercial intent only
- skip: not worth acting on (e.g. transactional query already served by a service page)

Hard rule: never return new_article for transactional or local intent. Those should be meta_rewrite or on_page_tweak against the relevant Service page, or skip.

Respond with strict JSON only, no preamble:
{"intent": "...", "type": "...", "rationale": "one sentence"}`;

export type ClassifyContext = {
  servicePages: string[]; // e.g. ["paddock-topping", "weed-control", ...]
  postSummaries: string[]; // titles of recent/similar posts (for the LLM to spot dupes)
};

export async function classifyQuery(
  row: GscRowPlus,
  ctx: ClassifyContext,
  budget?: TokenBudget,
): Promise<Classification> {
  const user = [
    `Query: ${row.query}`,
    `Page currently ranking: ${row.page ?? 'none'}`,
    `Average position: ${row.position.toFixed(1)}`,
    `Impressions: ${row.impressions}`,
    `CTR: ${(row.ctr * 100).toFixed(2)}%`,
    `Existing service pages: ${ctx.servicePages.join(', ') || 'none'}`,
    `Existing posts on similar topics: ${ctx.postSummaries.join('; ') || 'none'}`,
  ].join('\n');

  const result = await callJson<{ intent: string; type: string; rationale: string }>({
    model: HAIKU_MODEL,
    system: SYSTEM,
    user,
    maxTokens: 400,
    budget,
  });

  const intent = normaliseIntent(result.intent);
  const type = normaliseType(result.type);

  // The opportunity TYPE is decided downstream from triage's position bands,
  // not from this value — the model has no position thresholds. We surface the
  // model's verdict only so the orchestrator can honour an explicit 'skip'
  // (e.g. a transactional query already served by a service page). The brief's
  // "no article for transactional/local intent" guard is enforced in the
  // orchestrator against the authoritative triage type.
  return {
    intent,
    type,
    rationale: result.rationale ?? '',
  };
}

function normaliseIntent(s: string): Intent {
  const v = s.toLowerCase().trim();
  if (v === 'transactional' || v === 'navigational' || v === 'commercial' || v === 'informational' || v === 'local') {
    return v;
  }
  // Default to commercial — safer than transactional (which blocks new_article).
  return 'commercial';
}

function normaliseType(s: string): ClassifierVerdict {
  const v = s.toLowerCase().trim();
  if (v === 'meta_rewrite' || v === 'on_page_tweak' || v === 'new_article' || v === 'skip') {
    return v;
  }
  return 'skip';
}
