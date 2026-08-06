#!/usr/bin/env node
/**
 * scripts/apply-seo-opportunities-2026-W31.mjs
 *
 * Closes the six pending W31 seo_opportunities from the 2026-08-01 agent
 * run (run_1785567603319). All six are 0-CTR queries that already rank:
 *
 *  #41 "paddock harrowing" (136 impr, pos 9.3) + #39 "grass harrowing"
 *      (49 impr, pos 12.3) — both land on post 29 (signs-harrowing).
 *      One combined change: meta rewrite + explainer H2 + FAQ block +
 *      closing links to the harrowing service / timing post / rolling.
 *      The "grass harrowing" alias is folded into the body, so #39 is
 *      superseded by #41 rather than getting a duplicate section.
 *  #40 "mole plough pipe laying" (34 impr, pos 9.4) — post 19's meta
 *      description already covers pipe laying (W29) but the title and
 *      body never mention it. Title tweak + short comparison H2.
 *  #44 "paddock spraying" (31 impr, pos 10.3) — the spraying SERVICE
 *      page ranks nowhere for it (the homepage does, badly). Service
 *      meta retargeted to "paddock spraying"; the agent's homepage-H2
 *      draft is deliberately NOT applied (homepage is a code route and
 *      a design decision).
 *  #42 "paddock maintenance" / #43 "paddock management" — homepage meta
 *      already rewritten in code (July); position improved 7.9 → ~5.5.
 *      Superseded: monitor, don't layer another change.
 *
 * Idempotent: sentinel-guarded appends, meta writes skip when already
 * set, slug-guarded targets.
 *   Local mirror: node_modules/.bin/tsx scripts/apply-seo-opportunities-2026-W31.mjs
 *   Prod:         DATABASE_URL=$DATABASE_URL_PROD node_modules/.bin/tsx scripts/apply-seo-opportunities-2026-W31.mjs --execute
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

// ---------------------------------------------------------------- post 29
const HARROWING_POST_ID = 29;
const HARROWING_SENTINEL = 'How Paddock Harrowing Works and What It Actually Does';
const HARROWING_META_TITLE = 'Paddock Harrowing: Signs Your Field Needs It & How It Works';
const HARROWING_META_DESC =
  'Thin grass, matted thatch, dung building up? The signs your paddock needs harrowing, what harrowing actually does, and when to call in a Hampshire contractor.';

const HARROWING_BLOCK = {
  root: {
    type: 'root', format: '', indent: 0, version: 1, direction: 'ltr',
    children: [
      heading('h2', HARROWING_SENTINEL),
      para([
        text(
          'Paddock harrowing — sometimes called grass harrowing or chain harrowing — is a mechanical grooming pass that pulls a set of tines or a chain-link mat across the surface of the field. The tines rake out dead thatch and moss, break up dung piles so they dry and stop harbouring worms, level minor hoof poaching, and lightly scratch the soil surface so light, air and rain can reach the crowns of the grass. Done at the right time, it wakes the sward up and encourages fresh tillering without the cost or disruption of reseeding.',
        ),
      ]),
      para([
        text(
          'On a typical horse paddock we harrow in spring once the ground has firmed up and again after topping through the season. Heavy, matted paddocks may need two passes at right angles to lift the thatch properly. Wet or frosted ground gets left alone — harrowing sodden fields smears the surface and does more harm than good.',
        ),
      ]),
      heading('h2', 'Common Questions About Paddock Harrowing'),
      heading('h3', 'What is paddock harrowing?'),
      para([
        text(
          "Dragging a set of tines or a chain harrow across the field to pull out dead grass and moss, spread dung, level light hoof damage and let air and light reach the base of the sward. It's a low-cost way to freshen up a paddock without reseeding.",
        ),
      ]),
      heading('h3', 'How often should a paddock be harrowed?'),
      para([
        text(
          'For most horse paddocks in Hampshire, twice a year is a sensible baseline — once in spring as growth starts, and again in late summer or early autumn. Heavily grazed or thatchy paddocks may benefit from an extra pass after topping.',
        ),
      ]),
      heading('h3', 'When should you not harrow a paddock?'),
      para([
        text(
          'Avoid harrowing when the ground is waterlogged, frozen or bone dry and hard. Wet ground smears rather than scratches, and hard ground just bounces the tines. Wait for a spell where the surface is moist but firm underfoot.',
        ),
      ]),
      heading('h3', 'Does harrowing help with worm control?'),
      para([
        text(
          "Harrowing breaks dung piles apart and spreads them thinly so they dry out in sun and wind, which reduces the survival of worm larvae on the pasture. It works best in hot, dry weather and is not a replacement for a proper worming programme, but it's a useful part of paddock hygiene.",
        ),
      ]),
      heading('h3', 'Do I need to roll after harrowing?'),
      para([
        text(
          "Often yes. Harrowing lifts and disturbs the surface, and rolling afterwards presses the sward back into contact with the soil, firms up any small divots and improves the finish. If you're overseeding, rolling after harrowing is particularly important for seed-to-soil contact.",
        ),
      ]),
      para([
        text('If the signs above look familiar, '),
        link('/services/harrowing', 'our paddock harrowing service'),
        text(' covers Hampshire and the surrounding counties — or read up on '),
        link('/notes/when-to-harrow-paddocks-timing-benefits-and-best-practices', 'when to harrow paddocks'),
        text(' and pairing it with '),
        link('/services/rolling', 'rolling afterwards to firm the surface'),
        text(' back down.'),
      ]),
    ],
  },
};

// ---------------------------------------------------------------- post 19
const DRAINAGE_POST_ID = 19;
const DRAINAGE_SENTINEL = 'Mole Ploughing or Pipe Laying — Which Does a Wet Field Need?';
const DRAINAGE_META_TITLE = 'Mole Ploughing & Pipe Laying for Waterlogged Fields | Hampshire';

const DRAINAGE_BLOCK = {
  root: {
    type: 'root', format: '', indent: 0, version: 1, direction: 'ltr',
    children: [
      heading('h2', DRAINAGE_SENTINEL),
      para([
        text(
          'They solve the same problem at different price points. Mole ploughing pulls a bullet-shaped foot through the subsoil to form an unlined drainage channel — quick, cheap per acre, and very effective in clay ground, but the channels gradually close and the job wants repeating every five years or so. Pipe laying puts perforated land drain into a trench with permeable backfill: a much bigger job, but a permanent one, and the right call for gateways, gathering areas and fields where moling has stopped holding.',
        ),
      ]),
      para([
        text(
          'In practice the two work together — mole channels run across the field and discharge into a piped main or open ditch. If your field is turning into a swamp after rain, we can look at the ground and tell you honestly whether a mole pass is enough or whether a section needs pipe. ',
        ),
        link('/services/mole-ploughing', 'Our mole ploughing and drainage service'),
        text(' covers Hampshire and the surrounding counties.'),
      ]),
    ],
  },
};

// -------------------------------------------------------------- service 18
const SPRAYING_SERVICE_ID = 18;
const SPRAYING_META_TITLE = 'Paddock Spraying in Hampshire — Licensed Contractor';
const SPRAYING_META_DESC =
  'Licensed paddock spraying across Hampshire — ragwort, docks, thistles, buttercups and nettles. PA1, PA2 and PA6 certified boom and spot spraying, fast quotes.';

// ---------------------------------------------------------------- helpers
function bodyContainsHeading(blocks, headingText) {
  for (const block of blocks ?? []) {
    if (block.blockType !== 'richText') continue;
    if (JSON.stringify(block.content?.root?.children ?? []).includes(headingText)) return true;
  }
  return false;
}

async function appendBlock(payload, id, expectedSlugPrefix, sentinel, block) {
  const post = await payload.findByID({ collection: 'posts', id, depth: 0 });
  if (!post || !post.slug?.startsWith(expectedSlugPrefix)) {
    console.error(`  ✗ post id ${id} missing or slug mismatch (${post?.slug}) — skipping`);
    return null;
  }
  if (bodyContainsHeading(post.content, sentinel)) {
    console.log(`  [unchanged] "${sentinel}" already present`);
  } else {
    console.log(`  [append] "${sentinel}" section`);
    if (EXECUTE) {
      await payload.update({
        collection: 'posts',
        id,
        data: { content: [...(post.content ?? []), { blockType: 'richText', content: block }] },
      });
      console.log('  ✓ appended');
    }
  }
  return post;
}

async function setMeta(payload, collection, id, expectedSlug, metaTitle, metaDesc) {
  const doc = await payload.findByID({ collection, id, depth: 0 });
  if (!doc || doc.slug !== expectedSlug) {
    console.error(`  ✗ ${collection}/${id} missing or slug mismatch (${doc?.slug}) — skipping`);
    return;
  }
  const changes = {};
  if (metaTitle && doc.seo?.metaTitle !== metaTitle) changes.metaTitle = metaTitle;
  if (metaDesc && doc.seo?.metaDescription !== metaDesc) changes.metaDescription = metaDesc;
  if (!Object.keys(changes).length) {
    console.log('  [unchanged] meta already set');
    return;
  }
  for (const [k, v] of Object.entries(changes)) {
    console.log(`  [meta] ${k}: "${doc.seo?.[k] ?? ''}" →\n         "${v}"`);
  }
  if (EXECUTE) {
    await payload.update({ collection, id, data: { seo: { ...doc.seo, ...changes } } });
    console.log('  ✓ meta updated');
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
console.log(EXECUTE ? '[execute] applying W31 opportunities' : '[dry-run] use --execute to write');

console.log('\n#41+#39 — post 29 (signs-your-paddock-needs-harrowing):');
await appendBlock(payload, HARROWING_POST_ID, 'recognise-signs-your-paddock-needs-harrowing', HARROWING_SENTINEL, HARROWING_BLOCK);
await setMeta(payload, 'posts', HARROWING_POST_ID, 'recognise-signs-your-paddock-needs-harrowing', HARROWING_META_TITLE, HARROWING_META_DESC);

console.log('\n#40 — post 19 (land-drainage):');
await appendBlock(payload, DRAINAGE_POST_ID, 'land-drainage-do-your-fields', DRAINAGE_SENTINEL, DRAINAGE_BLOCK);
await setMeta(
  payload, 'posts', DRAINAGE_POST_ID,
  'land-drainage-do-your-fields-just-turn-into-swamps-after-a-bit-of-rain',
  DRAINAGE_META_TITLE, null,
);

console.log('\n#44 — service 18 (spraying):');
await setMeta(payload, 'services', SPRAYING_SERVICE_ID, 'spraying', SPRAYING_META_TITLE, SPRAYING_META_DESC);

console.log('\nOpportunity bookkeeping:');
await decideOpp(payload, 41, 'completed',
  'Post 29 meta rewritten + explainer H2, 5-question FAQ block and closing links to /services/harrowing, the timing post and /services/rolling (W31).');
await decideOpp(payload, 39, 'superseded',
  'Same landing page as #41 (post 29); the grass-harrowing alias is folded into the #41 explainer body rather than duplicating a section.');
await decideOpp(payload, 40, 'completed',
  'Post 19 metaTitle now includes pipe laying (description already did since W29) + mole-vs-pipe comparison H2 appended with service link (W31).');
await decideOpp(payload, 44, 'completed',
  'Spraying service meta retargeted to "paddock spraying" + licensed signal. Homepage H2 draft deliberately not applied — homepage is a code route and its meta was already rewritten in July.');
await decideOpp(payload, 42, 'superseded',
  'Homepage title/description already rewritten in code (July); position improved 7.9 → ~5.5 by early August. Monitor rather than layering another change.');
await decideOpp(payload, 43, 'superseded',
  'Navigational brand-adjacent query on the homepage — same July meta rewrite applies; position improved to ~6. Monitor.');

console.log(`\nDone${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
