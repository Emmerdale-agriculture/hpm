#!/usr/bin/env node
/**
 * scripts/fix-truncated-meta-titles-2026-W36.mjs
 *
 * Repairs meta titles that autoDerive cut mid-phrase, plus one description
 * crediting the wrong company.
 *
 * `titleCut()` in auto-derive.ts trims a long post title to fit the 70-char
 * `seo.metaTitle` limit without adding an ellipsis. When the cut lands mid
 * sentence the result is a title tag that simply stops:
 *
 *   "How my £30m business Videscape (Clickasnap.com) was stolen by Jason"
 *   "Taylor Wessing and HMRC get stung for £500,000 after spectacular"
 *   "Relieving Ground Compaction in Horse Paddocks: How We Restore Healthy"
 *   "Revolutionize Your Field Maintenance with the Chapman PC150 Field"
 *
 * 17 published posts are auto-truncated this way. Four of them happen to cut
 * at a full stop or question mark and read as complete titles — posts 3, 58,
 * 69 and 71 — so they are deliberately left alone. The 13 below are the ones
 * that dangle.
 *
 * Rewrites keep the author's own framing and wording, shortened to fit; they
 * are not re-angled or softened. Every replacement is <= 70 characters (the
 * field limit) and is a complete phrase.
 *
 * Also fixes post 67, whose description credited "Emmerdale Agricultural
 * Services" on a Hampshire Paddock Management page. Post 69 had the same
 * defect ("Emmerdale Agriculture") and was corrected in the companion
 * fix-cruft-meta-descriptions script; 67 escaped that pass because its
 * description does not end in an ellipsis. It draws 121 impressions / 28d.
 *
 * Idempotent — each write is skipped when the value already matches.
 *
 *   Local mirror: node_modules/.bin/tsx --env-file=.env.local scripts/fix-truncated-meta-titles-2026-W36.mjs
 *   Prod:         DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *                   node_modules/.bin/tsx --env-file=.env.local \
 *                   scripts/fix-truncated-meta-titles-2026-W36.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const MAX_TITLE = 70;

/** [id, slug, newMetaTitle] */
const TITLES = [
  [40, 'unleashing-land-management-efficiency-exploring-the-ryetech-c2200chs-flail-collector',
    'Ryetech C2200CHS Flail Collector: Cut and Collect in One Pass'],
  [68, 'relieving-ground-compaction-in-horse-paddocks-how-we-restore-healthy-grazing-lan',
    'Relieving Ground Compaction in Horse Paddocks'],
  [42, 'unveiling-the-ultimate-mowing-solution-explore-the-kuhn-bp280-flail-mower',
    'KUHN BP280 Flail Mower: Performance and Where It Fits'],
  [44, 'wessex-dung-beetle-possibly-the-worst-designed-agricultural-machine-ever',
    'Wessex Dung Beetle: The Worst Designed Machine Ever?'],
  [14, 'how-videscape-ta-clickasnap-ceo-jason-hill-stole-the-company-crashed-it-into-the-ground-and-left-100-shareholders-with-nothing',
    'ClickAScam? How Videscape’s CEO Stole a Company'],
  [32, 'seedsight-the-simple-battery-free-hopper-level-sensor-for-seeders-fertiliser-and-storage-bins',
    'SeedSight: Battery-Free Hopper Level Sensor'],
  [11, 'how-my-30m-business-videscape-clickasnap-com-was-stolen-by-jason-hill-and-collapsed-into-1m-in-debt-in-12-months',
    'How My £30m Business Videscape (ClickASnap) Was Stolen'],
  [8, 'elevate-your-land-management-the-deleks-flail-collector-unleashes-efficiency-and-performance',
    'DELEKS Flail Collector: Efficiency and Performance'],
  [31, 'revolutionize-your-field-maintenance-with-the-chapman-pc150-field-sweeper-a-comprehensive-guide',
    'Chapman PC150 Field Sweeper: A Complete Guide'],
  [10, 'how-jason-hill-intentionally-misled-auditors-knight-goodhead-to-fabricate-a-directors-loan-account',
    'How Jason Hill Misled Auditors Over a Director’s Loan Account'],
  [37, 'taylor-wessing-and-hmrc-get-stung-for-500000-after-spectacular-collapse-of-videscape-limited-clickasnap-com-under-jason-hill',
    'Taylor Wessing and HMRC Stung for £500,000 in Videscape Collapse'],
  [9, 'from-theft-to-triumph-clickasnap-founder-thomas-oswald-returns-with-lumenir',
    'From Theft to Triumph: ClickASnap Founder Returns With Lumenira'],
  [22, 'modern-machinery-and-paddock-care-in-hampshire-and-surrounding-counties',
    'Modern Machinery and Paddock Care in Hampshire'],
];

