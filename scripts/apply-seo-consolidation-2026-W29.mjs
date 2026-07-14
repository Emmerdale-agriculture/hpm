#!/usr/bin/env node
/**
 * scripts/apply-seo-consolidation-2026-W29.mjs
 *
 * Phase-3 content consolidation from the 2026-07-14 SEO review.
 *
 * 1. MERGES — three near-duplicate posts competing for the same queries.
 *    The loser is unpublished and 301-redirected to the keeper:
 *      optimal-winter-paddock-grass-heights
 *        → what-height-should-your-paddock-grass-be-in-winter
 *          (identical opening copy; the keeper's title matches the query)
 *      how-overseeding-transforms-patchy-lawns
 *        → how-overseeding-transforms-patchy-paddocks-and-football-fields
 *          (same topic; keeper targets paddocks, on-niche)
 *      paddock-management-hampshire-what-it-involves
 *        → paddock-management
 *          (keeper carries this year's on-page rank-push work — 1fee7ba)
 *
 * 2. QUARANTINE — off-topic posts move from category 'paddock' to
 *    'commentary' (the category built for exactly this) so they stop
 *    diluting the paddock-services topical focus. They stay published
 *    and indexable.
 *
 * Idempotent. Dry-run by default; pass --execute to write.
 *   Local mirror: node_modules/.bin/tsx scripts/apply-seo-consolidation-2026-W29.mjs
 *   Prod:         DATABASE_URL=$DATABASE_URL_PROD node_modules/.bin/tsx scripts/apply-seo-consolidation-2026-W29.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');

const MERGES = [
  {
    loser: 'optimal-winter-paddock-grass-heights',
    keeper: 'what-height-should-your-paddock-grass-be-in-winter',
  },
  {
    loser: 'how-overseeding-transforms-patchy-lawns',
    keeper: 'how-overseeding-transforms-patchy-paddocks-and-football-fields',
  },
  {
    loser: 'paddock-management-hampshire-what-it-involves',
    keeper: 'paddock-management',
  },
];

const COMMENTARY_SLUGS = [
  'from-theft-to-triumph-clickasnap-founder-thomas-oswald-returns-with-lumenir',
  'how-videscape-ta-clickasnap-ceo-jason-hill-stole-the-company-crashed-it-into-the-ground-and-left-100-shareholders-with-nothing',
  'taylor-wessing-and-hmrc-get-stung-for-500000-after-spectacular-collapse-of-videscape-limited-clickasnap-com-under-jason-hill',
  'how-jason-hill-intentionally-misled-auditors-knight-goodhead-to-fabricate-a-directors-loan-account',
  'how-my-30m-business-videscape-clickasnap-com-was-stolen-by-jason-hill-and-collapsed-into-1m-in-debt-in-12-months',
  'why-you-shouldnt-ever-use-clickasnap',
  'seedsight-the-simple-battery-free-hopper-level-sensor-for-seeders-fertiliser-and-storage-bins',
];

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] consolidating' : '[dry-run] use --execute to write');
console.log();

const bySlug = async (slug) =>
  (await payload.find({ collection: 'posts', where: { slug: { equals: slug } }, limit: 1, depth: 0 })).docs[0] ?? null;

let changes = 0;

// ---- 1. merges -----------------------------------------------------------
for (const m of MERGES) {
  const loser = await bySlug(m.loser);
  const keeper = await bySlug(m.keeper);
  if (!keeper) {
    console.log(`  [skip] keeper /notes/${m.keeper} not found — NOT touching ${m.loser}`);
    continue;
  }
  if (!loser) {
    console.log(`  [skip] loser /notes/${m.loser} not found (already merged?)`);
  } else if (loser._status === 'published') {
    console.log(`  [unpublish] /notes/${m.loser} (id ${loser.id})`);
    if (EXECUTE) {
      await payload.update({ collection: 'posts', id: loser.id, data: { _status: 'draft' } });
    }
    changes++;
  } else {
    console.log(`  [ok] /notes/${m.loser} already unpublished`);
  }

  const from = `/notes/${m.loser}`;
  const to = `/notes/${m.keeper}`;
  const existing = await payload.find({
    collection: 'redirects',
    where: { from: { equals: from } },
    limit: 1,
    depth: 0,
  });
  if (existing.docs.length > 0) {
    console.log(`  [ok] redirect ${from} already exists`);
  } else {
    console.log(`  [redirect] ${from} → ${to} (301)`);
    if (EXECUTE) {
      await payload.create({
        collection: 'redirects',
        data: {
          from,
          to,
          statusCode: '301',
          active: true,
          notes: 'Duplicate-topic merge — 2026-07-14 SEO review (phase 3).',
        },
      });
    }
    changes++;
  }
}

// ---- 2. commentary quarantine ---------------------------------------------
console.log();
for (const slug of COMMENTARY_SLUGS) {
  const post = await bySlug(slug);
  if (!post) {
    console.log(`  [missing] /notes/${slug}`);
    continue;
  }
  if (post.category === 'commentary') {
    console.log(`  [ok] /notes/${slug} already commentary`);
    continue;
  }
  console.log(`  [category] /notes/${slug}: ${post.category} → commentary`);
  if (EXECUTE) {
    await payload.update({ collection: 'posts', id: post.id, data: { category: 'commentary' } });
  }
  changes++;
}

console.log();
console.log(`done: ${changes} changes${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
