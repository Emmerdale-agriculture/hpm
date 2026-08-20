#!/usr/bin/env node
/**
 * scripts/fix-wood-chipping-specs-2026-W34.mjs
 *
 * Corrects the chipper spec on /services/wood-chipping.
 *
 * When the page was written the Timberwolf figures came from dealer listings,
 * which describe the TW 280FTR as an "8 inch" machine (some quote a 280×210mm
 * infeed). Tom's actual machine has a **10 inch × 8 inch mouth**, so the page
 * shipped with a wrong number in three places. Owner's spec wins.
 *
 *   body copy   "an 8-inch (210 mm) throat"  → "a 10 × 8 inch mouth"
 *   equipment   "8in (210mm) tracked chipper · 57 hp · ~7 t/hr"
 *               → "10 × 8in mouth · tracked, self-propelled · 57 hp"
 *   meta desc   "Tracked 8in chipper works off-road."
 *               → "Tracked chipper works off-road."
 *
 * The 57 hp Kubota and ~7 t/hr throughput are also dealer-listing figures and
 * have NOT been confirmed by Tom. The equipment line keeps 57 hp and the body
 * keeps both; if either is wrong they need the same treatment. Flagged rather
 * than silently dropped.
 *
 * apply-wood-chipping-service-2026-W34.mjs has been corrected at source too, so
 * a from-scratch run produces the right copy. That script is sentinel-guarded
 * on a heading and will report "already built" against a database where the
 * page exists, which is why this separate patch is needed for prod.
 *
 * Asserts the exact old string is present before replacing, so it cannot
 * silently no-op or double-apply. Idempotent: reports [ok] once corrected.
 *
 *   Local mirror:
 *     node_modules/.bin/tsx --env-file=.env.local scripts/fix-wood-chipping-specs-2026-W34.mjs
 *
 *   Prod (dry-run first, then add --execute):
 *     DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *       node_modules/.bin/tsx --env-file=.env.local \
 *       scripts/fix-wood-chipping-specs-2026-W34.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const SLUG = 'wood-chipping';

const BODY_OLD = 'a tracked, self-propelled chipper with an 8-inch (210 mm) throat, a 57 hp Kubota engine';
const BODY_NEW = 'a tracked, self-propelled chipper with a 10 × 8 inch mouth, a 57 hp Kubota engine';

const EQUIP_NAME = 'Timberwolf TW 280FTR';
const EQUIP_OLD_SPEC = '8in (210mm) tracked chipper · 57 hp · ~7 t/hr';
const EQUIP_NEW_SPEC = '10 × 8in mouth · tracked, self-propelled · 57 hp';

const META_OLD = 'site clearance. Tracked 8in chipper works off-road. Same-day quotes.';
const META_NEW = 'site clearance. Tracked chipper works off-road. Same-day quotes.';

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] applying' : '[dry-run] use --execute to write');
console.log();

const res = await payload.find({
  collection: 'services',
  where: { slug: { equals: SLUG } },
  limit: 1,
  depth: 0,
});
const svc = res.docs[0];

if (!svc) {
  console.log(`  [ABORT] service /services/${SLUG} not found — run apply-wood-chipping-service-2026-W34.mjs first.`);
  process.exit(0);
}

const data = {};
let changes = 0;

// ---- body copy ---------------------------------------------------------------
{
  const blocks = Array.isArray(svc.content) ? JSON.parse(JSON.stringify(svc.content)) : [];
  const json = JSON.stringify(blocks);
  if (json.includes(BODY_NEW)) {
    console.log('  [ok] body already says "10 × 8 inch mouth"');
  } else if (!json.includes(BODY_OLD)) {
    console.log('  [WARN] body contains neither the old nor the new wording — leaving it alone.');
    console.log('         Someone has edited this paragraph; check /admin before re-running.');
  } else {
    // Walk the lexical tree and patch the text node, rather than string-
    // replacing the serialised JSON (which would corrupt escaping).
    let patched = 0;
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (typeof node.text === 'string' && node.text.includes(BODY_OLD)) {
        node.text = node.text.replace(BODY_OLD, BODY_NEW);
        patched++;
      }
      for (const child of node.children ?? []) walk(child);
      if (node.content?.root) walk(node.content.root);
    };
    for (const b of blocks) walk(b);
    console.log(`  [body] "an 8-inch (210 mm) throat" → "a 10 × 8 inch mouth" (${patched} text node${patched === 1 ? '' : 's'})`);
    data.content = blocks;
    changes++;
  }
}

// ---- equipment sidebar -------------------------------------------------------
{
  const equipment = Array.isArray(svc.equipment) ? JSON.parse(JSON.stringify(svc.equipment)) : [];
  const row = equipment.find((e) => e?.name === EQUIP_NAME);
  if (!row) {
    console.log(`  [WARN] no "${EQUIP_NAME}" equipment row — skipping.`);
  } else if (row.spec === EQUIP_NEW_SPEC) {
    console.log('  [ok] equipment spec already corrected');
  } else if (row.spec !== EQUIP_OLD_SPEC) {
    console.log(`  [WARN] equipment spec is "${row.spec}", not the expected original — leaving it alone.`);
  } else {
    console.log(`  [equip] "${EQUIP_OLD_SPEC}"`);
    console.log(`             → "${EQUIP_NEW_SPEC}"`);
    row.spec = EQUIP_NEW_SPEC;
    data.equipment = equipment;
    changes++;
  }
}

// ---- meta description --------------------------------------------------------
{
  const seo = svc.seo ?? {};
  const desc = seo.metaDescription ?? '';
  if (desc.includes(META_NEW)) {
    console.log('  [ok] meta description already corrected');
  } else if (!desc.includes(META_OLD)) {
    console.log(`  [WARN] meta description does not contain the expected text — leaving it alone.`);
  } else {
    const next = desc.replace(META_OLD, META_NEW);
    console.log(`  [meta] …${META_OLD}`);
    console.log(`            → …${META_NEW}   (${next.length} chars)`);
    data.seo = { ...seo, metaDescription: next };
    changes++;
  }
}

if (changes && EXECUTE) {
  await payload.update({ collection: 'services', id: svc.id, data });
  console.log(`  ✓ updated service ${svc.id}`);
}

console.log();
console.log(`done: ${changes} change${changes === 1 ? '' : 's'}${EXECUTE ? '' : ' (dry-run)'}`);
console.log('note: 57 hp and ~7 t/hr are still dealer-listing figures, unconfirmed by Tom.');
process.exit(0);
