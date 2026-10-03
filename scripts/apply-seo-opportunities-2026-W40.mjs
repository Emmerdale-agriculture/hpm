#!/usr/bin/env node
/**
 * scripts/apply-seo-opportunities-2026-W40.mjs
 *
 * Closes the seven pending W40 seo_opportunities from the 2026-10-01 agent
 * run (run_1790838023165) and fixes the structural gap the October review
 * found underneath them.
 *
 * What the review found (28d 2026-09-03 → 09-30, GSC + live crawl + DB):
 *
 *  Six of the seven opportunities land on two pages — post 29 (the
 *  harrowing "signs" note: #52 "harrowing a field", #54 "grass harrowing",
 *  #55 "harrowing grass", #57 "paddock harrowing") and the homepage
 *  (#53 "paddock maintenance", #58 "paddock management"). Post 29 ranks
 *  position 4–10 for ~20 harrowing variants (2,147 impr, 1.2% CTR) and the
 *  agent's drafts re-propose FAQs it has carried since W31. The homepage
 *  pair is the 4th and 3rd raise of the same two queries; the homepage
 *  meta was rewritten in code in July and the H2/FAQ draft has been
 *  declined three times. #56 "mole plough pipe laying" (post 19) is the
 *  third raise and the draft again asserts working depths (450–600mm)
 *  that nothing on the site supports — same reason W36 superseded #50.
 *
 *  The thing the agent cannot see: the W36 headings fix
 *  (fix-post-headings-2026-W36.mjs) skipped any post that already had a
 *  heading ANYWHERE, so the two posts whose imported body is still a
 *  wall of bold pseudo-headings are exactly the two with sections appended
 *  by W29/W31 — post 7 (rotavating, the site's #1 page, 3,384 impr,
 *  10 bold lines) and post 29 (#2 page, 6 bold lines). On top of that,
 *  17 imported posts carry 205 bullet points as "– " paragraphs rather
 *  than list nodes, and 7 posts have h3/h4 headings with no h2 at all
 *  (post 19's "Step-by-Step Guide to Laying Drainage Pipes…" is an h3
 *  under nothing).
 *
 * What this does, for every published non-commentary post, per rich-text block:
 *   1. A block with NO heading node and ≥2 bold-only paragraphs of 4–90
 *      chars: each becomes an h2 (an h3 when it is ≤2 words and follows a
 *      heading — "Clay Soils" under "Soil Types That Benefit Most…").
 *      "Introduction" lines are dropped, as in W36.
 *   2. A run of ≥2 consecutive paragraphs whose single text child starts
 *      with "– " becomes one bullet list; the dash is stripped.
 *   3. A block with h3/h4 headings and no h2: h3 → h2, h4 → h3, and a bare
 *      "Conclusion" heading is dropped (its paragraph stays).
 *   4. Post 29 only: a "How to Harrow a Field" section spliced in before
 *      its FAQ (closes #52), cross-linking post 70 (the why/benefits
 *      angle Tom chose to keep separate in W36) and the harrowing service.
 *   5. Opportunity bookkeeping: #52 completed; #53/#54/#55/#56/#57/#58
 *      superseded with the reason on the row.
 *
 * Idempotent: once a block has headings pass 1 skips it, once there are no
 * dash paragraphs pass 2 is a no-op, once an h2 exists pass 3 skips, the
 * post-29 splice is sentinel-guarded. A second run prints [unchanged]
 * throughout. Dry-run by default.
 *
 *   Local mirror: node_modules/.bin/tsx scripts/apply-seo-opportunities-2026-W40.mjs
 *   Prod:         DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *                   node_modules/.bin/tsx --env-file=.env.local \
 *                   scripts/apply-seo-opportunities-2026-W40.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

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

const singleText = (node) => {
  const kids = node?.children ?? [];
  if (node?.type !== 'paragraph' || kids.length !== 1) return null;
  const t = kids[0];
  return t?.type === 'text' && typeof t.text === 'string' ? t : null;
};
const plainText = (node) => (node?.type === 'text' ? node.text ?? '' : (node?.children ?? []).map(plainText).join(''));
const headingText = (node) => plainText(node).trim();

function isPseudoHeading(node) {
  const t = singleText(node);
  if (!t || ((t.format ?? 0) & BOLD) !== BOLD) return false;
  const len = t.text.trim().length;
  return len >= 4 && len <= 90;
}
const DASH = /^\s*–\s+/;
const isDashPara = (node) => {
  const t = singleText(node);
  return Boolean(t && DASH.test(t.text));
};

// ----------------------------------------------------------- the 3 passes
function pass1Headings(children, log) {
  if (children.some((n) => n?.type === 'heading')) return children;
  const candidates = children.filter(isPseudoHeading);
  if (candidates.length < 2) return children;
  const out = [];
  let seenHeading = false;
  for (const n of children) {
    if (!isPseudoHeading(n)) { out.push(n); continue; }
    const str = n.children[0].text.trim();
    if (str.toLowerCase() === 'introduction') { log(`✗ drop  "${str}"`); continue; }
    const tag = seenHeading && str.split(/\s+/).length <= 2 ? 'h3' : 'h2';
    out.push(heading(tag, str));
    seenHeading = true;
    log(`→ ${tag}   "${str}"`);
  }
  return out;
}

function pass2Lists(children, log) {
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length >= 2) {
      out.push(bulletList(run.map((n) => {
        const t = n.children[0];
        return [{ ...t, text: t.text.replace(DASH, '') }];
      })));
      log(`→ list  ${run.length} items ("${run[0].children[0].text.replace(DASH, '').slice(0, 40)}…")`);
    } else {
      out.push(...run);
    }
    run = [];
  };
  for (const n of children) {
    if (isDashPara(n)) { run.push(n); continue; }
    flush();
    out.push(n);
  }
  flush();
  return out;
}

function pass3Hierarchy(children, log) {
  const tags = children.filter((n) => n?.type === 'heading').map((n) => n.tag);
  if (tags.includes('h2') || !tags.some((t) => t === 'h3' || t === 'h4')) return children;
  const out = [];
  for (const n of children) {
    if (n?.type !== 'heading') { out.push(n); continue; }
    const str = headingText(n);
    if (str.toLowerCase() === 'conclusion') { log(`✗ drop  "${str}" (${n.tag})`); continue; }
    const tag = n.tag === 'h3' ? 'h2' : n.tag === 'h4' ? 'h3' : n.tag;
    if (tag !== n.tag) log(`${n.tag}→${tag}  "${str.slice(0, 60)}"`);
    out.push({ ...n, tag });
  }
  return out;
}

function restructure(blocks, log) {
  let changed = false;
  const next = (blocks ?? []).map((b, i) => {
    if (b.blockType !== 'richText') return b;
    const before = b.content?.root?.children ?? [];
    const blockLog = (m) => log(`block ${i + 1}: ${m}`);
    const after = pass3Hierarchy(pass2Lists(pass1Headings(before, blockLog), blockLog), blockLog);
    if (JSON.stringify(after) === JSON.stringify(before)) return b;
    changed = true;
    return { ...b, content: { ...b.content, root: { ...b.content.root, children: after } } };
  });
  return changed ? next : null;
}

// --------------------------------------------- #52 — post 29 how-to section
const HARROW_POST_ID = 29;
const HARROW_SLUG = 'recognise-signs-your-paddock-needs-harrowing';
const HARROW_FAQ_HEADING = 'Common Questions About Paddock Harrowing';
const HARROW_SENTINEL = 'How to Harrow a Field: Passes, Direction and Ground Conditions';
const HARROW_NODES = [
  heading('h2', HARROW_SENTINEL),
  para([
    text(
      'Harrowing a field well is mostly about conditions and direction rather than kit. Wait until the surface is firm enough to carry the tractor without leaving ruts but still has some moisture in it — in Hampshire that usually means a dry spell in spring once growth has started, or early autumn after the summer grazing. Frozen, waterlogged or baked-hard ground is a day to leave it alone.',
    ),
  ]),
  para([
    text(
      'We work a paddock in two passes at an angle to each other. The first pass pulls out dead thatch and moss, lifts flattened grass and breaks up dung piles; the second, crossing the first, spreads that material thinly so it dries out and the sward underneath gets light and air. A chain harrow has an aggressive side and a flat side — tines down for a field that is matted or poached, flat side up for a light tidy that levels shallow hoof marks. Rest the paddock for a few weeks before the horses go back on, and roll afterwards if the surface has been lifted.',
    ),
  ]),
  para([
    text('For the reasons the job matters in the first place, read '),
    link(
      '/notes/paddock-harrowing-why-its-one-of-the-most-important-jobs-for-healthy-horse-grazi',
      'why paddock harrowing is one of the most important jobs for healthy horse grazing',
    ),
    text('. If you would rather it was done for you, our '),
    link('/services/harrowing', 'paddock harrowing service'),
    text(' covers Hampshire and the surrounding counties.'),
  ]),
];

function spliceHowTo(blocks, log) {
  const all = JSON.stringify(blocks ?? []);
  if (all.includes(HARROW_SENTINEL)) { log('[unchanged] how-to section already present'); return null; }
  for (let bi = 0; bi < (blocks ?? []).length; bi += 1) {
    const b = blocks[bi];
    if (b.blockType !== 'richText') continue;
    const kids = b.content?.root?.children ?? [];
    const at = kids.findIndex((n) => n?.type === 'heading' && headingText(n) === HARROW_FAQ_HEADING);
    if (at < 0) continue;
    log(`[splice] "${HARROW_SENTINEL}" + 3 paragraphs before "${HARROW_FAQ_HEADING}" (block ${bi + 1}, index ${at})`);
    const next = [...blocks];
    next[bi] = { ...b, content: { ...b.content, root: { ...b.content.root, children: [...kids.slice(0, at), ...HARROW_NODES, ...kids.slice(at)] } } };
    return next;
  }
  log(`✗ FAQ heading "${HARROW_FAQ_HEADING}" not found — how-to NOT added`);
  return null;
}

// ---------------------------------------------------------------- helpers
// GOTCHA (post 70, 2026-09-01): payload.update() merges onto the LATEST
// version; a newer draft silently unpublishes the page. Always draft:false
// and re-assert _status for docs that were published when read.
const publishGuard = (doc) => (doc?._status === 'published' ? { _status: 'published' } : {});

async function writeContent(payload, doc, content, verify) {
  if (!EXECUTE) return;
  await payload.update({ collection: 'posts', id: doc.id, draft: false, data: { content, ...publishGuard(doc) } });
  const check = await payload.findByID({ collection: 'posts', id: doc.id, depth: 0, draft: false });
  const ok = check._status === 'published' && verify(check.content);
  console.log(ok ? '      ✓ written and re-read' : '      ✗ RE-READ FAILED — inspect this post');
}

async function decideOpp(payload, id, status, notes) {
  let opp = null;
  try { opp = await payload.findByID({ collection: 'seo-opportunities', id, depth: 0 }); } catch { opp = null; }
  if (!opp) { console.log(`  [missing] opp #${id} — skipping (stale mirror?)`); return; }
  if (opp.status !== 'pending') { console.log(`  [ok] opp #${id} "${opp.query}" already ${opp.status}`); return; }
  console.log(`  [status] opp #${id} "${opp.query}": pending → ${status}`);
  if (EXECUTE) {
    await payload.update({ collection: 'seo-opportunities', id, data: { status, notes, decidedAt: new Date().toISOString() } });
    console.log('  ✓ updated');
  }
}

// ------------------------------------------------------------------- main
const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] applying W40' : '[dry-run] use --execute to write');

const { docs } = await payload.find({
  collection: 'posts', where: { _status: { equals: 'published' } }, limit: 500, depth: 0, draft: false,
});

console.log(`\nStructure pass over ${docs.length} published posts:`);
let changedPosts = 0;
for (const doc of docs.sort((a, b) => a.id - b.id)) {
  if (doc.category === 'commentary') continue; // off-topic commentary posts stay as they are
  const lines = [];
  const next = restructure(doc.content, (m) => lines.push(m));
  if (!next) continue;
  changedPosts += 1;
  console.log(`  [restructure] posts/${doc.id} ${doc.slug.slice(0, 56)}`);
  for (const l of lines) console.log(`      ${l}`);
  await writeContent(payload, doc, next, (c) => restructure(c, () => {}) === null);
}
console.log(changedPosts ? `  ${changedPosts} posts ${EXECUTE ? 'restructured' : 'would change'}` : '  [unchanged] nothing to restructure');

console.log('\n#52 — post 29 how-to section:');
{
  let doc = null;
  try { doc = await payload.findByID({ collection: 'posts', id: HARROW_POST_ID, depth: 0, draft: false }); } catch { doc = null; }
  if (!doc || doc.slug !== HARROW_SLUG) console.log(`  [missing] posts/${HARROW_POST_ID} (${doc?.slug ?? 'not found'}) — skipping`);
  else {
    const next = spliceHowTo(doc.content, (m) => console.log(`  ${m}`));
    if (next) await writeContent(payload, doc, next, (c) => JSON.stringify(c).includes(HARROW_SENTINEL));
  }
}

console.log('\nOpportunity bookkeeping:');
await decideOpp(payload, 52, 'completed',
  'Post 29 (the landing page for ~20 harrowing variants at pos 4–10, 2,147 impr / 1.2% CTR) gained real structure — its six imported pseudo-headings were bold paragraphs and its 21 bullet points were "– " paragraphs, missed by the W36 headings fix because the W31 block already had headings — plus a "How to Harrow a Field" section before the FAQ, cross-linked to post 70 and the harrowing service. The draft\'s four FAQs duplicate the five already live since W31 and were not added (W40).');
await decideOpp(payload, 54, 'superseded',
  'Same landing page as #52 (post 29) and the draft\'s definition/timing/how-often/compaction FAQs are already on the page from W31. One change per page: handled by the #52 restructure + how-to section.');
await decideOpp(payload, 55, 'superseded',
  'Same page and intent as #54/#52 (post 29, "harrowing grass" pos 18). No draft was produced; covered by the #52 change.');
await decideOpp(payload, 57, 'superseded',
  'Lands on post 29, not the service page (the service page holds 11 of 169 impressions at pos 37). Post 29\'s meta was rewritten for exactly this query in W31; third raise. Covered by the #52 restructure rather than another meta edit.');
await decideOpp(payload, 56, 'superseded',
  'Third raise on post 19. The page already carries a six-step "Laying Drainage Pipes with a Mole Plough" guide and W31\'s mole-vs-pipe section; the draft asserts 450–600mm working depths that nothing on the site supports (same reason #50 was superseded in W36). Applied instead: the page\'s h3/h4-only hierarchy was promoted so the pipe-laying guide is an h2, and the bare "Conclusion" heading dropped — in time for the Nov–Apr drainage season.');
await decideOpp(payload, 53, 'superseded',
  'Fourth raise of "paddock maintenance" on the homepage (after #42, #45). Homepage meta was rewritten in code in July; 28d position 5.3 with 42 clicks / 5.7% CTR on the page overall. The H2+FAQ draft has been declined three times; monitor, do not layer another change.');
await decideOpp(payload, 58, 'superseded',
  'Third raise of "paddock management" on the homepage (after #43). Not a brand query as the rationale claims. Same homepage H2/FAQ draft as #53; the draft also links to a post that is still a draft (post 63). Monitor.');

console.log(`\nDone${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
