#!/usr/bin/env node
/**
 * scripts/apply-seo-review-2026-W44.mjs
 *
 * 2026-10-27 monthly review. No pending seo_opportunities (next agent run
 * Nov-01); the live crawl found the problem instead: two of October's new
 * notes, published from /admin with a Word-pasted body, went live with
 * everything autoDerive and the paste could get wrong:
 *
 *   posts/76 prostrate-knotweed-in-horse-paddocks-a-warning-sign-of-soil-compaction
 *   posts/77 the-stale-seedbed-how-to-reduce-weed-growth-when-renovating-a-horse-paddock
 *
 *   - metaTitle cut mid-phrase by titleCut ("…A Warning Sign of Soil",
 *     "…When Renovating a Horse") — both titles are 71–76 chars.
 *   - metaDescription and excerpt derived from the body, which on post 76
 *     opens with the title itself as a bold line, so the snippet repeats the
 *     <title> word for word and ends in "…". (Post 77 the same, via excerpt.)
 *   - ZERO headings: every section title is a bold paragraph (36 on post 76,
 *     26 on post 77) — the W36/W40 structure passes ran before they existed.
 *   - Post 77's "early autumn programme" table was pasted as 12 loose
 *     paragraphs (Period / Operation / Week 1 / Control existing…).
 *   - No primaryTag, so no in-article service CTA.
 *
 * Post 74 (stone burying, Oct-09) is structured fine but its description is
 * the body's first 160 chars cut with "…".
 *
 * What this does:
 *   1. Posts 76/77: drop a first paragraph that just repeats the title;
 *      single-run bold paragraphs of 4–90 chars that don't end in "." become
 *      headings (h3 when they are a numbered sub-step — "Step 2:", "Stage 3:",
 *      "1.", "Option 1:", "Approach A:" — else h2); bold sentences ending in
 *      "." stay as emphasis. Post 77's table becomes a bullet list
 *      ("Week 1 — Control existing vegetation…"). Trailing empty paragraphs
 *      are removed.
 *   2. Hand-written metaTitle / metaDescription / excerpt for 74, 76, 77
 *      (every claim taken from the post itself), primaryTag for 76/77.
 *   3. In-content discovery links: the knotweed-Thrust guide → post 76 (same
 *      weed, the other half of the answer), the rotavating note (the site's
 *      most-crawled page) and East Meon part 3 (a spray-off-then-wait seedbed
 *      in practice) → post 77. The "latest notes" rail links them today; it
 *      won't next month. And the vineyard stone-burier note (indexed) → the
 *      stone-burying guide (post 74).
 *
 * URL Inspection on 2026-10-27: all four October notes (74, 75, 76, 77) are
 * "URL is unknown to Google" and /services/stone-burying is still only
 * "Discovered", so the discovery links are the point, not a nicety.
 *
 * The autoDerive hook was fixed in the same commit to skip a leading copy of
 * the title, so the next pasted post doesn't repeat it.
 *
 * Slug-keyed (the local mirror predates all three posts — it prints
 * [missing] there). Idempotent: once headings exist the structure pass
 * skips, meta writes skip when already equal, link paragraphs are
 * sentinel-guarded. Dry-run by default.
 *
 *   Prod:  DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *            node_modules/.bin/tsx --env-file=.env.local scripts/apply-seo-review-2026-W44.mjs --execute
 *
 * Verify live (pages are revalidate=3600; allow an hour or re-save in /admin):
 *   /notes/prostrate-knotweed-in-horse-paddocks-a-warning-sign-of-soil-compaction
 *   has <h2>What Is Prostrate Knotweed? and title "…A Sign of Soil Compaction".
 */
import { pathToFileURL } from 'node:url';

const EXECUTE = process.argv.includes('--execute');
const BOLD = 1; // Lexical text-format bitmask

