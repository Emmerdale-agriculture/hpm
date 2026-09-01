#!/usr/bin/env node
/**
 * scripts/apply-seo-opportunities-2026-W36.mjs
 *
 * Closes the seven pending W36 seo_opportunities from the 2026-09-01 agent
 * run (run_1788246022962), plus two cruft-meta fixes the agent can't see
 * (it only reads GSC, never the current page).
 *
 * What the September GSC review actually found, and what this does:
 *
 *  #48 "mcconnel hedge cutter" (104 impr, pos 17.8) + #49 "mcconnel tractor"
 *      (55 impr, pos 18.6) — both land on post 17, which is the site's best
 *      hedge asset (602 impr, 3.3% CTR) and structurally a stub: its only
 *      heading is "Conclusion". One combined equipment section + FAQ +
 *      closing links. #49 is superseded by #48 (same page, one change).
 *
 *  #46 "paddock spraying" (44 impr, pos 10.0) — the diagnosis changed. GSC
 *      URL Inspection says /services/spraying is "URL is unknown to Google",
 *      lastCrawlTime NEVER, despite being in the sitemap since W29 and
 *      carrying a fresh lastmod. Its only inbound links are the sitewide
 *      footer and the /services index — no in-content links anywhere. So
 *      the W31 meta rewrite was applied to a page Google has not fetched.
 *      Fix is discovery, not copy: in-content links from the three
 *      highest-impression spray notes (69 / 65 / 67). This is the same
 *      lever that got /carbide-mole-plough crawled and indexed inside five
 *      days in August. The agent's homepage-H2 draft is again NOT applied.
 *
 *  #47 "grass harrowing" + #51 "paddock harrowing" — both drafts propose
 *      content post 29 already carries from W31 (definition, how often,
 *      wet-ground warning, harrowing-vs-aeration). Superseded rather than
 *      duplicated. The real issue on this cluster is that post 29 and
 *      post 70 (published 1 Aug) compete for the same head term; Tom chose
 *      to differentiate rather than consolidate, so post 70 is retargeted
 *      to the "why / benefits" angle and cross-linked to post 29 for the
 *      "signs" angle.
 *
 *  #50 "mole plough pipe laying" (33 impr, pos 9.8) — W31's mole-vs-pipe
 *      section is live and the cluster now converts ("mole plough water
 *      pipe" 25 impr / 1 click, "pipe laying mole plough" 17 / 1). The new
 *      draft asserted pipe diameters and working depths that aren't
 *      verifiable from anything on the site — not applied. Superseded.
 *
 *  #45 "paddock maintenance" (115 impr, pos 3.1) — third raise of this
 *      query. Homepage meta was rewritten in code in July; position has
 *      gone 7.9 → 6.8 → 3.1 and the homepage runs 3.8% CTR / 40 clicks
 *      over 28d. Superseded: monitor, don't layer another change.
 *
 *  Cruft metas the agent cannot see (both are imported-body leftovers
 *  ending in an ellipsis, on high-impression pages):
 *    post 33 (rolling)     1,025 impr, 1.1% CTR — "…Introduction…"
 *    service 7 overseeding   165 impr, pos 37.3, 0 clicks — opens
 *                            "Overseeding Overseeding is a vital lawn care
 *                            practice…" (duplicated word, and it's about
 *                            lawns, not paddocks).
 *
 * Idempotent: sentinel-guarded appends, meta writes skip when already set,
 * link appends skip when the target URL is already linked, slug-guarded
 * throughout. Safe to re-run.
 *
 *   Local mirror: node_modules/.bin/tsx scripts/apply-seo-opportunities-2026-W36.mjs
 *   Prod:         DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *                   node_modules/.bin/tsx --env-file=.env.local \
 *                   scripts/apply-seo-opportunities-2026-W36.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');

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
const richTextBlock = (children) => ({
  blockType: 'richText',
  content: {
    root: { type: 'root', format: '', indent: 0, version: 1, direction: 'ltr', children },
  },
});

// ------------------------------------------------- #48 + #49 — post 17
const MCCONNEL_POST_ID = 17;
const MCCONNEL_SLUG =
  'introducing-our-mcconnel-pa3430-hedge-cutter-and-compact-tractor-equipment-for-those-hard-to-reach-areas';
const MCCONNEL_SENTINEL = 'McConnel PA3430 Hedge Cutter: Reach, Access and What It Cuts';

const MCCONNEL_BLOCK = richTextBlock([
  heading('h2', MCCONNEL_SENTINEL),
  para([
    text(
      "The PA3430 is the compact end of McConnel's power-arm range, giving a 3.4 metre reach from the tractor. We run ours on a compact tractor rather than a full-size machine, and that pairing is the whole point of it: narrow gateways, soft ground, pony paddocks and smallholding boundaries where a large tractor and hedge cutter would either not physically fit or leave ruts down the fence line.",
    ),
  ]),
  para([
    text(
      "In practice it handles roadside and boundary hedges, overhanging growth above post-and-rail fencing, and light scrub along ditch lines. The flail head suits green growth and the woody regrowth of a season or two. Hedges that have been left for years get taken back in stages rather than forced through in one pass — it's kinder to the hedge and it leaves a tidier finish.",
    ),
  ]),
  heading('h2', 'Common Questions About the McConnel PA3430'),
  heading('h3', 'What reach does the McConnel PA3430 have?'),
  para([
    text(
      '3.4 metres from the tractor, which is enough to trim most paddock and field boundary hedges working from inside the field rather than off the road or the verge.',
    ),
  ]),
  heading('h3', 'Can a McConnel hedge cutter run on a compact tractor?'),
  para([
    text(
      "Yes — the PA3430 is designed for smaller tractors rather than the heavy machines the full-size Power Arm range needs, which is why we run it on a compact tractor. That combination is what gets us onto sites where ground conditions or access rule out a full-size tractor and hedge cutter.",
    ),
  ]),
  heading('h3', 'What size hedges can it cut?'),
  para([
    text(
      "It suits annual and biennial growth on paddock, roadside and garden boundary hedges. Heavier reinstatement work on long-neglected hedges is done in stages rather than pushing oversized material through the flail head.",
    ),
  ]),
  heading('h3', 'Where do you use it?'),
  para([
    text(
      'Across Hampshire and the surrounding counties, on horse paddocks, smallholdings and rural properties — particularly where the ground is soft or the access is too tight for larger kit.',
    ),
  ]),
  para([
    text('If your boundaries need taking back, our '),
    link('/services/hedge-cutting', 'hedge cutting and trimming service'),
    text(' covers Hampshire and the surrounding counties. Where growth has gone well beyond a hedge cutter, '),
    link('/services/land-ditch-clearance', 'land and ditch clearance'),
    text(' and '),
    link('/services/wood-chipping', 'wood chipping'),
    text(' pick up the heavier work.'),
  ]),
]);

// ------------------------------------------------------ post 70 retarget
// Tom's call: differentiate rather than consolidate. Post 70 owns the
// "why / benefits" angle; post 29 keeps "signs + how often". Each points
// at the other for the angle it doesn't own.
const WHYHARROW_POST_ID = 70;
const WHYHARROW_SLUG = 'paddock-harrowing-why-its-one-of-the-most-important-jobs-for-healthy-horse-grazi';
const WHYHARROW_META_TITLE = 'Why Harrow a Horse Paddock? Benefits, Timing & Mistakes';
const WHYHARROW_META_DESC =
  'Harrowing lifts dead thatch, spreads dung and levels hoof damage. The real benefits for horse grazing, the right time of year, and the mistakes to avoid.';
const WHYHARROW_SENTINEL = 'Not sure whether your paddock needs harrowing yet?';

const WHYHARROW_BLOCK = richTextBlock([
  para([
    text('Not sure whether your paddock needs harrowing yet? This post covers why harrowing matters and what it gives you; for the diagnosis side — matted thatch, thin patches, dung building up and the rest — read '),
    link('/notes/recognise-signs-your-paddock-needs-harrowing', 'the signs your paddock needs harrowing'),
    text('. When you want it done rather than done yourself, our '),
    link('/services/harrowing', 'paddock harrowing service'),
    text(' covers Hampshire and the surrounding counties.'),
  ]),
]);

// ------------------------------------------------------- post 33 (rolling)
const ROLLING_POST_ID = 33;
const ROLLING_SLUG = 'smooth-your-paddock-with-expert-rolling';
const ROLLING_META_TITLE = 'Paddock Rolling: How Often, When and Why It Works';
const ROLLING_META_DESC =
  'How often to roll a paddock, the ground conditions that matter, and what rolling actually fixes — hoof damage, loose surfaces and seed-to-soil contact.';

// --------------------------------------------------- service 7 (overseeding)
const OVERSEEDING_SERVICE_ID = 7;
const OVERSEEDING_SLUG = 'overseeding';
const OVERSEEDING_META_TITLE = 'Paddock Overseeding in Hampshire — Thicken Bare Grazing';
const OVERSEEDING_META_DESC =
  'Overseeding for horse paddocks and grazing land across Hampshire — fill bare patches, thicken a thin sward and crowd out weeds without a full reseed.';

// ------------------------------------------- #46 — /services/spraying links
// Discovery links only. /services/spraying has never been crawled; its
// only inbound links are the sitewide footer and the /services index.
const SPRAYING_URL = '/services/spraying';
const SPRAYING_LINK_TARGETS = [
  {
    collection: 'posts',
    id: 69,
    slug: 'can-thrust-herbicide-control-prostrate-knotweed-the-complete-guide-for-horse-pad',
    block: richTextBlock([
      para([
        text('Prostrate knotweed rarely turns up on its own. If it has taken hold across a paddock, our licensed '),
        link(SPRAYING_URL, 'paddock spraying service'),
        text(
          ' covers Hampshire and the surrounding counties — and we walk the field first to work out what is actually growing before anything goes in the tank.',
        ),
      ]),
    ]),
  },
  {
    collection: 'posts',
    id: 65,
    slug: 'using-thrust-and-squire-ultra-to-control-bracken-in-grazing-land',
    block: richTextBlock([
      para([
        text('Bracken control is a multi-season job rather than a single pass. If you would rather it was handled for you, our '),
        link(SPRAYING_URL, 'paddock spraying service'),
        text(' is PA1, PA2 and PA6 certified and covers Hampshire and the surrounding counties.'),
      ]),
    ]),
  },
  {
    collection: 'posts',
    id: 67,
    slug: 'herbicide-thrust-for-ragwort-control-a-practical-guide-to-managing-ragwort-in-ho',
    block: richTextBlock([
      para([
        text('Thrust does the work, but timing, rate and nozzle choice decide whether it holds. If you would rather it was done for you, our '),
        link(SPRAYING_URL, 'paddock spraying service'),
        text(' covers Hampshire and the surrounding counties with PA1, PA2 and PA6 certified boom and spot spraying.'),
      ]),
    ]),
  },
];

// ---------------------------------------------------------------- helpers
// Mirror drifts from prod (post 70 and services created after the snapshot
// simply aren't there), so a missing doc is a skip, not a crash.
async function findDoc(payload, collection, id, expectedSlug) {
  let doc = null;
  try {
    doc = await payload.findByID({ collection, id, depth: 0 });
  } catch {
    doc = null;
  }
  if (!doc) {
    console.error(`  [missing] ${collection}/${id} not found — skipping (stale mirror?)`);
    return null;
  }
  if (doc.slug !== expectedSlug) {
    console.error(`  ✗ ${collection}/${id} slug mismatch (${doc.slug}) — skipping`);
    return null;
  }
  return doc;
}

function bodyContains(blocks, needle) {
  for (const block of blocks ?? []) {
    if (block.blockType !== 'richText') continue;
    if (JSON.stringify(block.content?.root?.children ?? []).includes(needle)) return true;
  }
  return false;
}

const alreadyLinked = (blocks, url) =>
  JSON.stringify(blocks ?? []).includes(`"url":"${url}"`) ||
  JSON.stringify(blocks ?? []).includes(`"url": "${url}"`);

async function appendBlock(payload, collection, id, expectedSlug, sentinel, block) {
  const doc = await findDoc(payload, collection, id, expectedSlug);
  if (!doc) return null;
  if (bodyContains(doc.content, sentinel)) {
    console.log(`  [unchanged] "${sentinel.slice(0, 52)}…" already present`);
    return doc;
  }
  console.log(`  [append] "${sentinel.slice(0, 52)}…" (${(doc.content ?? []).length} → ${(doc.content ?? []).length + 1} blocks)`);
  if (EXECUTE) {
    await payload.update({
      collection, id,
      data: { content: [...(doc.content ?? []), block] },
    });
    console.log('  ✓ appended');
  }
  return doc;
}

async function setMeta(payload, collection, id, expectedSlug, metaTitle, metaDesc) {
  const doc = await findDoc(payload, collection, id, expectedSlug);
  if (!doc) return;
  const changes = {};
  if (metaTitle && doc.seo?.metaTitle !== metaTitle) changes.metaTitle = metaTitle;
  if (metaDesc && doc.seo?.metaDescription !== metaDesc) changes.metaDescription = metaDesc;
  if (!Object.keys(changes).length) {
    console.log('  [unchanged] meta already set');
    return;
  }
  for (const [k, v] of Object.entries(changes)) {
    console.log(`  [meta] ${k}: "${(doc.seo?.[k] ?? '').slice(0, 80)}" →\n         "${v}"`);
  }
  if (EXECUTE) {
    await payload.update({ collection, id, data: { seo: { ...doc.seo, ...changes } } });
    console.log('  ✓ meta updated');
  }
}

async function appendLink(payload, t, url) {
  const doc = await findDoc(payload, t.collection, t.id, t.slug);
  if (!doc) return;
  if (alreadyLinked(doc.content, url)) {
    console.log(`  [unchanged] ${t.collection}/${t.slug.slice(0, 46)} already links ${url}`);
    return;
  }
  console.log(`  [append] ${t.collection}/${t.slug.slice(0, 46)} → ${url}`);
  if (EXECUTE) {
    await payload.update({
      collection: t.collection, id: t.id,
      data: { content: [...(doc.content ?? []), t.block] },
    });
    console.log('    ✓ written');
  }
}

async function decideOpp(payload, id, status, notes) {
  let opp = null;
  try {
    opp = await payload.findByID({ collection: 'seo-opportunities', id, depth: 0 });
  } catch {
    opp = null;
  }
  if (!opp) {
    console.log(`  [missing] opp #${id} — skipping (stale mirror?)`);
    return;
  }
  if (opp.status !== 'pending') {
    console.log(`  [ok] opp #${id} "${opp.query}" already ${opp.status}`);
    return;
  }
  console.log(`  [status] opp #${id} "${opp.query}": pending → ${status}`);
  if (EXECUTE) {
    await payload.update({
      collection: 'seo-opportunities',
      id,
      data: { status, notes, decidedAt: new Date().toISOString() },
    });
    console.log('  ✓ updated');
  }
}

// ------------------------------------------------------------------- main
const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] applying W36 opportunities' : '[dry-run] use --execute to write');

console.log('\n#48+#49 — post 17 (McConnel PA3430):');
await appendBlock(payload, 'posts', MCCONNEL_POST_ID, MCCONNEL_SLUG, MCCONNEL_SENTINEL, MCCONNEL_BLOCK);

console.log('\n#47+#51 — post 70 (why-harrow) retargeted away from post 29:');
await setMeta(payload, 'posts', WHYHARROW_POST_ID, WHYHARROW_SLUG, WHYHARROW_META_TITLE, WHYHARROW_META_DESC);
await appendBlock(payload, 'posts', WHYHARROW_POST_ID, WHYHARROW_SLUG, WHYHARROW_SENTINEL, WHYHARROW_BLOCK);

console.log('\n#46 — /services/spraying discovery links (never crawled by Google):');
for (const t of SPRAYING_LINK_TARGETS) await appendLink(payload, t, SPRAYING_URL);

console.log('\ncruft meta — post 33 (rolling, 1,025 impr / 1.1% CTR):');
await setMeta(payload, 'posts', ROLLING_POST_ID, ROLLING_SLUG, ROLLING_META_TITLE, ROLLING_META_DESC);

console.log('\ncruft meta — service 7 (overseeding, 165 impr / 0 clicks):');
await setMeta(payload, 'services', OVERSEEDING_SERVICE_ID, OVERSEEDING_SLUG, OVERSEEDING_META_TITLE, OVERSEEDING_META_DESC);

console.log('\nOpportunity bookkeeping:');
await decideOpp(payload, 48, 'completed',
  'Post 17 gained an equipment section (reach, access, what it cuts), a 4-question FAQ and closing links to hedge-cutting, land-ditch-clearance and wood-chipping. The post was structurally a stub — its only heading was "Conclusion" — despite being the site\'s best hedge asset at 602 impr / 3.3% CTR (W36).');
await decideOpp(payload, 49, 'superseded',
  'Same landing page as #48 (post 17). Folded into one combined equipment section rather than adding a second near-duplicate block to the same page.');
await decideOpp(payload, 46, 'completed',
  'Root cause was discovery, not copy: GSC URL Inspection reports /services/spraying as "URL is unknown to Google", never crawled, despite sitemap inclusion and a fresh lastmod — so the W31 meta rewrite landed on a page Google has not fetched. Added in-content links from posts 69/65/67 (the three highest-impression spray notes). Homepage H2 draft again not applied.');
await decideOpp(payload, 47, 'superseded',
  'Draft duplicates content post 29 has carried since W31 — definition, how often, wet-ground warning and the harrowing-vs-aeration distinction are all already live on the page. Underlying cluster issue (post 29 vs post 70 competing for the head term) handled by retargeting post 70 instead.');
await decideOpp(payload, 51, 'superseded',
  'Same duplication as #47: post 29 already answers "how often", "when not to" and "does it help with worms". Addressed instead by differentiating post 70 onto the why/benefits angle and cross-linking the two.');
await decideOpp(payload, 50, 'superseded',
  'W31\'s mole-vs-pipe section is live on post 19 and the cluster now converts ("mole plough water pipe" 25 impr / 1 click, "pipe laying mole plough" 17 / 1; position stable ~9). The new draft asserted pipe diameters and working depths not verifiable from anything on the site, so it was not applied.');
await decideOpp(payload, 45, 'superseded',
  'Third raise of this query. Homepage meta was rewritten in code in July; position has moved 7.9 → 6.8 → 3.1 and the homepage runs 3.8% CTR / 40 clicks over the 28d window. Monitor rather than layering a fourth change.');

console.log(`\nDone${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
