#!/usr/bin/env node
/**
 * scripts/fix-post-headings-2026-W36.mjs
 *
 * The WordPress import flattened every section heading into a bold
 * paragraph. On prod (2026-09-02) 35 of 60 published posts have ZERO heading
 * nodes in their body; 16 of them carry 98 bold-only paragraphs such as
 * "Signs Of Poor Drainage" and "Choosing the Right Fertiliser" that render as
 * <p><strong>…</strong></p>. Several of those pages are the site's biggest
 * impression earners with the worst CTR, and Google has nothing to anchor
 * passages or snippets on.
 *
 * What this does, per published post whose rich-text blocks contain NO
 * heading node at all:
 *   - a top-level paragraph whose only child is a single bold text run of
 *     4–90 characters becomes an h2 heading (bold stripped, text trimmed);
 *   - a pseudo-heading whose text is exactly "Introduction" is removed —
 *     an "Introduction" H2 is cruft and it was the source of the
 *     "Introduction…" meta descriptions fixed in 62dcbf1;
 *   - posts with fewer than two candidates are left alone (a single bold
 *     line is usually a signature or a "Costings:" label, not a heading).
 *
 * Idempotent: once a post has any heading node it is skipped, so a second
 * run prints [unchanged] for every post. Dry-run by default.
 *
 *   Local mirror: node_modules/.bin/tsx scripts/fix-post-headings-2026-W36.mjs
 *   Prod:         DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *                   node_modules/.bin/tsx --env-file=.env.local \
 *                   scripts/fix-post-headings-2026-W36.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const MIN_CANDIDATES = 2;
const DROP = new Set(['introduction']);

const BOLD = 1; // Lexical text-format bitmask

function isPseudoHeading(node) {
  if (node?.type !== 'paragraph') return false;
  const kids = node.children ?? [];
  if (kids.length !== 1) return false;
  const t = kids[0];
  if (t?.type !== 'text' || typeof t.text !== 'string') return false;
  if (((t.format ?? 0) & BOLD) !== BOLD) return false;
  const len = t.text.trim().length;
  return len >= 4 && len <= 90;
}

const toHeading = (str) => ({
  tag: 'h2',
  type: 'heading',
  format: '',
  indent: 0,
  version: 1,
  direction: 'ltr',
  children: [{ mode: 'normal', text: str, type: 'text', style: '', detail: 0, format: 0, version: 1 }],
});

function hasAnyHeading(blocks) {
  return (blocks ?? []).some(
    (b) => b.blockType === 'richText' && (b.content?.root?.children ?? []).some((n) => n?.type === 'heading'),
  );
}

// GOTCHA (post 70, 2026-09-01): payload.update() merges onto the LATEST
// version; a newer draft silently unpublishes the page. Always draft:false
// and re-assert _status for docs that were published when read.
const publishGuard = (doc) => (doc?._status === 'published' ? { _status: 'published' } : {});

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] converting pseudo-headings' : '[dry-run] use --execute to write');

const { docs } = await payload.find({
  collection: 'posts',
  where: { _status: { equals: 'published' } },
  limit: 500,
  depth: 0,
  draft: false,
});

let changed = 0;
let converted = 0;
let dropped = 0;

for (const doc of docs.sort((a, b) => a.id - b.id)) {
  const blocks = doc.content ?? [];
  if (hasAnyHeading(blocks)) {
    continue; // already structured (hand-written or previously converted)
  }
  const candidates = [];
  for (const b of blocks) {
    if (b.blockType !== 'richText') continue;
    for (const n of b.content?.root?.children ?? []) if (isPseudoHeading(n)) candidates.push(n.children[0].text.trim());
  }
  if (candidates.length < MIN_CANDIDATES) {
    if (candidates.length) console.log(`  [skip] posts/${doc.id} ${doc.slug.slice(0, 48)} — only 1 bold line ("${candidates[0]}")`);
    continue;
  }

  const next = blocks.map((b) => {
    if (b.blockType !== 'richText') return b;
    const out = [];
    for (const n of b.content.root.children) {
      if (!isPseudoHeading(n)) {
        out.push(n);
        continue;
      }
      const str = n.children[0].text.trim();
      if (DROP.has(str.toLowerCase())) {
        dropped += 1;
        continue;
      }
      out.push(toHeading(str));
      converted += 1;
    }
    return { ...b, content: { ...b.content, root: { ...b.content.root, children: out } } };
  });

  changed += 1;
  console.log(`  [convert] posts/${doc.id} ${doc.slug.slice(0, 56)} — ${candidates.length} bold lines:`);
  for (const c of candidates) console.log(`      ${DROP.has(c.toLowerCase()) ? '✗ drop' : '→ h2 '} ${c}`);

  if (EXECUTE) {
    await payload.update({
      collection: 'posts',
      id: doc.id,
      draft: false,
      data: { content: next, ...publishGuard(doc) },
    });
    const check = await payload.findByID({ collection: 'posts', id: doc.id, depth: 0, draft: false });
    const ok = hasAnyHeading(check.content) && check._status === 'published';
    console.log(ok ? '      ✓ written and re-read' : '      ✗ RE-READ FAILED — inspect this post');
  }
}

console.log(`\n${changed} posts ${EXECUTE ? 'updated' : 'would change'}: ${converted} headings created, ${dropped} "Introduction" lines dropped (of ${docs.length} published).`);
process.exit(0);
