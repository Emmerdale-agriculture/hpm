#!/usr/bin/env node
/**
 * scripts/fix-cruft-meta-descriptions-2026-W36.mjs
 *
 * Rewrites every auto-derived meta description on the site.
 *
 * 44 published posts and 8 services had no hand-written
 * `seo.metaDescription`, so autoDerive filled it with the first ~160
 * characters of the body and cut it with an ellipsis. The results are what
 * Google has been showing as the snippet:
 *
 *   post 1   "@emmerdale.agricul … #CapCut♬ Timeless – Franksille The vast…"
 *            — a TikTok embed caption, verbatim, in the search result
 *   post 16  "Unveiling the Power of Precision… Introduction:…"
 *   post 13  "Introduction A patchy paddock can run havoc with the cost…"
 *   ~10 more open with the literal word "Introduction"
 *   service 2 "Fertiliser Spraying Pasture Spraying & Its Many Benefits…"
 *            — the page's own headings, run together
 *
 * These 52 pages drew 1,567 impressions in the 28 days to 2026-08-29, and
 * several of the biggest have never had a single click: post 16 (137 impr,
 * 0 clicks) and post 13 (121 impr, 0 clicks).
 *
 * Every replacement below was written from that page's actual rendered
 * content — no invented specifications, prices, dates or claims. The
 * ClickASnap / Videscape commentary posts are described in attributed terms
 * ("the founder's account of…") rather than restating contested allegations
 * about named people as fact in the site's own voice.
 *
 * Also trims four over-length descriptions that would truncate in the SERP,
 * one of which named the wrong company entirely:
 *   post 69      168 chars AND credited "Emmerdale Agriculture" on a
 *                Hampshire Paddock Management page
 *   post 62      198 chars
 *   service 15   173 chars
 *   service 6    161 chars
 *
 * Not touched: service 4 (field-ploughing). Its URL 308s to
 * /services/rotavating, so the description is never served.
 *
 * Idempotent — each write is skipped when the value already matches.
 *
 *   Local mirror: node_modules/.bin/tsx --env-file=.env.local scripts/fix-cruft-meta-descriptions-2026-W36.mjs
 *   Prod:         DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *                   node_modules/.bin/tsx --env-file=.env.local \
 *                   scripts/fix-cruft-meta-descriptions-2026-W36.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');

/** [id, slug, newMetaDescription] — slug is a guard, not a lookup key. */
const POSTS = [
  [1, 'can-you-mole-plough-using-a-compact-tractor-with-grass-tyres',
    "Can a compact tractor on grass tyres pull a mole plough? What we've found running a John Deere 4066M with a Danelander mole plough on soft paddock ground."],
  [2, 'case-study-burcombe-estate-vinery',
    'How we worked 25 acres of newly planted vines at Burcombe Estate in Wiltshire, where 2.2-metre row spacing ruled out every full-size tractor on the job.'],
  [3, 'case-study-ragwort-thistle-and-docks-overgrowth-how-do-you-get-rid-of-it-for-good',
    'Ragwort, docks and creeping thistle can take a field in a single season. A case study on clearing heavy weed overgrowth from a paddock, and keeping it gone.'],
  [4, 'combating-acid-soil-with-lime-spreading',
    'Why acid soil holds pasture back, how agricultural and dolomitic lime correct pH, and when lime spreading is worth doing on paddocks and grazing land.'],
  [5, 'creating-a-wildflower-meadow',
    'A step-by-step guide to turning a field or unused corner into a wildflower meadow: ground preparation, seed choice, timing and ongoing management.'],
  [6, 'discover-unique-characteristics-of-hampshire-paddocks',
    "From chalk downland to river-valley clay, Hampshire soils behave differently field to field. What that means for managing a paddock in this county."],
  [8, 'elevate-your-land-management-the-deleks-flail-collector-unleashes-efficiency-and-performance',
    'A look at the DELEKS flail collector for clearing overgrown ground: what it does in one pass, where it earns its keep, and how it handles heavy cover.'],
  [57, 'flat-fan-vs-air-inclusion-nozzles-for-paddock-spraying',
    'Flat fan or air inclusion? How nozzle choice changes drift, coverage and safety when spraying ragwort, docks and buttercups in horse paddocks.'],
  [9, 'from-theft-to-triumph-clickasnap-founder-thomas-oswald-returns-with-lumenir',
    'The story of ClickASnap, the pay-per-view photo platform, and founder Thomas Oswald’s return with Lumenira, told first-hand by the founder himself.'],
  [10, 'how-jason-hill-intentionally-misled-auditors-knight-goodhead-to-fabricate-a-directors-loan-account',
    'ClickASnap founder Thomas Oswald’s account of the disputed director’s loan account at Videscape Ltd and the audit records he says lie behind it.'],
  [11, 'how-my-30m-business-videscape-clickasnap-com-was-stolen-by-jason-hill-and-collapsed-into-1m-in-debt-in-12-months',
    'ClickASnap founder Thomas Oswald’s account of how a decade-long build to nearly £3m in revenue unravelled at Videscape Ltd, and what he says went wrong.'],
  [13, 'how-overseeding-transforms-patchy-paddocks-and-football-fields',
    'Bare spots and thinning grass push up feed bills. How overseeding thickens a patchy paddock or pitch, when to do it, and what results to expect.'],
  [14, 'how-videscape-ta-clickasnap-ceo-jason-hill-stole-the-company-crashed-it-into-the-ground-and-left-100-shareholders-with-nothing',
    'The witness statement ClickASnap founder Thomas Oswald gave to Hampshire police in February 2025 on the collapse of Videscape Ltd, published in full.'],
  [15, 'introducing-our-complete-paddock-and-field-rejuvenation-program',
    'Fence-walking, poaching and compaction wreck a paddock fast. Our full rejuvenation programme takes worn-out horse paddocks back to healthy grazing.'],
  [16, 'introducing-our-john-deere-aercore-1500',
    'The John Deere Aercore 1500 aerator: how deep-tine aeration relieves compaction on turf, sports fields and paddocks, and when it beats harrowing.'],
  [18, 'keeping-horse-paddocks-dry-the-dream-scenario',
    'If budget were no object, how would you keep horse paddocks dry through a UK winter? Working from the real cause of waterlogging to the ideal fix.'],
  [20, 'looking-for-local-shotblasting-services-in-romsey',
    'We restore our own plant and machinery in-house. What we learned looking for shotblasting near Romsey, and why it beats hand-cleaning old metalwork.'],
  [21, 'maximise-ploughing-success-with-key-field-tips',
    'Practical field ploughing tips: breaking compaction, improving aeration and turning in residue to leave ground that holds moisture and nutrients.'],
  [22, 'modern-machinery-and-paddock-care-in-hampshire-and-surrounding-counties',
    'How modern compact machinery cuts the cost of paddock maintenance in Hampshire, and what smallholders and landowners actually get for the money.'],
  [24, 'overcome-poor-soil-aeration-for-thriving-land',
    'Compacted soil starves roots of air and water. How to spot poor aeration on paddocks and grazing land, and the machinery that puts it right.'],
  [27, 'overcoming-smallholding-challenges-in-hampshire',
    'Weather, soil and workload are the three things that catch out Hampshire smallholders. Practical ways to keep a small paddock or farm manageable.'],
  [28, 'overseeding-with-hampshire-paddock-management',
    'Overseeding spreads new grass seed over existing pasture without turning the soil. What it improves, when to do it, and how we approach the job.'],
  [30, 'recognise-when-your-paddock-needs-professional-care',
    'Thin grass, standing water, weeds taking hold: the signs a paddock needs more than mowing, and when it is worth bringing in a contractor.'],
  [68, 'relieving-ground-compaction-in-horse-paddocks-how-we-restore-healthy-grazing-lan',
    'A paddock can look fine on top while the soil beneath is too compacted for grass to root or rain to drain. How we find compaction and relieve it.'],
  [31, 'revolutionize-your-field-maintenance-with-the-chapman-pc150-field-sweeper-a-comprehensive-guide',
    'The Chapman PC150 field sweeper for clearing debris from paddocks and sports turf: how it works, what it collects, and where it fits a maintenance routine.'],
  [32, 'seedsight-the-simple-battery-free-hopper-level-sensor-for-seeders-fertiliser-and-storage-bins',
    'Running a hopper empty mid-pass costs time, fuel and yield. SeedSight is a battery-free level indicator for seeders, fertiliser hoppers and storage bins.'],
  [36, 'start-strong-with-paddock-fertiliser-techniques',
    'When and how to apply paddock fertiliser in Hampshire: timing, rates and technique for stronger grass, fewer weeds and better grazing year-round.'],
  [58, 'super-compacted-paddocks-are-stopping-your-grass-growing-heres-how-to-fix-it',
    'Years of horses and machinery leave soil too tight for grass to root. How to tell whether compaction is the problem in your paddock, and how to fix it.'],
  [37, 'taylor-wessing-and-hmrc-get-stung-for-500000-after-spectacular-collapse-of-videscape-limited-clickasnap-com-under-jason-hill',
    'Videscape Ltd (ClickASnap) collapsed in June 2025 owing around £500,000 to creditors including Taylor Wessing and HMRC. What happened, and when.'],
  [38, 'the-deleks-1-4-metre-verge-flail-mower-dvolpe140-is-it-worth-it',
    'We paid £3,589 for the Deleks DVOLPE140 1.4m verge flail mower. An honest review after real use: build quality, hydraulics, and whether it is worth it.'],
  [39, 'turning-an-acre-of-rocks-into-an-acre-of-lush-thick-grass',
    'A development site left an acre of compacted rubble and stone. How we turned it into thick, established grass, start to finish.'],
  [40, 'unleashing-land-management-efficiency-exploring-the-ryetech-c2200chs-flail-collector',
    'The Ryetech C2200CHS flail collector cuts and collects in one pass. What it handles, where it saves time, and the ground it suits best.'],
  [41, 'unveiling-the-power-and-precision-of-the-john-deere-6130r',
    'The John Deere 6130R in our fleet: what this tractor brings to paddock and field work, and the jobs where its power and precision pay off.'],
  [42, 'unveiling-the-ultimate-mowing-solution-explore-the-kuhn-bp280-flail-mower',
    'The KUHN BP280 flail mower for fields, pasture and roadside verges: cutting performance, versatility, and the conditions it handles best.'],
  [56, 'using-envy-to-control-buttercups-in-horse-paddocks',
    'Buttercups crowd out productive grass and signal declining grazing. How we use Envy to control creeping and meadow buttercup in horse paddocks.'],
  [65, 'using-thrust-and-squire-ultra-to-control-bracken-in-grazing-land',
    'Bracken takes over paddocks, banks and rough grazing once established. How to control it with Squire Ultra and Thrust, and when to spray.'],
  [43, 'were-now-licensed-to-spray-heres-what-that-means-for-your-paddocks',
    'Hampshire Paddock Management is now PA1/PA2 certified to apply herbicides and pesticides. What licensed spraying means for your paddocks.'],
  [44, 'wessex-dung-beetle-possibly-the-worst-designed-agricultural-machine-ever',
    'An honest review of the self-powered Wessex Dung Beetle paddock sweeper, run behind a Honda Foreman across a 30-40 horse livery. It did not go well.'],
  [45, 'what-height-should-your-paddock-grass-be-in-winter',
    'Too long and it smothers, too short and it will not recover. The right winter grass height for horse paddocks, and how to manage pasture in the cold.'],
  [46, 'when-autumn-overseeding-fails-quick-fixes',
    'Autumn overseeding does not always take. Why seed fails to establish, and the quick fixes that still work before the ground gets too cold.'],
  [71, 'why-rotavating-a-paddock-can-create-a-weed-disaster-and-how-to-prevent-it',
    'Rotavating a rutted paddock looks great for a fortnight, then the weeds arrive. Why it happens, and how to reseed without causing a weed explosion.'],
  [66, 'why-we-flail-large-ragwort-before-spraying-hampshire-paddock-management',
    'When ragwort gets too big, spraying alone underperforms. Why we flail and collect large plants first, and how that improves long-term control.'],
  [47, 'why-you-shouldnt-ever-use-clickasnap',
    'ClickASnap’s founder on what the photo-sharing platform was built to be, what it became after he left, and why he no longer recommends it.'],
  [48, 'year-round-paddock-care-made-simple',
    'Paddock care is not a once-a-year job. A season-by-season guide to keeping grazing healthy, safe and productive through the whole year.'],

  // --- over-length trims (would truncate in the SERP) ---
  [69, 'can-thrust-herbicide-control-prostrate-knotweed-the-complete-guide-for-horse-pad',
    // was 168 chars AND credited "Emmerdale Agriculture" on an HPM page
    'Can Thrust control prostrate knotweed? Why compacted ground invites it, when spraying works, and how subsoiling and reseeding fix the cause.'],
  [62, 'finishing-vineyard-rows-sub-compact-tractor-stone-burier-seeder',
    // was 198 chars
    'Vineyard rows at Burcombe Estate finished with a sub-compact John Deere 2038R and Winton stone burier seeder: rotavate, bury stones and seed in one pass.'],
];

