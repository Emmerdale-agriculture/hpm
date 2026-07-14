import type { CollectionBeforeValidateHook } from 'payload';

/**
 * Extract plain text from a Pages/Posts/Services `content` blocks array.
 * Walks the first richText block's Lexical tree and returns the concatenated
 * text of its top-level children, in order, separated by a space.
 *
 * Used to derive SEO descriptions, blog excerpts, and service shortDescriptions
 * from body content so authors only have to fill in the title + body.
 */
function extractPlainText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return '';
  try {
    for (const block of blocks) {
      if (block && typeof block === 'object' && (block as { blockType?: string }).blockType === 'richText') {
        const root = (block as { content?: { root?: { children?: unknown[] } } }).content?.root;
        if (!root?.children) continue;
        const parts: string[] = [];
        for (const node of root.children) {
          const text = nodeText(node, 0);
          if (text) parts.push(text);
          if (parts.join(' ').length > 400) break; // plenty for a 160-char truncate
        }
        return parts.join(' ').replace(/\s+/g, ' ').trim();
      }
    }
  } catch {
    // Malformed Lexical tree — fall through to empty string rather than
    // taking down admin autosave (which fires every 2s).
  }
  return '';
}

// Depth cap guards against malformed or self-referential Lexical trees
// which would otherwise blow the stack inside a beforeValidate hook.
const MAX_LEXICAL_DEPTH = 20;

function nodeText(node: unknown, depth: number): string {
  if (depth > MAX_LEXICAL_DEPTH) return '';
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; text?: string; children?: unknown[] };
  if (n.type === 'text' && typeof n.text === 'string') return n.text;
  if (Array.isArray(n.children)) return n.children.map((c) => nodeText(c, depth + 1)).join('');
  return '';
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

type AutoDeriveOptions = {
  /** Copy into `excerpt` if blank (posts). */
  excerpt?: boolean;
  /** Copy into `shortDescription` if blank (services). */
  shortDescription?: boolean;
  /** Derive tags from content proper nouns if blank (posts). */
  tags?: boolean;
};

// Curated tag taxonomy — must stay in sync with the description on the
// `tags` field in posts.ts and with the filter chips on /notes.
// Each entry is a slug paired with keywords/synonyms to look for in the
// post's title + body. Whole-word, case-insensitive match.
const TAG_TAXONOMY: Array<{ tag: string; keywords: string[] }> = [
  { tag: 'topping',     keywords: ['topping', 'topped', 'mow', 'mowing', 'mowed', 'mower'] },
  { tag: 'weeds',       keywords: ['weed', 'weeds', 'weeding', 'ragwort', 'thistle', 'thistles', 'dock', 'docks', 'nettle', 'nettles', 'buttercup', 'buttercups'] },
  { tag: 'seasonal',    keywords: ['spring', 'summer', 'autumn', 'winter', 'seasonal'] },
  { tag: 'equipment',   keywords: ['tractor', 'harrow', 'harrows', 'roller', 'rollers', 'sprayer', 'sprayers', 'machinery', 'equipment', 'attachment', 'attachments'] },
  { tag: 'ground-care', keywords: ['paddock', 'paddocks', 'turf', 'sward', 'pasture', 'grazing'] },
  { tag: 'advice',      keywords: ['guide', 'advice', 'tip', 'tips', 'recommend', 'recommended', 'how to', 'when to', 'should you', 'do you'] },
  { tag: 'drainage',    keywords: ['drainage', 'drain', 'drains', 'waterlogged', 'flooded', 'flooding', 'muddy', 'wet ground', 'wet soil'] },
  { tag: 'kit',         keywords: ['kit'] },
];

function deriveTags(plain: string, title: string): string[] {
  const corpus = `${title} ${plain}`.toLowerCase();
  const out: string[] = [];
  for (const { tag, keywords } of TAG_TAXONOMY) {
    const hit = keywords.some((kw) => {
      // Multi-word phrases match as a substring; single words match
      // whole-word so "mow" doesn't fire on "mowed-down" → it does (good)
      // but doesn't fire on "homeowner" → it doesn't (good).
      if (kw.includes(' ')) return corpus.includes(kw);
      return new RegExp(`\\b${kw}\\b`).test(corpus);
    });
    if (hit) out.push(tag);
  }
  return out;
}

/**
 * beforeValidate hook: fills in SEO + summary fields from title/content
 * whenever they're left blank. Runs before validation so `required` fields
 * pass once they're auto-filled.
 */
export const autoDerive =
  (opts: AutoDeriveOptions = {}): CollectionBeforeValidateHook =>
  ({ data }) => {
    // Payload hands us the full document in `data` — every schema key is
    // already present (with null/undefined for unset values), so we simply
    // fill in any blank derivable field from title + content.
    if (!data) return data;

    // Strip a hand-typed brand suffix — the layout template appends the brand
    // itself, so leaving it in doubles it (and wrecks slugs derived from it).
    const title = (typeof data.title === 'string' ? data.title.trim() : '').replace(
      /\s*[|–—-]\s*Hampshire Paddock Management\s*$/i,
      '',
    );
    const plain = extractPlainText(data.content);

    // SEO meta title / description — fall back to title and body content.
    // metaTitle is used verbatim (absolute) — never truncate it: a literal
    // "…" written into the <title> tag is worse than a long title Google
    // shortens itself.
    const seo = (data.seo ?? {}) as Record<string, unknown>;
    if (!seo.metaTitle && title) seo.metaTitle = title;
    if (!seo.metaDescription && plain) seo.metaDescription = truncate(plain, 160);
    if (seo.metaTitle || seo.metaDescription) data.seo = seo;

    // Blog excerpt — fall back to body content
    if (opts.excerpt && !data.excerpt && plain) {
      data.excerpt = truncate(plain, 300);
    }

    // Service short description — required on the schema, so derive from
    // content; if content is empty, fall back to the title.
    if (opts.shortDescription && !data.shortDescription) {
      if (plain) data.shortDescription = truncate(plain, 300);
      else if (title) data.shortDescription = truncate(title, 300);
    }

    // Post tags — fall back to capitalised phrases from title/content
    if (opts.tags) {
      const existing = Array.isArray(data.tags) ? (data.tags as Array<{ tag?: string }>) : [];
      if (existing.length === 0 && (title || plain)) {
        const derived = deriveTags(plain, title);
        if (derived.length > 0) {
          data.tags = derived.map((tag) => ({ tag }));
        }
      }
    }

    return data;
  };
