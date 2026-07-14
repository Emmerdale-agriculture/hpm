#!/usr/bin/env node
/**
 * scripts/apply-seo-meta-rewrites-2026-W29.mjs
 *
 * Phase-1 meta rewrites from the 2026-07-14 SEO review. Targets the pending
 * GSC opportunities with the strongest numbers (all currently 0% CTR):
 *
 *   paddock harrowing        144 impr  pos 14.6  → services/harrowing
 *   paddock topping        64+33 impr  pos ~9    → services/paddock-topping
 *   how often ... rolled?     30 impr  pos 1.2   → services/rolling (question
 *                                                  phrasing into the meta)
 *   rotavate/rotavating soil  79 impr  pos ~13   → services/rotavating
 *   when to harrow paddocks   31 impr  pos 51.8  → posts/when-to-harrow-…
 *
 * Plus two hygiene fixes found in the live crawl:
 *   - services/weed-control titled "Ragwort Pulling" (mismatch with slug and
 *     query space) → proper weed-control meta.
 *   - posts whose stored seo.metaTitle ends in a literal "…" (the old
 *     auto-derive truncation wrote the ellipsis into the <title> tag; 15
 *     pages) → replaced with the full post title, brand suffix stripped.
 *   - post "why-we-flail-large-ragwort-…" has the brand hand-typed into its
 *     title (renders truncated "…| Hampshire Paddock…") → brand stripped.
 *
 * Where a rewrite matches a pending seo-opportunities row (query match,
 * best effort), that row is flipped to 'completed'.
 *
 * Idempotent. Dry-run by default; pass --execute to write.
 *   Local mirror: node_modules/.bin/tsx scripts/apply-seo-meta-rewrites-2026-W29.mjs
 *   Prod:         DATABASE_URL=$DATABASE_URL_PROD node_modules/.bin/tsx scripts/apply-seo-meta-rewrites-2026-W29.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const BRAND_SUFFIX = /\s*[|–—-]\s*Hampshire Paddock Management\s*$/i;

// Slug-addressed (prod and local-mirror ids have diverged — never use ids).
const UPDATES = [
  {
    collection: 'services',
    slug: 'harrowing',
    queries: ['paddock harrowing'],
    metaTitle: 'Paddock Harrowing in Hampshire — Local Contractor',
    metaDescription:
      'Paddock harrowing across Hampshire, Wiltshire and surrounding counties. When to harrow, what it costs and fast quotes — compact machinery, no ruts.',
  },
  {
    collection: 'services',
    slug: 'paddock-topping',
    queries: ['paddock topping', 'topping paddocks'],
    metaTitle: 'Paddock Topping in Hampshire — Fast Local Quotes',
    metaDescription:
      'Professional paddock topping across Hampshire and surrounding counties. Keep grass in check and pasture healthy — hourly rates, quick quotes, tidy finish.',
  },
  {
    collection: 'services',
    slug: 'rolling',
    queries: ['how often should paddocks be rolled each year?'],
    metaTitle: 'Paddock Rolling in Hampshire — How Often & When to Roll',
    metaDescription:
      'How often should paddocks be rolled? Usually once a year, in spring when the ground is moist. Local paddock rolling across Hampshire — get a fast quote.',
  },
  {
    collection: 'services',
    slug: 'rotavating',
    queries: ['rotavate soil', 'rotavating soil'],
    metaTitle: 'Field & Paddock Rotavating in Hampshire',
    metaDescription:
      'Rotavating for paddocks, fields and smallholdings across Hampshire. What rotavating does to your soil, when to do it and what it costs — local quotes.',
  },
  {
    collection: 'services',
    slug: 'weed-control',
    queries: [],
    metaTitle: 'Paddock Weed Control in Hampshire — Ragwort & Docks',
    metaDescription:
      'Ragwort, dock, thistle and nettle control for horse paddocks across Hampshire. PA1/PA2-certified spraying and ragwort pulling — book a local contractor.',
  },
  {
    collection: 'posts',
    slug: 'when-to-harrow-paddocks-timing-benefits-and-best-practices',
    queries: ['when to harrow paddocks'],
    metaTitle: 'When to Harrow Paddocks: Best Time of Year (UK)',
    metaDescription:
      'When should you harrow paddocks? Late winter to early spring, once the ground firms up. Timing, benefits and best practice from a Hampshire contractor.',
  },
];

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] writing meta rewrites' : '[dry-run] use --execute to write');
console.log();

let updated = 0;
let unchanged = 0;
let missing = 0;
let completedOpps = 0;

const findBySlug = async (collection, slug) => {
  const res = await payload.find({ collection, where: { slug: { equals: slug } }, limit: 1, depth: 0 });
  return res.docs[0] ?? null;
};

for (const u of UPDATES) {
  const doc = await findBySlug(u.collection, u.slug);
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
  console.log(`  [update] ${u.collection}/${u.slug}`);
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

  for (const q of u.queries) {
    const opp = await payload.find({
      collection: 'seo-opportunities',
      where: { and: [{ query: { equals: q } }, { status: { equals: 'pending' } }] },
      limit: 5,
      depth: 0,
    });
    for (const row of opp.docs) {
      console.log(`      [opportunity] '${q}' (${row.weekIdentified ?? '?'}) → completed`);
      if (EXECUTE) {
        await payload.update({
          collection: 'seo-opportunities',
          id: row.id,
          data: { status: 'completed', notes: `${row.notes ? row.notes + '\n' : ''}Applied by apply-seo-meta-rewrites-2026-W29 on 2026-07-14.` },
        });
      }
      completedOpps++;
    }
  }
}

// ---- Sweep: kill literal "…" metaTitles and hand-typed brand suffixes ----
console.log();
console.log('sweep: posts with truncated ("…") or brand-suffixed metaTitles / titles');
const all = await payload.find({ collection: 'posts', limit: 200, depth: 0 });
for (const post of all.docs) {
  const data = {};
  const cleanTitle = (post.title ?? '').replace(BRAND_SUFFIX, '').trim();
  if (cleanTitle && cleanTitle !== post.title) data.title = cleanTitle;

  const mt = post.seo?.metaTitle ?? '';
  const pinned = UPDATES.some((u) => u.collection === 'posts' && u.slug === post.slug);
  if (!pinned && (mt.endsWith('…') || BRAND_SUFFIX.test(mt))) {
    data.seo = { ...(post.seo ?? {}), metaTitle: cleanTitle };
  }

  if (Object.keys(data).length === 0) continue;
  console.log(`  [sweep] ${post.slug}`);
  if (data.title) console.log(`      title: ${JSON.stringify(post.title)} → ${JSON.stringify(data.title)}`);
  if (data.seo) console.log(`      metaTitle: ${JSON.stringify(mt)} → ${JSON.stringify(data.seo.metaTitle)}`);
  if (EXECUTE) await payload.update({ collection: 'posts', id: post.id, data });
  updated++;
}

console.log();
console.log(`done: ${updated} updated, ${unchanged} unchanged, ${missing} missing, ${completedOpps} opportunities completed${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
