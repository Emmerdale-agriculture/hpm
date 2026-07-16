#!/usr/bin/env node
/**
 * scripts/apply-seo-opportunities-2026-W29.mjs
 *
 * Closes out the remaining pending seo_opportunities from the 2026-07-14
 * review. Everything here is meta-only (no body content changes):
 *
 * 1. ROTAVATING DEFINITION CLUSTER (opps 17/18/21/22/23 + wet-soil 12) —
 *    post 7 ranks ~7 for "rotavated/rotavate/rotavation meaning/definition"
 *    (~210 impressions) with 0% CTR because its meta is service-led
 *    ("Rotavated Soil & Field Rotavating in Hampshire") and never answers
 *    the question. The W19 tweak already added the definition + wet-soil
 *    FAQ to the body; this rewrites the meta to lead with the definition.
 *
 * 2. HEDGE CLUSTER (opps 30/31) — "hedge trimming in hampshire" (pos 18,
 *    transactional) and "mcconnel hedge cutter" (pos 17) land on post 17,
 *    whose meta reads like an equipment announcement. Rewrite to a
 *    service-intent title/description. Post 35's imported-cruft
 *    description ("Introduction Hedges do more…") is cleaned too.
 *
 * 3. POST 25 metaDescription is imported cruft ("Introduction Soil
 *    that's…") — rewritten.
 *
 * 4. STATUS BOOKKEEPING — homepage "paddock maintenance/management" rows
 *    (14/20/38) were fixed in code (6d2e5a0 title/description) and via the
 *    post-63 merge; marked completed. Opp 28 "blocked drain paddock wood"
 *    is a Kent town query, not a paddock-drainage query — rejected.
 *    Opp 13 ("how to rotavate", pos 30) stays pending: needs content, not
 *    meta.
 *
 * NOTE: metaTitle renders verbatim ({absolute}) on posts — no brand suffix
 * is appended, keep titles ≤70 chars (field maxLength).
 *
 * Idempotent. Dry-run by default; pass --execute to write.
 *   Local mirror: node_modules/.bin/tsx scripts/apply-seo-opportunities-2026-W29.mjs
 *   Prod:         DATABASE_URL=$DATABASE_URL_PROD node_modules/.bin/tsx scripts/apply-seo-opportunities-2026-W29.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');

const META_REWRITES = [
  {
    id: 7,
    slug: 'effective-field-rotavating-for-soil-health',
    metaTitle: 'Rotavating Meaning: What It Is, How Deep & When to Do It',
    metaDescription:
      'Rotavating means breaking up topsoil with powered rotating tines to make a fine, workable tilth. What it does, how deep to go, and when not to rotavate.',
  },
  {
    id: 25,
    slug: 'overcome-soil-compaction-for-better-rotavating',
    metaTitle: null, // keep existing
    metaDescription:
      'Compacted ground makes rotavating slow and rough. How to spot compaction, loosen it with aeration or mole ploughing, and get a clean tilth.',
  },
  {
    id: 17,
    slug: 'introducing-our-mcconnel-pa3430-hedge-cutter-and-compact-tractor-equipment-for-those-hard-to-reach-areas',
    metaTitle: 'Hedge Cutting in Hampshire — Compact Tractor & McConnel Flail',
    metaDescription:
      'Hedge trimming and cutting across Hampshire with a McConnel PA3430 and compact tractor — tight access, tidy finish. Get a quote for your hedges.',
  },
  {
    id: 35,
    slug: 'spotting-unhealthy-hedges-in-hampshire',
    metaTitle: null, // keep existing
    metaDescription:
      'How to spot an unhealthy hedge — dieback, gaps, bare bases — and what to do about it, from a Hampshire land management contractor.',
  },
];

const OPPORTUNITY_UPDATES = [
  { id: 12, status: 'completed', notes: 'Wet-soil FAQ added to post 7 in W19; meta now definition-led (W29).' },
  { id: 14, status: 'completed', notes: 'Homepage title/description rewritten in code (6d2e5a0, 2026-07-14).' },
  { id: 17, status: 'completed', notes: 'Superseded by post-7 meta rewrite (W29) — no new article needed, body already defines rotavating (W19 FAQ).' },
  { id: 18, status: 'completed', notes: 'Superseded by post-7 meta rewrite (W29) — same definitional cluster as opp 17.' },
  { id: 20, status: 'completed', notes: 'Homepage title/description rewritten in code (6d2e5a0, 2026-07-14).' },
  { id: 21, status: 'completed', notes: 'Post-7 metaTitle/description now lead with the definition (W29).' },
  { id: 22, status: 'completed', notes: 'Post-7 metaTitle/description now lead with the definition (W29).' },
  { id: 23, status: 'completed', notes: 'Post-7 metaTitle/description now lead with the definition (W29).' },
  { id: 28, status: 'rejected', notes: 'Query is drain unblocking in Paddock Wood (Kent town) — wrong intent and outside the service area.' },
  { id: 30, status: 'completed', notes: 'Post-17 meta rewritten to hedge-cutting service intent + Hampshire (W29).' },
  { id: 31, status: 'completed', notes: 'Post-17 meta rewritten to hedge-cutting service intent + Hampshire (W29).' },
  { id: 38, status: 'completed', notes: 'Post 63 merged into /notes/paddock-management (301, phase 3); homepage meta done in code (6d2e5a0).' },
];

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] applying' : '[dry-run] use --execute to write');
console.log();

let changes = 0;

// ---- 1. meta rewrites ------------------------------------------------------
for (const m of META_REWRITES) {
  let post;
  try {
    post = await payload.findByID({ collection: 'posts', id: m.id, depth: 0 });
  } catch {
    post = null;
  }
  if (!post) {
    console.log(`  [missing] post ${m.id} (${m.slug}) — skipping`);
    continue;
  }
  if (post.slug !== m.slug) {
    console.log(`  [MISMATCH] post ${m.id} slug is "${post.slug}", expected "${m.slug}" — NOT touching`);
    continue;
  }

  const seo = post.seo ?? {};
  const data = {};
  if (m.metaTitle && seo.metaTitle !== m.metaTitle) {
    if (m.metaTitle.length > 70) {
      console.log(`  [SKIP] post ${m.id} metaTitle over 70 chars (${m.metaTitle.length})`);
    } else {
      data.metaTitle = m.metaTitle;
    }
  }
  if (m.metaDescription && seo.metaDescription !== m.metaDescription) {
    data.metaDescription = m.metaDescription;
  }

  if (Object.keys(data).length === 0) {
    console.log(`  [ok] post ${m.id} ${post.slug.slice(0, 45)} already up to date`);
    continue;
  }

  for (const [k, v] of Object.entries(data)) {
    console.log(`  [meta] post ${m.id} ${k}:`);
    console.log(`         old: ${seo[k] ?? '(unset)'}`);
    console.log(`         new: ${v}`);
  }
  if (EXECUTE) {
    await payload.update({
      collection: 'posts',
      id: m.id,
      data: { seo: { ...seo, ...data } },
    });
  }
  changes++;
}

// ---- 2. opportunity statuses -----------------------------------------------
console.log();
for (const o of OPPORTUNITY_UPDATES) {
  let opp;
  try {
    opp = await payload.findByID({ collection: 'seo-opportunities', id: o.id, depth: 0 });
  } catch {
    opp = null;
  }
  if (!opp) {
    console.log(`  [missing] opportunity #${o.id} — skipping (stale mirror?)`);
    continue;
  }
  if (opp.status === o.status) {
    console.log(`  [ok] opp #${o.id} already ${o.status}`);
    continue;
  }
  console.log(`  [status] opp #${o.id} "${(opp.query ?? '').slice(0, 40)}": ${opp.status} → ${o.status}`);
  if (EXECUTE) {
    await payload.update({
      collection: 'seo-opportunities',
      id: o.id,
      data: { status: o.status, notes: o.notes, decidedAt: new Date().toISOString() },
    });
  }
  changes++;
}

console.log();
console.log(`done: ${changes} changes${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