const SERVICES = [
  [2, 'fertiliser-application',
    'Pasture and paddock fertiliser spraying across Hampshire. Targeted nutrients for stronger, faster grass growth on horse paddocks and smallholdings.'],
  [14, 'finish-mowing',
    'Finish mowing for paddocks and amenity grass in Hampshire: a tighter, cleaner cut than a topper, with no scalping. Ideal for grass under six inches.'],
  [13, 'flail-collecting',
    'Flail collecting cuts and lifts growth in one pass, removing cuttings instead of mulching. Suits laminitic grazing and pre-reseed thatch clearance.'],
  [12, 'flailing',
    'Flail mowing for paddocks that have got away from you: brambles, nettles and rank growth shredded and mulched. Compact tractor access across Hampshire.'],
  [17, 'land-ditch-clearance',
    'Ditch, boundary and outfall clearance across Hampshire. Restore flow, dry out a flooding paddock, and stop water backing up into the field each winter.'],
  [11, 'seedsight',
    'SeedSight is a quick-fit, battery-free level indicator for seed drills, fertiliser hoppers and storage bins. Fits in minutes, checked at a glance.'],
  [16, 'stone-burying',
    'Stone burying buries stones and surface debris and leaves a fine, level seedbed. The cleanest ground preparation before reseeding, across Hampshire.'],

  // --- over-length trims ---
  [15, 'mole-ploughing',
    // was 173 chars
    'Compact-tractor mole ploughing: sub-soil drainage channels at 18-22 inches without disturbing the surface. Pipe-laying option, across Hampshire.'],
  [6, 'hedge-cutting',
    // was 161 chars
    'Hedge cutting and trimming across Hampshire: paddock and field boundaries, overgrown hedges, narrow lanes. Compact tractor with McConnel flail.'],
];