// ------------------------------------------------------------ node helpers
const text = (str, format = 0) => ({
  mode: 'normal', text: str, type: 'text', style: '', detail: 0, format, version: 1,
});
const para = (children) => ({
  type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr', children,
});
const heading = (tag, str) => ({
  tag, type: 'heading', format: '', indent: 0, version: 1, direction: 'ltr', children: [text(str)],
});
const link = (url, anchor) => ({
  type: 'link',
  fields: { url, newTab: false, linkType: 'custom' },
  format: '', indent: 0, version: 3, direction: 'ltr',
  children: [text(anchor)],
});
const listItem = (children, value) => ({
  type: 'listitem', value, format: '', indent: 0, version: 1, direction: 'ltr', children,
});
const bulletList = (items) => ({
  type: 'list', listType: 'bullet', tag: 'ul', start: 1, format: '', indent: 0, version: 1, direction: 'ltr',
  children: items.map((children, i) => listItem(children, i + 1)),
});
const block = (children) => ({
  blockType: 'richText',
  content: { root: { type: 'root', format: '', indent: 0, version: 1, direction: 'ltr', children } },
});

const plainText = (node) => (node?.type === 'text' ? node.text ?? '' : (node?.children ?? []).map(plainText).join(''));
const singleText = (node) => {
  const kids = node?.children ?? [];
  if (node?.type !== 'paragraph' || kids.length !== 1) return null;
  const t = kids[0];
  return t?.type === 'text' && typeof t.text === 'string' ? t : null;
};
const isBoldLine = (node) => {
  const t = singleText(node);
  return Boolean(t && ((t.format ?? 0) & BOLD) === BOLD);
};
const isEmptyPara = (node) => node?.type === 'paragraph' && plainText(node).trim() === '';

// ---------------------------------------------------------- the structure pass
const SUBSTEP = /^(step \d+|stage \d+|option \d+|approach [a-z]|\d+\.)(:|\s)/i;

function isSectionHeading(node) {
  if (!isBoldLine(node)) return false;
  const s = plainText(node).trim();
  // A bold sentence ("Killing the weed does not automatically repair the
  // soil.") is emphasis, not a section title. Questions are headings.
  return s.length >= 4 && s.length <= 90 && !s.endsWith('.');
}

/** "Period | Operation" table pasted as alternating paragraphs → bullet list. */
function foldPastedTable(children, log) {
  const at = children.findIndex(
    (n, i) => isBoldLine(n) && plainText(n).trim() === 'Period'
      && isBoldLine(children[i + 1]) && plainText(children[i + 1]).trim() === 'Operation',
  );
  if (at < 0) return children;
  const rows = [];
  let i = at + 2;
  while (i + 1 < children.length && /^Weeks? \d/.test(plainText(children[i]).trim())) {
    rows.push([text(`${plainText(children[i]).trim()} — `, BOLD), text(plainText(children[i + 1]).trim())]);
    i += 2;
  }
  if (rows.length < 2) return children;
  log(`→ list  table of ${rows.length} rows ("${plainText(children[at + 2]).trim()} …")`);
  return [...children.slice(0, at), bulletList(rows), ...children.slice(i)];
}

export function restructure(children, title, log) {
  if (children.some((n) => n?.type === 'heading')) return null; // already structured
  let out = [...children];
  if (out[0] && plainText(out[0]).trim().toLowerCase() === title.trim().toLowerCase()) {
    log(`✗ drop  leading title line "${plainText(out[0]).trim().slice(0, 50)}…"`);
    out = out.slice(1);
  }
  out = foldPastedTable(out, log);
  out = out.map((n) => {
    if (!isSectionHeading(n)) return n;
    const s = plainText(n).trim();
    const tag = SUBSTEP.test(s) ? 'h3' : 'h2';
    log(`→ ${tag}   "${s}"`);
    return heading(tag, s);
  });
  let empties = 0;
  while (out.length && isEmptyPara(out[out.length - 1])) { out.pop(); empties += 1; }
  if (empties) log(`✗ drop  ${empties} trailing empty paragraph(s)`);
  return out;
}

// ------------------------------------------------------------------- data
const KNOTWEED = 'prostrate-knotweed-in-horse-paddocks-a-warning-sign-of-soil-compaction';
const STALE = 'the-stale-seedbed-how-to-reduce-weed-growth-when-renovating-a-horse-paddock';
const STONE = 'stone-burying-how-to-prepare-stony-ground-using-a-stone-burier';