/** [id, slug, newMetaDescription] */
const DESCRIPTIONS = [
  [67, 'herbicide-thrust-for-ragwort-control-a-practical-guide-to-managing-ragwort-in-ho',
    'How Thrust herbicide controls ragwort, docks and other pasture weeds while protecting the grass around them. A practical guide for horse paddocks.'],
];

function validate() {
  const problems = [];
  for (const [id, slug, t] of TITLES) {
    if (t.length > MAX_TITLE) problems.push(`post ${id} (${slug}): title ${t.length} > ${MAX_TITLE}`);
    if (/\b(and|the|of|for|with|by|a|in|to)$/i.test(t.trim())) {
      problems.push(`post ${id} (${slug}): title still ends on a dangling word`);
    }
  }
  for (const [id, slug, d] of DESCRIPTIONS) {
    if (d.length > 160 || d.length < 70) problems.push(`post ${id} (${slug}): description ${d.length} chars`);
    if (/emmerdale/i.test(d)) problems.push(`post ${id} (${slug}): description still names the wrong company`);
  }
  return problems;
}

async function setField(payload, id, expectedSlug, field, value) {
  let doc = null;
  try {
    doc = await payload.findByID({ collection: 'posts', id, depth: 0 });
  } catch {
    doc = null;
  }
  if (!doc) {
    console.error(`  [missing] posts/${id} not found — skipping (stale mirror?)`);
    return 'missing';
  }
  if (doc.slug !== expectedSlug) {
    console.error(`  ✗ posts/${id} slug mismatch (${doc.slug}) — skipping`);
    return 'mismatch';
  }
  if (doc.seo?.[field] === value) {
    console.log(`  [unchanged] posts/${id}`);
    return 'unchanged';
  }
  console.log(`  [${field}] posts/${id}`);
  console.log(`         was: ${doc.seo?.[field] ?? ''}`);
  console.log(`         now: ${value}`);
  if (EXECUTE) {
    await payload.update({
      collection: 'posts',
      id,
      draft: false,
      // Re-assert publish state — payload.update() merges onto the latest
      // version, and a stale draft would otherwise unpublish a live page.
      data: {
        seo: { ...doc.seo, [field]: value },
        ...(doc._status === 'published' ? { _status: 'published' } : {}),
      },
    });
  }
  return 'written';
}

const problems = validate();
if (problems.length) {
  console.error('Refusing to run — copy failed validation:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`copy validated: ${TITLES.length} titles (all <= ${MAX_TITLE} chars, none dangling), ${DESCRIPTIONS.length} description\n`);

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] repairing truncated meta titles' : '[dry-run] use --execute to write');

const tally = {};
const bump = (r) => { tally[r] = (tally[r] ?? 0) + 1; };

console.log('\nTruncated titles:');
for (const [id, slug, t] of TITLES) bump(await setField(payload, id, slug, 'metaTitle', t));

console.log('\nWrong-company description:');
for (const [id, slug, d] of DESCRIPTIONS) bump(await setField(payload, id, slug, 'metaDescription', d));

console.log(`\n${Object.entries(tally).map(([k, v]) => `${k}: ${v}`).join('  ')}`);
console.log(`Done${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