// Never write a description that would itself truncate, or that regresses to
// the cruft shape we are removing.
function validate() {
  const problems = [];
  for (const [kind, rows] of [['post', POSTS], ['service', SERVICES]]) {
    for (const [id, slug, desc] of rows) {
      if (desc.length > 160) problems.push(`${kind} ${id} (${slug}): ${desc.length} chars > 160`);
      if (desc.length < 70) problems.push(`${kind} ${id} (${slug}): ${desc.length} chars < 70`);
      if (desc.includes('…')) problems.push(`${kind} ${id} (${slug}): contains an ellipsis`);
      if (/^Introduction/i.test(desc)) problems.push(`${kind} ${id} (${slug}): opens with "Introduction"`);
    }
  }
  return problems;
}

async function setDesc(payload, collection, id, expectedSlug, desc) {
  let doc = null;
  try {
    doc = await payload.findByID({ collection, id, depth: 0 });
  } catch {
    doc = null;
  }
  if (!doc) {
    console.error(`  [missing] ${collection}/${id} not found — skipping (stale mirror?)`);
    return 'missing';
  }
  if (doc.slug !== expectedSlug) {
    console.error(`  ✗ ${collection}/${id} slug mismatch (${doc.slug}) — skipping`);
    return 'mismatch';
  }
  if (doc.seo?.metaDescription === desc) {
    console.log(`  [unchanged] ${collection}/${id} ${expectedSlug.slice(0, 44)}`);
    return 'unchanged';
  }
  console.log(`  [meta] ${collection}/${id} ${expectedSlug.slice(0, 44)}`);
  console.log(`         was: ${(doc.seo?.metaDescription ?? '').slice(0, 74)}`);
  console.log(`         now: ${desc.slice(0, 74)}`);
  if (EXECUTE) {
    await payload.update({
      collection,
      id,
      draft: false,
      // Re-assert publish state: payload.update() merges onto the latest
      // version, and a stale draft would otherwise unpublish a live page.
      data: {
        seo: { ...doc.seo, metaDescription: desc },
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
console.log(`copy validated: ${POSTS.length} posts + ${SERVICES.length} services, all 70-160 chars, no ellipses\n`);

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] rewriting meta descriptions' : '[dry-run] use --execute to write');

const tally = {};
const bump = (r) => { tally[r] = (tally[r] ?? 0) + 1; };

console.log('\nPosts:');
for (const [id, slug, desc] of POSTS) bump(await setDesc(payload, 'posts', id, slug, desc));

console.log('\nServices:');
for (const [id, slug, desc] of SERVICES) bump(await setDesc(payload, 'services', id, slug, desc));

console.log(`\n${Object.entries(tally).map(([k, v]) => `${k}: ${v}`).join('  ')}`);
console.log(`Done${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
