#!/usr/bin/env node
/**
 * scripts/fix-media-alt-text-2026-W36.mjs
 *
 * Replaces filename-as-alt-text on the media that actually renders.
 *
 * 24 media records carried the filename as their alt attribute and 2 had no
 * alt at all — so screen readers and image search were being handed things
 * like "29807EB5-6F8D-4EB3-8D94-A47A3DBBD9AB", "IMG_3157" and
 * "cropped-Logo2-scaled-1.webp".
 *
 * Only the 15 below actually render on the live site: 6 as post/service hero
 * images and 9 in the /gallery grid. The rest are unreferenced or superseded
 * duplicates and are deliberately left alone — writing alt text for images
 * nothing displays is churn.
 *
 * Every description here was written after viewing the image. None are
 * inferred from the filename or the page it sits on, which matters, because
 * two of them do not show what their page is about (see MISMATCHES below).
 *
 * MISMATCHES worth Tom's attention — NOT changed here, since swapping a hero
 * photo is an editorial call, not a scripted one:
 *   media 148 is the hero for /services/mole-ploughing but shows a compact
 *     tractor FLAIL MOWING rough grass — no mole plough in frame.
 *   media 26 is the hero for /services/land-ditch-clearance but shows a
 *     cleared, levelled development plot — no ditch in frame.
 *
 * Idempotent — each write is skipped when the value already matches.
 *
 *   Local mirror: node_modules/.bin/tsx --env-file=.env.local scripts/fix-media-alt-text-2026-W36.mjs
 *   Prod:         DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *                   node_modules/.bin/tsx --env-file=.env.local \
 *                   scripts/fix-media-alt-text-2026-W36.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');

/** [id, filename (guard), alt] */
const MEDIA = [
  // --- hero images ---
  [26, 'IMG_5480-rotated-1.webp',
    'Cleared and levelled ground with tyre tracks across bare earth, brick footings and rubble to one side'],
  [130, '04F02D36-9E2A-4321-8BBB-039CF88E75E9-scaled-1.webp',
    'Mounted boom sprayer with a yellow tank hitched to a John Deere compact tractor on a wet yard'],
  [131, 'BEE3D605-E0A2-4DAE-80F6-6E8FD71888E7-scaled-1.webp',
    'Compact tractor spraying an overgrown grass paddock with the spray boom extended'],
  [148, '357509634_109629335519559_2372897170786813868_n-1.webp',
    'Compact tractor flail mowing rough grass beside an overgrown hedge line'],
  [152, 'Image22-1-scaled.webp',
    'Quad bike towing a Wessex Dung Beetle paddock sweeper, with horses grazing alongside'],
  [188, 'IMG_5410.jpeg',
    'Paddock overrun with seeded docks and dry grass, with a field barn beyond'],

  // --- gallery images ---
  [25, 'IMG_5478-rotated.webp',
    'John Deere compact tractor with a SpeedSeed 1500 seeder on a prepared bare-earth seedbed'],
  [27, 'IMG_5344-rotated.webp',
    'Freshly graded plot with dark topsoil spread across one half and stony ground on the other'],
  [28, 'IMG_5178-rotated.webp',
    'Stony bare ground after cultivation, ready for levelling and seeding'],
  [29, 'IMG_5173-rotated.webp',
    'View from the tractor seat over a red stone burier working across stony prepared ground'],
  [30, 'IMG_5346-rotated.webp',
    'Bare ground with patches of stone and brick rubble left behind by site works'],
  [145, '358414945_114802468335579_7700007628171532868_n-2.webp',
    'John Deere 4066R compact tractor topping a dry grass field'],
  [146, '357720763_109629362186223_3116903877035182897_n-1.webp',
    'John Deere 4066R flail mowing heavy green growth beside a hedge'],
  [158, 'Image1-scaled.webp',
    'John Deere compact tractor working front-on through tall weeds and rough growth'],
  [184, 'IMG_4899.jpeg',
    'John Deere 4066M compact tractor on parched grass beside pine woodland'],
];

function validate() {
  const problems = [];
  for (const [id, filename, alt] of MEDIA) {
    if (alt.length < 20) problems.push(`media ${id}: alt too short (${alt.length})`);
    if (alt.length > 125) problems.push(`media ${id}: alt too long (${alt.length})`);
    // The whole point is to stop shipping filenames as alt text.
    if (/\.(webp|jpe?g|png)$/i.test(alt)) problems.push(`media ${id}: alt looks like a filename`);
    if (alt.toLowerCase() === filename.toLowerCase()) problems.push(`media ${id}: alt equals filename`);
    if (/^(IMG_|DSC|PXL|[0-9A-F]{8}-)/i.test(alt)) problems.push(`media ${id}: alt starts like a camera filename`);
  }
  return problems;
}

async function setAlt(payload, id, expectedFilename, alt) {
  let doc = null;
  try {
    doc = await payload.findByID({ collection: 'media', id, depth: 0 });
  } catch {
    doc = null;
  }
  if (!doc) {
    console.error(`  [missing] media/${id} not found — skipping (stale mirror?)`);
    return 'missing';
  }
  if (doc.filename !== expectedFilename) {
    console.error(`  ✗ media/${id} filename mismatch (${doc.filename}) — skipping`);
    return 'mismatch';
  }
  if (doc.alt === alt) {
    console.log(`  [unchanged] media/${id}`);
    return 'unchanged';
  }
  console.log(`  [alt] media/${id}  was: ${doc.alt ?? '(empty)'}`);
  console.log(`                     now: ${alt}`);
  if (EXECUTE) {
    await payload.update({ collection: 'media', id, data: { alt } });
  }
  return 'written';
}

const problems = validate();
if (problems.length) {
  console.error('Refusing to run — alt text failed validation:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`alt text validated: ${MEDIA.length} images, all descriptive\n`);

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] writing alt text' : '[dry-run] use --execute to write');

const tally = {};
for (const [id, filename, alt] of MEDIA) {
  const r = await setAlt(payload, id, filename, alt);
  tally[r] = (tally[r] ?? 0) + 1;
}

console.log(`\n${Object.entries(tally).map(([k, v]) => `${k}: ${v}`).join('  ')}`);
console.log(`Done${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
