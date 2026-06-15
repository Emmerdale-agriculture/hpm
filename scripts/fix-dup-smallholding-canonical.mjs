#!/usr/bin/env node
/**
 * scripts/fix-dup-smallholding-canonical.mjs
 *
 * Resolves the GSC "Duplicate, Google chose different canonical than user"
 * warning on the smallholding post.
 *
 * Root cause: two identical published posts exist (WordPress-import dupe):
 *   id 27  overcoming-smallholding-challenges-in-hampshire     (original — keep)
 *   id 26  overcoming-smallholding-challenges-in-hampshire-2   (dupe — retire)
 * notes/[slug] self-canonicalises to /notes/<slug>, so each claims itself as
 * canonical. Google picks one and flags the other.
 *
 * Fix: unpublish the -2 dupe and 301-redirect it to the original, collapsing
 * the duplicate and consolidating equity onto the clean slug.
 *
 * Safety: verifies the target's slug before unpublishing — aborts that step
 * if it doesn't match, so an id reshuffle can't retire the wrong post.
 *
 * Idempotent. Dry-run by default; pass --execute to write.
 *
 * Run against prod (tsx loads the TS payload config):
 *   DATABASE_URL=$DATABASE_URL_PROD node_modules/.bin/tsx scripts/fix-dup-smallholding-canonical.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');

const DUPE_ID = 26;
const DUPE_SLUG = 'overcoming-smallholding-challenges-in-hampshire-2';
const CANON_SLUG = 'overcoming-smallholding-challenges-in-hampshire';
const FROM = `/notes/${DUPE_SLUG}`;
const TO = `/notes/${CANON_SLUG}`;

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] retiring dupe + adding redirect' : '[dry-run] use --execute to write');
console.log();

// 1) Unpublish the duplicate (guarded by slug).
const dupe = await payload.findByID({ collection: 'posts', id: DUPE_ID, depth: 0 }).catch(() => null);
if (!dupe) {
  console.log(`  [skip] post ${DUPE_ID} not found — already removed?`);
} else if (dupe.slug !== DUPE_SLUG) {
  console.log(`  [ABORT unpublish] post ${DUPE_ID} slug is "${dupe.slug}", expected "${DUPE_SLUG}" — not touching it`);
} else if (dupe._status !== 'published') {
  console.log(`  [unchanged] post ${DUPE_ID} (${dupe.slug}) already _status=${dupe._status}`);
} else {
  console.log(`  [unpublish] post ${DUPE_ID} (${dupe.slug}) published → draft`);
  if (EXECUTE) {
    await payload.update({ collection: 'posts', id: DUPE_ID, data: { _status: 'draft' } });
  }
}

// 2) Add the 301 redirect (idempotent on `from`).
const existing = await payload.find({ collection: 'redirects', where: { from: { equals: FROM } }, limit: 1, depth: 0 });
if (existing.docs.length > 0) {
  console.log(`  [exists] redirect ${FROM} → ${existing.docs[0].to}`);
} else {
  console.log(`  [new]    redirect ${FROM} → ${TO} (301)`);
  if (EXECUTE) {
    await payload.create({
      collection: 'redirects',
      data: {
        from: FROM,
        to: TO,
        statusCode: 301,
        active: true,
        notes: 'Dedupe WP-import duplicate; resolves GSC "Google chose different canonical".',
      },
    });
  }
}

console.log('\nDone.');
process.exit(0);
