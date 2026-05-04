#!/usr/bin/env node
/**
 * scripts/apply-seo-opportunities-2026-W19.mjs
 *
 * Applies the approved meta_rewrite drafts from the 2026-W19
 * SEO agent run (cron fired 2026-05-04 07:00 UTC). Drafts were
 * reviewed in chat and the chosen alternatives are pinned below
 * by alt index for reproducibility.
 *
 * Approvals applied here:
 *   #6 mole plough pipe laying  → posts.id 19 (Alt 3)
 *   #7 paddock topping          → services.id 9 (Alt 3)
 *   #8 rotavated soil           → posts.id 7  (Alt 1)
 *
 * Also flips seo_opportunities.status to 'completed' for the rows
 * once their target page has been updated.
 *
 * Idempotent. Dry-run by default; pass --execute to write.
 *
 * Run against prod:
 *   DATABASE_URL=$DATABASE_URL_PROD node scripts/apply-seo-opportunities-2026-W19.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');

const UPDATES = [
  {
    opportunityId: 6,
    collection: 'posts',
    targetId: 19,
    metaTitle: 'Mole Ploughing for Waterlogged Fields | Hampshire',
    metaDescription:
      'Struggling with swampy paddocks after rain? Mole ploughing and pipe laying across Hampshire and the South of England help drain heavy, wet ground.',
  },
  {
    opportunityId: 7,
    collection: 'services',
    targetId: 9,
    metaTitle: 'Paddock Topping Services for Horse Owners in Hampshire',
    metaDescription:
      'Paddock topping for horse owners and smallholders in Hampshire. Help control docks, thistles and ragged grass to keep your grazing in better condition.',
  },
  {
    opportunityId: 8,
    collection: 'posts',
    targetId: 7,
    metaTitle: 'Rotavated Soil & Field Rotavating in Hampshire',
    metaDescription:
      'Professional field rotavating across Hampshire to improve soil structure, aeration and seedbed preparation for paddocks, fields and pasture.',
  },
];

const payload = await getPayload({ config });

console.log(EXECUTE ? '[execute] writing meta updates + marking completed' : '[dry-run] use --execute to write');
console.log();

let updated = 0;
let unchanged = 0;
let missing = 0;
let opportunitiesCompleted = 0;

for (const u of UPDATES) {
  const doc = await payload.findByID({
    collection: u.collection,
    id: u.targetId,
    depth: 0,
  }).catch(() => null);

  if (!doc) {
    console.log(`  [missing] ${u.collection}/${u.targetId}`);
    missing++;
    continue;
  }

  const cur = doc.seo ?? {};
  const sameTitle = cur.metaTitle === u.metaTitle;
  const sameDesc = cur.metaDescription === u.metaDescription;
  const slug = doc.slug ?? '(no-slug)';

  if (sameTitle && sameDesc) {
    console.log(`  [unchanged] ${u.collection}/${slug}`);
    unchanged++;
  } else {
    console.log(`  [update] ${u.collection}/${slug}`);
    console.log(`    title was:  "${cur.metaTitle ?? '(none)'}"`);
    console.log(`    title now:  "${u.metaTitle}"`);
    console.log(`    desc was:   "${(cur.metaDescription ?? '(none)').slice(0, 100)}..."`);
    console.log(`    desc now:   "${u.metaDescription.slice(0, 100)}..."`);

    if (EXECUTE) {
      try {
        await payload.update({
          collection: u.collection,
          id: u.targetId,
          data: {
            seo: {
              ...cur,
              metaTitle: u.metaTitle,
              metaDescription: u.metaDescription,
            },
          },
        });
        updated++;
      } catch (err) {
        console.error(`    error: ${err instanceof Error ? err.message : err}`);
        continue;
      }
    }
  }

  if (EXECUTE) {
    try {
      await payload.update({
        collection: 'seo-opportunities',
        id: u.opportunityId,
        data: {
          status: 'completed',
          decidedAt: new Date().toISOString(),
        },
      });
      opportunitiesCompleted++;
    } catch (err) {
      console.error(`    [opp #${u.opportunityId}] could not mark completed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

console.log(`\nDone — ${updated} updated, ${unchanged} unchanged, ${missing} missing, ${opportunitiesCompleted} opportunities marked completed`);
process.exit(0);
