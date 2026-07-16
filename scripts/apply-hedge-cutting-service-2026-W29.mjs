#!/usr/bin/env node
/**
 * scripts/apply-hedge-cutting-service-2026-W29.mjs
 *
 * Rebuilds the /services/hedge-cutting page. "hedge trimming in hampshire"
 * is a transactional query (GSC pos 18, opp #30) — a hedge-cutting service
 * doc EXISTS (id 6, published, WP import) but its entire body is four bare
 * H3 headings with no paragraph text, and category is null so it appears
 * nowhere: not on /services, not in the footer, not in the sitemap. A
 * thin, orphaned page is exactly what position 18 looks like.
 *
 * 1. Updates the existing service in place (same id/slug/URL): category
 *    cutting-mowing (surfaces it in index/footer/sitemap), landscape hero
 *    (media 95 — current 67 is portrait), real shortDescription/strapline,
 *    equipment sidebar, at-a-glance, related services looked up by slug,
 *    and replaces the empty-headings body with ~350 words of copy linking
 *    to the two hedge posts.
 * 2. Retags the two hedge posts so the cross-linking loop closes:
 *      post 17 (McConnel PA3430) → tags [hedges, equipment]
 *      post 35 (spotting unhealthy hedges) → tags [hedges, advice]
 *    primaryTag 'hedges' gives both posts the in-article CTA panel
 *    pointing at the new service (tagToService in code), and the
 *    service's "From the field notes" section picks them up via the
 *    serviceToTags map.
 *
 * Requires the code side (tags.ts 'hedges' TagDef, tag-service-map
 * entries) to be deployed — run this AFTER the deploy is READY, else the
 * CTA/related-notes stay dormant until the next deploy (harmless).
 *
 * Idempotent. Dry-run by default; pass --execute to write.
 *   Local mirror: node_modules/.bin/tsx scripts/apply-hedge-cutting-service-2026-W29.mjs
 *   Prod:         DATABASE_URL=$DATABASE_URL_PROD node_modules/.bin/tsx scripts/apply-hedge-cutting-service-2026-W29.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');

const SLUG = 'hedge-cutting';
const HERO_MEDIA_ID = 95; // "hedge cutting services in Hampshire" — landscape 2560×1707
const RELATED_SLUGS = ['flailing', 'flail-collecting', 'land-ditch-clearance'];

// --- lexical helpers (same shapes as apply-on-page-tweak-2026-W19) ---------
const text = (str, format = 0) => ({
  mode: 'normal', text: str, type: 'text', style: '', detail: 0, format, version: 1,
});
const para = (children) => ({
  type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr', children,
});
const heading = (tag, str) => ({
  tag, type: 'heading', format: '', indent: 0, version: 1, direction: 'ltr', children: [text(str)],
});
const link = (url, anchor) => ({
  type: 'link',
  fields: { url, newTab: false, linkType: 'custom' },
  format: '', indent: 0, version: 3, direction: 'ltr',
  children: [text(anchor)],
});

const BODY_LEXICAL = {
  root: {
    type: 'root', format: '', indent: 0, version: 1, direction: 'ltr',
    children: [
      heading('h2', 'Hedge cutting that fits through the gate'),
      para([
        text(
          'Most hedge-cutting rigs are set up for big arable boundaries — a heavy tractor and a reach arm that needs half the field to turn around in. That’s no use on a horse paddock with a narrow gateway, a garden boundary backing onto grazing, or a single-track Hampshire lane. I run a McConnel PA3430 reach-arm flail on a compact tractor, which means I can get to hedges that bigger contractors turn down: tight entrances, soft ground, awkward corners and roadside frontage where you need to work around traffic.',
        ),
      ]),
      para([
        text(
          'Typical jobs are field and paddock boundary hedges, hawthorn and blackthorn that has got away over a few seasons, roadside hedges that need a visibility cut, and the annual maintenance trim that keeps a hedge thick, stock-proof and tidy. Flail cutting mulches the trimmings as it goes — on most jobs there’s nothing to cart away.',
        ),
      ]),
      heading('h2', 'When hedges can — and can’t — be cut'),
      para([
        text(
          'The main hedge-cutting season runs from September to the end of February. Between March and August hedges are full of nesting birds, and it’s an offence under the Wildlife and Countryside Act to damage an active nest — so routine cutting stops for the spring and summer. Land in agri-environment schemes usually carries the same March-to-August restriction as a condition. If you want berries left for winter birds, a January or February cut is the sweet spot: the hedge is dormant, the ground is usually firm enough, and you start the season tidy.',
        ),
      ]),
      para([
        text('Not sure whether a hedge needs a trim or something more drastic? Overgrown, gappy or dying hedges are usually recoverable if you catch them early — I’ve written about '),
        link('/notes/spotting-unhealthy-hedges-in-hampshire', 'how to spot an unhealthy hedge'),
        text(' and '),
        link(
          '/notes/introducing-our-mcconnel-pa3430-hedge-cutter-and-compact-tractor-equipment-for-those-hard-to-reach-areas',
          'the kit I use for hard-to-reach hedges',
        ),
        text('.'),
      ]),
      heading('h2', 'What it costs'),
      para([
        text(
          'Hedge work is quoted per job rather than per metre, because the price depends on more than length: how many seasons of growth are coming off, whether both sides and the top need doing, access, and whether there’s anything hiding in the hedge line (wire, posts, dumped rubble) that needs working around. Send me a few photos and rough measurements and I’ll usually have a price back to you the same day.',
        ),
      ]),
    ],
  },
};

// Sentinel heading — if the body already contains it, the rebuild has run.
const SENTINEL_HEADING = 'Hedge cutting that fits through the gate';

const SERVICE_DATA = {
  title: 'Hedge Cutting',
  _status: 'published',
  shortDescription:
    'Hedge cutting and trimming across Hampshire with a McConnel reach-arm flail on a compact tractor — paddock boundaries, overgrown hedges and narrow-lane access.',
  strapline: 'Paddock and field hedges cut clean — including the tight spots big rigs can’t reach.',
  heroImage: HERO_MEDIA_ID,
  orderInMenu: 25, // after Flailing (20) in the cutting & mowing group
  category: 'cutting-mowing',
  equipment: [
    { name: 'McConnel PA3430', spec: 'Reach-arm flail · hard-to-reach areas' },
    { name: 'Compact tractor', spec: 'Narrow access · grass tyres, light footprint' },
  ],
  metaHighlights: {
    bestTime: 'Sept – Feb (outside nesting season)',
    frequency: 'Annually',
    quoteTurnaround: 'Same day',
  },
  content: [{ blockType: 'richText', content: BODY_LEXICAL }],
  seo: {
    metaTitle: 'Hedge Cutting & Trimming in Hampshire | Compact Tractor Access',
    metaDescription:
      'Hedge cutting and trimming across Hampshire — paddock and field boundaries, overgrown hedges, narrow lanes. Compact tractor with McConnel flail. Same-day quotes.',
  },
};

const POST_RETAGS = [
  { id: 17, slugStartsWith: 'introducing-our-mcconnel-pa3430', tags: ['hedges', 'equipment'], primaryTag: 'hedges' },
  { id: 35, slugStartsWith: 'spotting-unhealthy-hedges', tags: ['hedges', 'advice'], primaryTag: 'hedges' },
];

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] applying' : '[dry-run] use --execute to write');
console.log();

let changes = 0;

// ---- 1. rebuild the service --------------------------------------------------
const existing = await payload.find({
  collection: 'services',
  where: { slug: { equals: SLUG } },
  limit: 1,
  depth: 0,
});

if (existing.docs.length === 0) {
  console.log(`  [MISSING] service /services/${SLUG} not found — expected the WP-import stub (id 6). Not creating; investigate first.`);
} else {
  const svc = existing.docs[0];
  const alreadyRebuilt = JSON.stringify(svc.content ?? []).includes(SENTINEL_HEADING);

  if (alreadyRebuilt && svc.category === SERVICE_DATA.category) {
    console.log(`  [ok] service /services/${SLUG} (id ${svc.id}) already rebuilt`);
  } else {
    // Related services resolved by slug so the script works on mirror + prod
    // regardless of id drift.
    const relatedIds = [];
    for (const slug of RELATED_SLUGS) {
      const res = await payload.find({
        collection: 'services',
        where: { slug: { equals: slug } },
        limit: 1,
        depth: 0,
      });
      if (res.docs[0]) relatedIds.push(res.docs[0].id);
      else console.log(`  [warn] related service "${slug}" not found — omitting`);
    }

    console.log(`  [rebuild] service /services/${SLUG} (id ${svc.id}):`);
    console.log(`            category: ${svc.category ?? '(none — hidden from index/footer/sitemap)'} → ${SERVICE_DATA.category}`);
    console.log(`            hero: media ${svc.heroImage ?? '(none)'} → ${HERO_MEDIA_ID} (landscape)`);
    console.log(`            body: ${alreadyRebuilt ? 'keep (already rebuilt)' : 'replace empty-headings import with new copy'}`);
    if (EXECUTE) {
      await payload.update({
        collection: 'services',
        id: svc.id,
        data: {
          ...SERVICE_DATA,
          relatedServices: relatedIds,
          seo: { ...(svc.seo ?? {}), ...SERVICE_DATA.seo },
        },
      });
      console.log(`  ✓ updated id ${svc.id}`);
    }
    changes++;
  }
}

// ---- 2. retag the hedge posts ------------------------------------------------
console.log();
for (const r of POST_RETAGS) {
  let post;
  try {
    post = await payload.findByID({ collection: 'posts', id: r.id, depth: 0 });
  } catch {
    post = null;
  }
  if (!post) {
    console.log(`  [missing] post ${r.id} — skipping`);
    continue;
  }
  if (!post.slug?.startsWith(r.slugStartsWith)) {
    console.log(`  [MISMATCH] post ${r.id} slug is "${post.slug}" — NOT touching`);
    continue;
  }
  const currentTags = (post.tags ?? []).map((t) => (typeof t === 'object' ? t.tag : t));
  const same =
    post.primaryTag === r.primaryTag &&
    currentTags.length === r.tags.length &&
    r.tags.every((t) => currentTags.includes(t));
  if (same) {
    console.log(`  [ok] post ${r.id} already tagged [${r.tags.join(',')}] primary=${r.primaryTag}`);
    continue;
  }
  console.log(`  [retag] post ${r.id} ${post.slug.slice(0, 45)}: [${currentTags.join(',')}] → [${r.tags.join(',')}] primary=${r.primaryTag}`);
  if (EXECUTE) {
    await payload.update({
      collection: 'posts',
      id: r.id,
      data: { tags: r.tags.map((tag) => ({ tag })), primaryTag: r.primaryTag },
    });
  }
  changes++;
}

console.log();
console.log(`done: ${changes} changes${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