const RESTRUCTURE = [KNOTWEED, STALE];

// [slug, { seo, excerpt?, primaryTag? }]
const META = [
  [KNOTWEED, {
    metaTitle: 'Prostrate Knotweed in Horse Paddocks: A Sign of Soil Compaction',
    metaDescription: 'Prostrate knotweed spreading across a horse paddock often points to compacted soil. How to check for compaction, and why spraying alone won’t fix it.',
    excerpt: 'When prostrate knotweed starts spreading across a horse paddock, it may be telling you something important about the condition of the soil beneath your feet.',
    primaryTag: 'ground-care',
  }],
  [STALE, {
    metaTitle: 'The Stale Seedbed: Fewer Weeds When Renovating a Horse Paddock',
    metaDescription: 'Let the first flush of weeds germinate, kill it, then sow. How a stale seedbed works in a horse paddock renovation, step by step, with timings.',
    excerpt: 'Renovating a horse paddock is an investment in the future health and productivity of your grassland. But one of the biggest challenges when establishing a new grass sward is preventing weeds from taking over before the grass has had a chance to establish.',
    primaryTag: 'weeds',
  }],
  [STONE, {
    metaDescription: 'A stone burier works surface stones below a layer of fine soil for a clean, level seedbed. How it works, when to use one, and how it compares to stone picking.',
  }],
];

const KNOTWEED_URL = `/notes/${KNOTWEED}`;
const STALE_URL = `/notes/${STALE}`;
const STONE_URL = `/notes/${STONE}`;

// [hostSlug, targetUrl, sentinel (first text run), paragraph]
const DISCOVERY = [
  ['can-thrust-herbicide-control-prostrate-knotweed-the-complete-guide-for-horse-pad', KNOTWEED_URL, 'Spraying is only half the answer',
    para([text('Spraying is only half the answer with knotweed. It thrives where the ground is compacted and the grass has thinned, so unless the soil is put right it comes back — see '), link(KNOTWEED_URL, 'prostrate knotweed as a warning sign of soil compaction'), text(' for how to check your paddock and restore it.')])],
  ['effective-field-rotavating-for-soil-health', STALE_URL, 'If you’re rotavating to reseed',
    para([text('If you’re rotavating to reseed, cultivation also wakes up weed seeds buried in the soil. A '), link(STALE_URL, 'stale seedbed'), text(' — letting that first flush of weeds germinate and killing it before you sow — gives the new grass a cleaner start.')])],
  ['finishing-vineyard-rows-sub-compact-tractor-stone-burier-seeder', STONE_URL, 'For how a stone burier works',
    para([text('For how a stone burier works, when to use one and how it compares with stone picking, see '), link(STONE_URL, 'stone burying: how to prepare stony ground'), text('.')])],
  ['east-meon-paddock-creation-seeding', STALE_URL, 'The principle behind the wait',
    para([text('The principle behind the wait between spraying and seeding, and how to use it on your own renovation: '), link(STALE_URL, 'the stale seedbed'), text('.')])],
];

// ------------------------------------------------------------------- main
// GOTCHA (post 70, 2026-09-01): payload.update() merges onto the LATEST
// version; a newer draft silently unpublishes the page. Always draft:false
// and re-assert _status for docs that were published when read.
const publishGuard = (doc) => (doc?._status === 'published' ? { _status: 'published' } : {});
const bodyHas = (blocks, needle) => JSON.stringify(blocks ?? []).includes(needle);

