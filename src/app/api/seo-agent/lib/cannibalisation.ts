/**
 * Cannibalisation check (lexical, v1).
 *
 * Brief §8 Option B — strip stopwords, stem-compare query against
 * existing Post and Page titles/slugs. Returns the best match above
 * a similarity threshold so the caller can downgrade `new_article`
 * to `on_page_tweak` against the existing item.
 *
 * pgvector + embeddings is the v2 upgrade.
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'how',
  'i', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'was', 'were', 'will',
  'with', 'what', 'why', 'when', 'where', 'who', 'which', 'do', 'does', 'can',
  'should', 'best', 'top', 'guide', 'your', 'you', 'my', 'me',
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t))
    .map(stem);
}

/**
 * Tiny suffix stemmer — good enough for a lexical check.
 *
 * Sanity floor: bail out if stemming would leave a stub under 4 chars.
 * Catches degenerate strips like "river" → "riv" while preserving useful
 * ones like "harrower" → "harrow". Doesn't help with cases where the
 * stripped form is the wrong length but still ≥ 4 (e.g. "better" → "bett")
 * — that needs a real stemmer.
 */
function stem(t: string): string {
  if (t.length <= 4) return t;
  const stripped = stripSuffix(t);
  return stripped.length >= 4 ? stripped : t;
}

function stripSuffix(t: string): string {
  if (t.endsWith('ing')) return t.slice(0, -3);
  if (t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.endsWith('es')) return t.slice(0, -2);
  if (t.endsWith('s')) return t.slice(0, -1);
  if (t.endsWith('ed')) return t.slice(0, -2);
  if (t.endsWith('er')) return t.slice(0, -2);
  return t;
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let overlap = 0;
  for (const x of setA) if (setB.has(x)) overlap++;
  const union = setA.size + setB.size - overlap;
  return union === 0 ? 0 : overlap / union;
}

export type ExistingDoc = {
  collection: 'pages' | 'posts' | 'services';
  id: number;
  slug: string;
  title: string;
  /** Posts only — 'commentary' posts are excluded from optimisation. */
  category?: string;
};

export type CannibalisationHit = {
  doc: ExistingDoc;
  score: number;
};

/**
 * Find the closest existing doc to the candidate query+title.
 *
 * Threshold: brief specifies 0.85 cosine for embeddings; for lexical
 * Jaccard we use a more permissive 0.55, which roughly approximates
 * "obvious topic overlap" without false-positiving on shared topic
 * words like "paddock".
 */
export function findCollision(
  candidateQuery: string,
  candidateTitle: string | undefined,
  existing: ExistingDoc[],
  threshold = 0.55,
): CannibalisationHit | null {
  const candidateTokens = [
    ...tokens(candidateQuery),
    ...(candidateTitle ? tokens(candidateTitle) : []),
  ];
  if (candidateTokens.length === 0) return null;

  let best: CannibalisationHit | null = null;
  for (const doc of existing) {
    const docTokens = [...tokens(doc.title), ...tokens(doc.slug)];
    const score = jaccard(candidateTokens, docTokens);
    if (score >= threshold && (!best || score > best.score)) {
      best = { doc, score };
    }
  }
  return best;
}
