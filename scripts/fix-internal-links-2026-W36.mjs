#!/usr/bin/env node
/**
 * scripts/fix-internal-links-2026-W36.mjs
 *
 * Two internal-linking problems found in the 2026-09-02 review.
 *
 * 1. LEGACY LINK TARGETS. 18 pages still link, in body copy, to WordPress-era
 *    URLs that only resolve through a redirect: absolute
 *    https://hampshirepaddockmanagement.com/services/ (308), /field-rotavating/
 *    (301), /hedge-cutting/ (308), /contact/ (308) and so on. On a domain
 *    where Google is crawl-starved every redirect hop is a wasted fetch, and
 *    the only in-content link a note gives the un-recrawled
 *    /services/hedge-cutting page went through one. Also: an empty
 *    href="https://" wrapping an H2 on post 68, and a homepage link carrying
 *    ?utm_source=chatgpt.com on post 57. Every link node in every rich-text
 *    block (posts AND services) is normalised: own-origin absolute URLs
 *    become paths, known legacy paths map to their live targets, trailing
 *    slashes and querystrings go, and an empty/junk href is unwrapped to
 *    plain text.
 *
 * 2. DISCOVERY LINKS. GSC URL Inspection (all 93 sitemap URLs) shows Google
 *    has never fetched /services/weed-control or /services/mole-ploughing,
 *    has discovered but declined to crawl /paddock-maintenance (which has
 *    ZERO in-content inbound links), /services/flailing, /services/finish-
 *    mowing and /services/stone-burying. In-content links from crawled,
 *    high-impression notes are the one lever that has demonstrably worked
 *    here (/carbide-mole-plough: new URL → indexed in ~5 days; /services/
 *    spraying: first crawl ever on 2026-09-01, the day after W36's links
 *    went live). One short, sentinel-guarded paragraph per note, appended
 *    as a rich-text block, each pointing at a starved page from a note whose
 *    subject genuinely leads there.
 *
 * Idempotent: rewrites are no-ops once applied; appends skip when the
 * sentinel text or the target URL is already in the body. Dry-run default.
 *
 *   Local mirror: node_modules/.bin/tsx scripts/fix-internal-links-2026-W36.mjs
 *   Prod:         DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *                   node_modules/.bin/tsx --env-file=.env.local \
 *                   scripts/fix-internal-links-2026-W36.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const ORIGIN = 'https://hampshirepaddockmanagement.com';

// ------------------------------------------------------------ 1. rewrites
// Legacy path → live path. Keys are slash-less; both forms are matched.
const LEGACY = {
  '/services': '/services',
  '/field-rotavating': '/services/rotavating',
  '/field-ploughing': '/services/rotavating',
  '/field-harrowing': '/services/harrowing',
  '/paddock-rolling': '/services/rolling',
  '/paddock-topping': '/services/paddock-topping',
  '/hedge-cutting': '/services/hedge-cutting',
  '/fertiliser-spraying': '/services/fertiliser-application',
  '/seedsight': '/services/seedsight',
  '/product/seedsight': '/services/seedsight',
  '/contact': '/contact',
};

/** Returns the normalised URL, '' to unwrap the link, or null for no change. */
function normaliseUrl(url) {
  if (typeof url !== 'string') return null;
  let u = url.trim();
  if (u === '' || u === 'https://' || u === 'http://' || u === '#') return '';
  for (const origin of [ORIGIN, 'https://www.hampshirepaddockmanagement.com', 'http://hampshirepaddockmanagement.com']) {
    if (u.startsWith(origin)) {
      u = u.slice(origin.length);
      // "https://hampshirepaddockmanagement.com?utm_source=…" has no path at all
      if (!u.startsWith('/')) u = `/${u}`;
      break;
    }
  }
  if (!u.startsWith('/')) return null; // external — leave alone
  // Own-origin: drop querystring + hash cruft (utm_source=chatgpt.com etc.)
  const q = u.search(/[?#]/);
  if (q >= 0) u = u.slice(0, q) || '/';
  if (u.length > 1 && u.endsWith('/')) u = u.slice(0, -1);
  if (u in LEGACY) u = LEGACY[u];
  return u === url ? null : u;
}

/** Walk a Lexical tree, rewriting link nodes in place; returns change count. */
function rewriteLinks(node, log) {
  if (!node || typeof node !== 'object') return 0;
  let n = 0;
  const kids = node.children;
  if (Array.isArray(kids)) {
    const out = [];
    for (const k of kids) {
      if (k?.type === 'link' && k.fields && k.fields.linkType !== 'internal') {
        const next = normaliseUrl(k.fields.url);
        if (next === '') {
          log(`unwrap  "${k.fields.url}" → plain text`);
          n += 1;
          out.push(...(k.children ?? [])); // hoist the anchor text
          continue;
        }
        if (next !== null) {
          log(`rewrite "${k.fields.url}" → "${next}"`);
          n += 1;
          k.fields = { ...k.fields, url: next };
        }
      }
      n += rewriteLinks(k, log);
      out.push(k);
    }
    node.children = out;
  }
  return n;
}

// ---------------------------------------------------------- 2. discovery
const text = (str) => ({ mode: 'normal', text: str, type: 'text', style: '', detail: 0, format: 0, version: 1 });
const link = (url, anchor) => ({
  type: 'link',
  fields: { url, newTab: false, linkType: 'custom' },
  format: '', indent: 0, version: 3, direction: 'ltr',
  children: [text(anchor)],
});
const para = (children) => ({ type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr', children });
const block = (children) => ({
  blockType: 'richText',
  content: { root: { type: 'root', format: '', indent: 0, version: 1, direction: 'ltr', children } },
});

// [postId, expectedSlug, targetUrl, sentinel (first text run), paragraph]
const GUIDE = '/paddock-maintenance';
const DISCOVERY = [
  [55, 'paddock-management', GUIDE, 'If you want the full picture',
    para([text('If you want the full picture — what a paddock actually needs through the year, the complete service list and how the pricing works — start with our '), link(GUIDE, 'guide to paddock maintenance in Hampshire'), text('.')])],
  [48, 'year-round-paddock-care-made-simple', GUIDE, 'For a season-by-season breakdown',
    para([text('For a season-by-season breakdown of the jobs above, and what each one costs, read our '), link(GUIDE, 'paddock maintenance guide'), text('.')])],
  [30, 'recognise-when-your-paddock-needs-professional-care', GUIDE, 'Not sure which of these jobs',
    para([text('Not sure which of these jobs your land actually needs? Our '), link(GUIDE, 'paddock maintenance guide'), text(' walks through the full list, the seasonal schedule and how we price it.')])],

  [67, 'herbicide-thrust-for-ragwort-control-a-practical-guide-to-managing-ragwort-in-ho', '/services/weed-control', 'Ragwort is one of several',
    para([text('Ragwort is one of several paddock weeds we treat as a licensed contractor — docks, thistles, nettles and buttercups included. See our '), link('/services/weed-control', 'paddock weed control service'), text(' for what we treat and how.')])],
  [69, 'can-thrust-herbicide-control-prostrate-knotweed-the-complete-guide-for-horse-pad', '/services/weed-control', 'Knotweed rarely turns up alone',
    para([text('Knotweed rarely turns up alone. If the paddock also carries docks, thistles or ragwort, our '), link('/services/weed-control', 'weed control service'), text(' covers the lot in one visit.')])],
  [3, 'case-study-ragwort-thistle-and-docks-overgrowth-how-do-you-get-rid-of-it-for-good', '/services/weed-control', 'The two services that did this job',
    para([text('The two services that did this job: '), link('/services/flailing', 'flailing'), text(' to knock the overgrowth down first, then '), link('/services/weed-control', 'weed control'), text(' to deal with what comes back.')])],
  [66, 'why-we-flail-large-ragwort-before-spraying-hampshire-paddock-management', '/services/flailing', 'Both halves of this are services',
    para([text('Both halves of this are services we offer separately or together: '), link('/services/flailing', 'flailing'), text(' for the knock-down and '), link('/services/weed-control', 'weed control'), text(' for the treatment.')])],

  [34, 'spotting-and-fixing-paddock-drainage-issues', '/services/mole-ploughing', 'Where the problem is a compacted layer',
    para([text('Where the problem is a compacted layer under the surface rather than standing water on top, '), link('/services/mole-ploughing', 'mole ploughing'), text(' opens a drainage channel through it without digging the field up.')])],
  [18, 'keeping-horse-paddocks-dry-the-dream-scenario', '/services/mole-ploughing', 'On heavier ground the fix',
    para([text('On heavier ground the fix that actually lasts is below the surface: '), link('/services/mole-ploughing', 'mole ploughing'), text(' pulls a drainage channel through the clay so water has somewhere to go.')])],
  [58, 'super-compacted-paddocks-are-stopping-your-grass-growing-heres-how-to-fix-it', '/services/mole-ploughing', 'If the compaction goes deeper',
    para([text('If the compaction goes deeper than a harrow or aerator will reach, '), link('/services/mole-ploughing', 'mole ploughing'), text(' is the next step — it fractures the pan and drains it in one pass.')])],

  [39, 'turning-an-acre-of-rocks-into-an-acre-of-lush-thick-grass', '/services/stone-burying', 'The machine that makes this possible',
    para([text('The machine that makes this possible is a stone burier — one pass turns the stones under and leaves a fine, level seedbed on top. See our '), link('/services/stone-burying', 'stone burying service'), text('.')])],
  [62, 'finishing-vineyard-rows-sub-compact-tractor-stone-burier-seeder', '/services/stone-burying', 'The same stone burier and seeder',
    para([text('The same stone burier and seeder combination is what we use on rough paddocks and new ground — see '), link('/services/stone-burying', 'stone burying'), text(' for how it works on a bigger area.')])],
  [45, 'what-height-should-your-paddock-grass-be-in-winter', '/services/finish-mowing', 'For a tighter, more even finish',
    para([text('For a tighter, more even finish on smaller paddocks and the ground around the yard, we use a '), link('/services/finish-mowing', 'finish mower'), text(' rather than the topper.')])],
];

// ---------------------------------------------------------------- helpers
const publishGuard = (doc) => (doc?._status === 'published' ? { _status: 'published' } : {});
const bodyHas = (blocks, needle) => JSON.stringify(blocks ?? []).includes(needle);
const alreadyLinked = (blocks, url) => bodyHas(blocks, `"url":"${url}"`) || bodyHas(blocks, `"url": "${url}"`);

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] fixing internal links' : '[dry-run] use --execute to write');

// -- 1. rewrites across posts + services
let rewritten = 0;
for (const collection of ['posts', 'services']) {
  const { docs } = await payload.find({ collection, limit: 500, depth: 0, draft: false });
  for (const doc of docs.sort((a, b) => a.id - b.id)) {
    const blocks = structuredClone(doc.content ?? []);
    const lines = [];
    let n = 0;
    for (const b of blocks) if (b.blockType === 'richText') n += rewriteLinks(b.content?.root, (m) => lines.push(m));
    if (!n) continue;
    rewritten += n;
    console.log(`  [links] ${collection}/${doc.id} ${doc.slug.slice(0, 52)} (${doc._status})`);
    for (const l of lines) console.log(`      ${l}`);
    if (EXECUTE) {
      await payload.update({ collection, id: doc.id, draft: false, data: { content: blocks, ...publishGuard(doc) } });
      const check = await payload.findByID({ collection, id: doc.id, depth: 0, draft: false });
      const rest = [];
      for (const b of check.content ?? []) if (b.blockType === 'richText') rewriteLinks(structuredClone(b.content?.root), (m) => rest.push(m));
      console.log(rest.length || check._status !== doc._status ? '      ✗ RE-READ FAILED — inspect' : '      ✓ written and re-read');
    }
  }
}

// -- 2. discovery appends (posts only; a missing id = stale mirror, skip)
let appended = 0;
for (const [id, slug, url, sentinel, paragraph] of DISCOVERY) {
  let doc = null;
  try { doc = await payload.findByID({ collection: 'posts', id, depth: 0, draft: false }); } catch { doc = null; }
  if (!doc) { console.log(`  [missing] posts/${id} — skipping (stale mirror?)`); continue; }
  if (doc.slug !== slug) { console.error(`  ✗ posts/${id} slug mismatch (${doc.slug}) — skipping`); continue; }
  if (bodyHas(doc.content, sentinel)) { console.log(`  [unchanged] posts/${id} already carries "${sentinel}…"`); continue; }
  if (alreadyLinked(doc.content, url)) { console.log(`  [unchanged] posts/${id} already links ${url}`); continue; }
  appended += 1;
  console.log(`  [append] posts/${id} ${slug.slice(0, 44)} → ${url}`);
  if (EXECUTE) {
    await payload.update({
      collection: 'posts', id, draft: false,
      data: { content: [...(doc.content ?? []), block([paragraph])], ...publishGuard(doc) },
    });
    const check = await payload.findByID({ collection: 'posts', id, depth: 0, draft: false });
    console.log(bodyHas(check.content, sentinel) && check._status === 'published' ? '      ✓ written and re-read' : '      ✗ RE-READ FAILED — inspect');
  }
}

console.log(`\n${rewritten} link rewrites, ${appended} discovery paragraphs ${EXECUTE ? 'applied' : 'pending'}.`);
process.exit(0);
