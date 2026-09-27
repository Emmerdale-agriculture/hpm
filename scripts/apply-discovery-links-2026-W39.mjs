#!/usr/bin/env node
/**
 * scripts/apply-discovery-links-2026-W39.mjs
 *
 * 2026-09-27 monthly review: GSC URL Inspection says four notes are "URL is
 * unknown to Google" — never crawled, months after publishing:
 *
 *   acorns-and-horses-…            (published Jul-02, and acorn season is NOW)
 *   using-envy-to-control-buttercups-…
 *   flat-fan-vs-air-inclusion-nozzles-…
 *   were-now-licensed-to-spray-…
 *
 * Their only inbound links are /notes, the tag hubs and low-traffic notes.
 * The service pages' "Worth reading" sections pick by tag and keep surfacing
 * the same three weeds notes, never these. Same lever as W36 (which got
 * /services/spraying and /services/weed-control crawled + indexed within
 * weeks): one short, sentinel-guarded paragraph appended to pages Google
 * recrawls, each pointing somewhere its subject genuinely leads. Every claim
 * in the copy comes from the target note itself.
 *
 * Also sets primaryTag 'weeds' on the Envy note (it was null, so the note
 * showed no service CTA; 'weeds' → the Weed control CTA). Only when null.
 * The acorns note is deliberately left without one: no curated tag maps to
 * manure-sweeping, and 'ground-care' would put a Harrowing CTA on it.
 *
 * Targets are looked up by SLUG (the local mirror predates several of these
 * posts and ids differ between mirror and prod). A missing slug is skipped.
 * Idempotent; dry-run by default.
 *
 *   Local mirror: node_modules/.bin/tsx scripts/apply-discovery-links-2026-W39.mjs
 *   Prod:         DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *                   node_modules/.bin/tsx --env-file=.env.local \
 *                   scripts/apply-discovery-links-2026-W39.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');

const text = (str) => ({ mode: 'normal', text: str, type: 'text', style: '', detail: 0, format: 0, version: 1 });
const link = (url, anchor) => ({
  type: 'link',
  fields: { url, newTab: false, linkType: 'custom' },
  format: '', indent: 0, version: 3, direction: 'ltr',
  children: [text(anchor)],
});
const para = (children) => ({ type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr', children });
const block = (children) => ({
  blockType: 'richText',
  content: { root: { type: 'root', format: '', indent: 0, version: 1, direction: 'ltr', children } },
});

const ACORNS = '/notes/acorns-and-horses-the-hidden-autumn-danger-in-your-paddocks';
const ENVY = '/notes/using-envy-to-control-buttercups-in-horse-paddocks';
const NOZZLES = '/notes/flat-fan-vs-air-inclusion-nozzles-for-paddock-spraying';
const LICENSED = '/notes/were-now-licensed-to-spray-heres-what-that-means-for-your-paddocks';

// [collection, hostSlug, targetUrl, sentinel (first text run), paragraph]
const DISCOVERY = [
  ['services', 'manure-sweeping', ACORNS, 'We also sweep fallen acorns',
    para([text('We also sweep fallen acorns from horse paddocks each autumn — they’re poisonous to horses, and the risk peaks between September and November. Why they matter and what to watch for: '), link(ACORNS, 'acorns and horses, the hidden autumn danger'), text('.')])],
  ['services', 'spraying', LICENSED, 'We’re PA1/PA2 certified',
    para([text('We’re PA1/PA2 certified to spray with a boom sprayer — '), link(LICENSED, 'what the licence covers and what we can treat'), text('. And for why we use low-drift air inclusion nozzles for most paddock work, see '), link(NOZZLES, 'flat fan vs air inclusion nozzles'), text('.')])],
  ['services', 'weed-control', ENVY, 'For buttercups specifically',
    para([text('For buttercups specifically — when to spray, and how a selective herbicide clears them while leaving the grass — see '), link(ENVY, 'using Envy to control buttercups in horse paddocks'), text('.')])],
  ['posts', 'herbicide-thrust-for-ragwort-control-a-practical-guide-to-managing-ragwort-in-ho', ACORNS, 'Ragwort isn’t the only thing',
    para([text('Ragwort isn’t the only thing in a paddock that’s poisonous to horses. Come autumn, fallen acorns are another risk to watch for — see '), link(ACORNS, 'acorns and horses'), text('.')])],
  ['posts', 'can-thrust-herbicide-control-prostrate-knotweed-the-complete-guide-for-horse-pad', NOZZLES, 'How the spray goes on matters',
    para([text('How the spray goes on matters as much as what’s in the tank. See '), link(NOZZLES, 'why we use air inclusion nozzles'), text(' for how we keep herbicide off neighbouring grazing, hedges and watercourses.')])],
];

const PRIMARY_TAGS = [['using-envy-to-control-buttercups-in-horse-paddocks', 'weeds']];

const publishGuard = (doc) => (doc?._status === 'published' ? { _status: 'published' } : {});
const bodyHas = (blocks, needle) => JSON.stringify(blocks ?? []).includes(needle);
const alreadyLinked = (blocks, url) => bodyHas(blocks, `"url":"${url}"`) || bodyHas(blocks, `"url": "${url}"`);

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] W39 discovery links' : '[dry-run] use --execute to write');

async function bySlug(collection, slug) {
  const { docs } = await payload.find({ collection, where: { slug: { equals: slug } }, limit: 1, depth: 0, draft: false });
  return docs[0] ?? null;
}

let changes = 0;
for (const [collection, slug, url, sentinel, paragraph] of DISCOVERY) {
  const doc = await bySlug(collection, slug);
  if (!doc) { console.log(`  [missing] ${collection}/${slug.slice(0, 50)} — skipping (stale mirror?)`); continue; }
  if (doc._status !== 'published') { console.error(`  ✗ ${collection}/${doc.id} is ${doc._status} — skipping`); continue; }
  if (bodyHas(doc.content, sentinel)) { console.log(`  [unchanged] ${collection}/${doc.id} already carries "${sentinel}…"`); continue; }
  if (alreadyLinked(doc.content, url)) { console.log(`  [unchanged] ${collection}/${doc.id} already links ${url}`); continue; }
  changes += 1;
  console.log(`  [append] ${collection}/${doc.id} ${slug.slice(0, 44)} → ${url}`);
  if (EXECUTE) {
    await payload.update({
      collection, id: doc.id, draft: false,
      data: { content: [...(doc.content ?? []), block([paragraph])], ...publishGuard(doc) },
    });
    const check = await payload.findByID({ collection, id: doc.id, depth: 0, draft: false });
    console.log(bodyHas(check.content, sentinel) && check._status === 'published' ? '      ✓ written and re-read' : '      ✗ RE-READ FAILED — inspect');
  }
}

for (const [slug, tag] of PRIMARY_TAGS) {
  const doc = await bySlug('posts', slug);
  if (!doc) { console.log(`  [missing] posts/${slug.slice(0, 50)} — skipping`); continue; }
  if (doc.primaryTag) { console.log(`  [unchanged] posts/${doc.id} primaryTag already "${doc.primaryTag}"`); continue; }
  changes += 1;
  console.log(`  [primaryTag] posts/${doc.id} ${slug.slice(0, 44)} → "${tag}"`);
  if (EXECUTE) {
    await payload.update({ collection: 'posts', id: doc.id, draft: false, data: { primaryTag: tag, ...publishGuard(doc) } });
    const check = await payload.findByID({ collection: 'posts', id: doc.id, depth: 0, draft: false });
    console.log(check.primaryTag === tag && check._status === doc._status ? '      ✓ written and re-read' : '      ✗ RE-READ FAILED — inspect');
  }
}

console.log(`\n${changes} change(s) ${EXECUTE ? 'applied' : 'pending'}.`);
process.exit(0);
