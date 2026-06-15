#!/usr/bin/env node
/**
 * scripts/publish-vineyard-article.mjs
 *
 * Writes and publishes the vineyard case article: finishing the rows at
 * Burcombe Estate vineyard (near Salisbury) with a sub-compact John Deere
 * 2038R + Winton stone burier seeder — rotavating, stone burying and
 * seeding between the vines in one pass.
 *
 * Uses existing media (already in the hpm-media bucket):
 *   id 41  IMG_7780-scaled.webp  → hero + OG (JD 2038R working)
 *   id 40  IMG_7802.webp         → inline (stone burying & seeding)
 *   id 38  IMG_7786-1.webp       → inline
 *
 * Idempotent on slug. Dry-run by default; --execute to write.
 *   Local mirror:  node_modules/.bin/tsx scripts/publish-vineyard-article.mjs --execute
 *   Prod:  DATABASE_URL=$DATABASE_URL_PROD node_modules/.bin/tsx scripts/publish-vineyard-article.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');

const SLUG = 'finishing-vineyard-rows-sub-compact-tractor-stone-burier-seeder';
const HERO = 41, IMG_BURYING = 40, IMG_ROWS = 38;

// ---- Lexical helpers (default lexicalEditor feature set) ----
const BOLD = 1;
const t = (text, format = 0) => ({ mode: 'normal', text, type: 'text', style: '', detail: 0, format, version: 1 });
const lnk = (url, label) => ({ type: 'link', version: 3, fields: { linkType: 'custom', url, newTab: false }, format: '', indent: 0, direction: 'ltr', children: [t(label)] });
const p = (...children) => ({ type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr', textStyle: '', textFormat: 0, children });
const h = (tag, text) => ({ type: 'heading', tag, format: '', indent: 0, version: 1, direction: 'ltr', children: [t(text)] });
const rich = (...children) => ({ blockType: 'richText', content: { root: { type: 'root', format: '', indent: 0, version: 1, direction: 'ltr', children } } });
const img = (image, caption, size = 'content') => ({ blockType: 'image', image, caption, size });

const content = [
  rich(
    p(t("Vineyard work throws up a challenge most field machinery isn't built for: the rows are narrow, the headlands are tight, and whatever you bring in has to work cleanly between established vines without churning up the alleys or catching a trellis. When it came to finishing off the rows at the vineyard on the Burcombe Estate, near Salisbury, that meant reaching for a smaller, more nimble setup than a full-size tractor — a sub-compact John Deere 2038R paired with a Winton stone burier seeder.")),
    p(t("The goal was a clean, level, sown finish in the strips between the vines: broken-up soil, stones and clods buried out of the way, and a fresh seedbed sown and firmed — all in a single pass. Here's how the combination handled it.")),
    h('h2', 'One pass: rotavating, stone burying and seeding together'),
    p(t("The Winton stone burier seeder does three jobs at once. A powered rotor first rotavates the top few inches of soil, breaking up the surface and any compaction left from earlier cultivation. The same rotor then throws the heavier material — stones, clods and trash — down to the bottom, burying it beneath a fine, even tilth. A seeder drops grass or cover-crop seed onto that prepared surface, and a rear packer roller firms it in. What would otherwise be three or four separate jobs — rotavating, raking off stones, sowing and rolling — becomes one run down the row.")),
    p(t("Doing it in a single pass matters in a vineyard. Every extra pass is another trip down a narrow alley, another chance to compact the soil or knock a vine, and more time the ground sits open and bare. Combining the operations means the strip goes from rough, stony cultivation to a firmed, sown seedbed before you reach the headland.")),
  ),
  img(IMG_BURYING, 'Rotavating, stone burying and seeding between the vines in one pass at Burcombe Estate.'),
  rich(
    h('h2', 'Why a sub-compact tractor earns its place'),
    p(t("The reason this works is the tractor underneath it. A sub-compact like the John Deere 2038R is small and light enough to move easily between vine rows and turn on tight headlands, but it still has the hydraulics and PTO to drive a stone burier seeder properly. A bigger machine simply wouldn't fit the rows cleanly, and its weight would do more harm than good on freshly worked ground.")),
    p(t("It's a good example of matching the machine to the job rather than the other way round. The same compact setup that suits paddocks, smallholdings and amenity ground is just as at home finishing vineyard rows — precise, low-impact, and still able to carry a proper implement.")),
  ),
  img(IMG_ROWS, 'Finishing the inter-row strips at the Burcombe Estate vineyard, near Salisbury.'),
  rich(
    h('h2', 'The finish'),
    p(t("The result was exactly what vineyard establishment needs: the inter-row strips rotavated, destoned and sown in one tidy operation, ready to green up and stabilise the soil between the vines. A clean finish, minimal ground disturbance, and far fewer passes than the traditional approach.")),
    p(t("If you've got vineyard rows, paddocks or amenity ground that need rotavating, stone burying and seeding — anywhere around Hampshire, Wiltshire and the surrounding counties — "), lnk('/contact', 'get in touch'), t(" and we'll talk through the right approach.")),
  ),
];

const data = {
  title: 'Finishing Vineyard Rows with a Sub-Compact Tractor and Stone Burier Seeder',
  slug: SLUG,
  excerpt: 'Finishing off the rows at a vineyard near Salisbury with a sub-compact John Deere 2038R and a Winton stone burier seeder — rotavating, burying stones and seeding between the vines in a single pass.',
  category: 'machinery',
  heroImage: HERO,
  featured: false,
  content,
  seo: {
    metaTitle: 'Stone Burying & Seeding Vineyard Rows with a Sub-Compact Tractor',
    metaDescription: 'Finishing vineyard rows at Burcombe Estate near Salisbury with a sub-compact John Deere 2038R and a Winton stone burier seeder — rotavating, burying stones and seeding between the vines in one pass.',
    ogImage: HERO,
  },
  _status: 'published',
};

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] publishing vineyard article' : '[dry-run] use --execute to write');

const existing = await payload.find({ collection: 'posts', where: { slug: { equals: SLUG } }, limit: 1, depth: 0 });
console.log(`  slug: ${SLUG}`);
console.log(`  blocks: ${content.length} (${content.filter((b) => b.blockType === 'richText').length} richText, ${content.filter((b) => b.blockType === 'image').length} image), hero=media:${HERO}`);

if (existing.docs.length > 0) {
  console.log(`  [skip] a post with this slug already exists (id ${existing.docs[0].id}) — not duplicating`);
  process.exit(0);
}

if (EXECUTE) {
  const created = await payload.create({ collection: 'posts', data });
  console.log(`  [done] published post id ${created.id} → /notes/${created.slug} (_status=${created._status})`);
} else {
  console.log('  [dry-run] would create + publish this post');
}
process.exit(0);