async function main() {
  const { getPayload } = await import('payload');
  const { default: config } = await import('../src/payload/payload.config.ts');
  const payload = await getPayload({ config });
  console.log(EXECUTE ? '[execute] W44 review fixes' : '[dry-run] use --execute to write');

  const bySlug = async (slug) => {
    const { docs } = await payload.find({ collection: 'posts', where: { slug: { equals: slug } }, limit: 1, depth: 0, draft: false });
    return docs[0] ?? null;
  };
  const write = async (doc, data, verify) => {
    if (!EXECUTE) return;
    await payload.update({ collection: 'posts', id: doc.id, draft: false, data: { ...data, ...publishGuard(doc) } });
    const check = await payload.findByID({ collection: 'posts', id: doc.id, depth: 0, draft: false });
    const ok = check._status === doc._status && verify(check);
    console.log(ok ? '      ✓ written and re-read' : '      ✗ RE-READ FAILED — inspect this post');
  };
  let changes = 0;

  console.log('\n1. Structure:');
  for (const slug of RESTRUCTURE) {
    const doc = await bySlug(slug);
    if (!doc) { console.log(`  [missing] posts/${slug.slice(0, 50)} — skipping (stale mirror?)`); continue; }
    const lines = [];
    let touched = false;
    const content = (doc.content ?? []).map((b) => {
      if (b.blockType !== 'richText') return b;
      const next = restructure(b.content?.root?.children ?? [], doc.title, (m) => lines.push(m));
      if (!next) return b;
      touched = true;
      return { ...b, content: { ...b.content, root: { ...b.content.root, children: next } } };
    });
    if (!touched) { console.log(`  [unchanged] posts/${doc.id} already has headings`); continue; }
    changes += 1;
    console.log(`  [restructure] posts/${doc.id} ${slug.slice(0, 56)}`);
    for (const l of lines) console.log(`      ${l}`);
    await write(doc, { content }, (c) => bodyHas(c.content, '"type":"heading"'));
  }

  console.log('\n2. Meta / excerpt / primaryTag:');
  for (const [slug, m] of META) {
    const doc = await bySlug(slug);
    if (!doc) { console.log(`  [missing] posts/${slug.slice(0, 50)} — skipping (stale mirror?)`); continue; }
    for (const v of [m.metaTitle, m.metaDescription]) {
      if (v && v.length > (v === m.metaTitle ? 70 : 160)) throw new Error(`too long (${v.length}): ${v}`);
    }
    const data = {};
    const seo = { ...(doc.seo ?? {}) };
    for (const k of ['metaTitle', 'metaDescription']) {
      if (m[k] && seo[k] !== m[k]) { console.log(`  [${k}] posts/${doc.id}: "${seo[k] ?? ''}"\n      → "${m[k]}"`); seo[k] = m[k]; data.seo = seo; }
    }
    if (m.excerpt && doc.excerpt !== m.excerpt) { console.log(`  [excerpt] posts/${doc.id}`); data.excerpt = m.excerpt; }
    if (m.primaryTag && !doc.primaryTag) { console.log(`  [primaryTag] posts/${doc.id} → "${m.primaryTag}"`); data.primaryTag = m.primaryTag; }
    if (!Object.keys(data).length) { console.log(`  [unchanged] posts/${doc.id} ${slug.slice(0, 44)}`); continue; }
    changes += 1;
    await write(doc, data, (c) =>
      (!m.metaTitle || c.seo?.metaTitle === m.metaTitle)
      && (!m.metaDescription || c.seo?.metaDescription === m.metaDescription)
      && (!m.excerpt || c.excerpt === m.excerpt)
      && (!m.primaryTag || c.primaryTag));
  }

  console.log('\n3. Discovery links:');
  for (const [slug, url, sentinel, paragraph] of DISCOVERY) {
    const doc = await bySlug(slug);
    if (!doc) { console.log(`  [missing] posts/${slug.slice(0, 50)} — skipping (stale mirror?)`); continue; }
    if (doc._status !== 'published') { console.error(`  ✗ posts/${doc.id} is ${doc._status} — skipping`); continue; }
    if (bodyHas(doc.content, sentinel)) { console.log(`  [unchanged] posts/${doc.id} already carries "${sentinel}…"`); continue; }
    if (bodyHas(doc.content, `"url":"${url}"`)) { console.log(`  [unchanged] posts/${doc.id} already links ${url}`); continue; }
    changes += 1;
    console.log(`  [append] posts/${doc.id} ${slug.slice(0, 44)} → ${url}`);
    await write(doc, { content: [...(doc.content ?? []), block([paragraph])] }, (c) => bodyHas(c.content, sentinel));
  }

  console.log(`\n${changes} change(s) ${EXECUTE ? 'applied' : 'pending'}.`);
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
