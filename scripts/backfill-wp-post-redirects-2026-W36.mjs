#!/usr/bin/env node
/**
 * scripts/backfill-wp-post-redirects-2026-W36.mjs
 *
 * WordPress served every post at a root-level permalink, /<slug>/. The
 * migration created Redirects rows for only 15 of the 46 imported posts, so
 * the other 31 old URLs go /<slug>/ → 308 → /<slug> → 404 today. Google still
 * has some of them indexed and ranking: the old
 * /unveiling-the-power-and-precision-of-the-john-deere-6130r/ drew 19
 * impressions at position 8.1 in the 28 days to 2026-08-30 while the live
 * /notes/… URL is "URL is unknown to Google". Every one of those is equity
 * dead-ending in a 404 instead of passing to the page that replaced it.
 *
 * Computed, not hand-listed: every published post with a wpId whose slug has
 * no active Redirects row for /<slug>/ or /<slug> gets a 301 to /notes/<slug>.
 * The middleware already tries slash-toggled variants, so the trailing-slash
 * form covers both. Plus three WP taxonomy/shop URLs GSC still reports
 * impressions for.
 *
 * Idempotent (`from` is unique; existing rows are left untouched). Dry-run
 * by default.
 *
 *   Local mirror: node_modules/.bin/tsx scripts/backfill-wp-post-redirects-2026-W36.mjs
 *   Prod:         DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *                   node_modules/.bin/tsx --env-file=.env.local \
 *                   scripts/backfill-wp-post-redirects-2026-W36.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const NOTE = 'WP root-level post permalink → /notes (backfill, 2026-09-02 review)';

const EXTRA = [
  ['/category/services/', '/services', 'WP category archive still drawing impressions (2026-09-02 review)'],
  ['/tag/drainage/', '/notes/tag/drainage', 'WP tag archive → curated tag hub (2026-09-02 review)'],
  ['/product/seedsight/', '/services/seedsight', 'WooCommerce product URL, linked from the seedsight service body (2026-09-02 review)'],
];

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] backfilling redirects' : '[dry-run] use --execute to write');

const existing = new Set(
  (await payload.find({ collection: 'redirects', limit: 1000, depth: 0 })).docs
    .filter((r) => r.active !== false)
    .map((r) => r.from),
);

const { docs: posts } = await payload.find({
  collection: 'posts',
  where: { _status: { equals: 'published' }, wpId: { exists: true } },
  limit: 500,
  depth: 0,
  draft: false,
  select: { slug: true, wpId: true },
});

const rows = [];
for (const p of posts.sort((a, b) => a.id - b.id)) {
  if (typeof p.slug !== 'string' || !p.slug) continue;
  if (existing.has(`/${p.slug}/`) || existing.has(`/${p.slug}`)) continue;
  rows.push({ from: `/${p.slug}/`, to: `/notes/${p.slug}`, notes: `${NOTE} — post ${p.id}, wpId ${p.wpId}` });
}
for (const [from, to, notes] of EXTRA) if (!existing.has(from)) rows.push({ from, to, notes });

if (!rows.length) {
  console.log('  [unchanged] every WP post already has a redirect');
} else {
  for (const r of rows) console.log(`  [create] ${r.from} → ${r.to}`);
  if (EXECUTE) {
    for (const r of rows) {
      await payload.create({ collection: 'redirects', data: { ...r, statusCode: '301', active: true } });
    }
    const after = new Set((await payload.find({ collection: 'redirects', limit: 1000, depth: 0 })).docs.map((r) => r.from));
    const missing = rows.filter((r) => !after.has(r.from));
    console.log(missing.length ? `  ✗ ${missing.length} rows did not persist` : `  ✓ ${rows.length} rows written and re-read`);
  }
}

console.log(`\n${rows.length} redirects ${EXECUTE ? 'created' : 'pending'} (${existing.size} active before).`);
process.exit(0);
