#!/usr/bin/env node
/**
 * scripts/apply-drainage-meta-rewrite-2026-W30.mjs
 *
 * Meta rewrite for the paddock-drainage post, from the 2026-07-20 follow-up
 * to the ranking-drop investigation:
 *
 *   "paddock drainage solutions" slid from pos 9–12 to 21.5 (w/c Jul 13),
 *   landing on posts/spotting-and-fixing-paddock-drainage-issues. That post's
 *   metaDescription is still imported cruft — it literally starts
 *   "Introduction Drainage might not be the first thing…". The W29 sweep
 *   fixed this pattern on posts 25 and 35 but missed this one (post 34 on
 *   prod). New meta targets the drainage-solutions query with an honest
 *   summary of what the post covers (signs, causes, aeration/ditch fixes).
 *
 * Idempotent. Dry-run by default; pass --execute to write.
 *   Local mirror: node_modules/.bin/tsx scripts/apply-drainage-meta-rewrite-2026-W30.mjs
 *   Prod:         DATABASE_URL=$DATABASE_URL_PROD node_modules/.bin/tsx scripts/apply-drainage-meta-rewrite-2026-W30.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');

// Slug-addressed (prod and local-mirror ids have diverged — never use ids).
const UPDATES = [
  {
    collection: 'posts',
    slug: 'spotting-and-fixing-paddock-drainage-issues',
    metaTitle: 'Paddock Drainage Solutions: Spotting and Fixing Wet Ground',
    metaDescription:
      'Standing water or boggy patches? How to spot paddock drainage issues, what causes them, and practical solutions — from a Hampshire land management contractor.',
  },
];

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] writing meta rewrite' : '[dry-run] use --execute to write');
console.log();

let updated = 0;
let unchanged = 0;
let missing = 0;

for (const u of UPDATES) {
  const res = await payload.find({
    collection: u.collection,
    where: { slug: { equals: u.slug } },
    limit: 1,
    depth: 0,
  });
  const doc = res.docs[0];
  if (!doc) {
    console.log(`  [missing] ${u.collection}/${u.slug}`);
    missing++;
    continue;
  }
  const cur = doc.seo ?? {};
  if (cur.metaTitle === u.metaTitle && cur.metaDescription === u.metaDescription) {
    console.log(`  [ok] ${u.collection}/${u.slug} already up to date`);
    unchanged++;
    continue;
  }
  console.log(`  [update] ${u.collection}/${u.slug} (id ${doc.id})`);
  console.log(`      title: ${JSON.stringify(cur.metaTitle ?? null)} → ${JSON.stringify(u.metaTitle)}`);
  console.log(`      desc:  ${JSON.stringify((cur.metaDescription ?? '').slice(0, 60))}… → ${JSON.stringify(u.metaDescription.slice(0, 60))}…`);
  if (EXECUTE) {
    await payload.update({
      collection: u.collection,
      id: doc.id,
      data: { seo: { ...cur, metaTitle: u.metaTitle, metaDescription: u.metaDescription } },
    });
  }
  updated++;
}

console.log();
console.log(`done: ${updated} updated, ${unchanged} unchanged, ${missing} missing${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
