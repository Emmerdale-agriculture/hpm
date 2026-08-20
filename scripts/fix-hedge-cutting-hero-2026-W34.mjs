#!/usr/bin/env node
/**
 * scripts/fix-hedge-cutting-hero-2026-W34.mjs
 *
 * Fixes the one genuinely broken image on the live site.
 *
 * /services/hedge-cutting points at media 95 (shutterstock_2013846224-scaled),
 * and every one of that doc's variants — original, thumbnail, card, feature,
 * hero — is absent from the Supabase bucket. It is unrecoverable from storage,
 * so the hero renders as a 400. Because hedge-cutting also turns up in the
 * related-services fallback across the site, the same broken file is requested
 * on 12 pages (/services plus 11 other service pages), not just its own.
 *
 * Tom picked the replacement: media 68 — "hedge cutting services UK", the John
 * Deere compact tractor with the McConnel PA3430 reach-arm flail working a
 * narrow lane. On-message with that page's copy about tight access.
 *
 * The wrinkle, and why this script writes sizes.large:
 *   ServiceHero (and ServicesGrid / RelatedServices) resolve their image as
 *   `mediaUrl(hero, 'large') ?? mediaUrl(hero)`. Media 68 predates the 'large'
 *   size being added to the media collection, so it has no sizes.large — the
 *   fallback would serve the ORIGINAL, which is 1500×2000 portrait. Cover-
 *   cropped into the wide hero band that shows roughly the middle third: the
 *   reach arm at top-right and the ground both get cut off, and it ships a
 *   772 KB file to do it.
 *
 *   Media 68 already has a 'hero' variant — IMG_0581-2000x1200.jpg, the exact
 *   URL Tom supplied — which is correctly framed for that band. So we point
 *   sizes.large at it.
 *
 *   Note this is deliberately not what 'large' normally means: per the media
 *   collection, 'large' is width-2000 UNCROPPED while 'hero' is a 2000×1200
 *   centre crop. We are storing a crop under the uncropped name. That is a
 *   knowing trade to avoid a code change, and it is benign because every
 *   consumer of 'large' (hero band, service tiles, related-service tiles)
 *   renders it object-fit: cover anyway — a pre-cropped landscape is if
 *   anything better there than a portrait.
 *
 *   The principled fix is to have ServiceHero ask for 'hero' before 'large',
 *   which would improve framing on every service page — but that is a code
 *   change needing a deploy and it re-frames 14 other pages, so it is left as
 *   a separate decision. If sizes are ever regenerated for media 68 (see
 *   scripts/regenerate-media-sizes.mjs) this backfill is overwritten with a
 *   genuine uncropped 2000×2667, and the hero silently goes back to portrait
 *   framing. Re-run this script if that happens.
 *
 * Also rewrites media 68's alt: "hedge cutting services UK" is keyword-shaped
 * rather than descriptive, and it is the alt for both the hero and the gallery.
 *
 * Leaves media 95 in place but unreferenced — nothing else points at it. Worth
 * deleting or re-uploading separately; this script does not touch it.
 *
 * Idempotent. Dry-run by default; pass --execute to write.
 *
 *   Local mirror:
 *     node_modules/.bin/tsx --env-file=.env.local scripts/fix-hedge-cutting-hero-2026-W34.mjs
 *
 *   Prod (dry-run first, then add --execute):
 *     DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *       node_modules/.bin/tsx --env-file=.env.local \
 *       scripts/fix-hedge-cutting-hero-2026-W34.mjs --execute
 *
 * (DATABASE_URL_PROD is not exported into the shell, and Node's --env-file does
 * not override an already-set variable — a bare `DATABASE_URL=$DATABASE_URL_PROD`
 * prefix sets it empty and Payload dies on SASL. Hence the grep.)
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');

const SERVICE_SLUG = 'hedge-cutting';
const NEW_HERO_ID = 68;
const NEW_HERO_FILENAME = 'IMG_0581.webp';
const OLD_HERO_ID = 95; // shutterstock_2013846224-scaled.webp — gone from the bucket

const PUBLIC_BASE =
  'https://unakyuksioglmihvipmi.supabase.co/storage/v1/object/public/hpm-media/media/';

// The existing 2000×1200 'hero' crop, verified present in the bucket.
const LARGE_BACKFILL = {
  filename: 'IMG_0581-2000x1200.jpg',
  width: 2000,
  height: 1200,
  mimeType: 'image/jpeg',
  filesize: 479126,
  url: PUBLIC_BASE + 'IMG_0581-2000x1200.jpg',
};

const NEW_ALT =
  'John Deere compact tractor with a McConnel PA3430 reach-arm flail cutting a hedge in a narrow Hampshire lane';

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] applying' : '[dry-run] use --execute to write');
console.log();

let changes = 0;

// ---- 1. media 68: sanity check, backfill sizes.large, improve alt -----------
let mediaOk = false;
{
  let media = null;
  try {
    media = await payload.findByID({ collection: 'media', id: NEW_HERO_ID, depth: 0 });
  } catch {
    media = null;
  }

  if (!media) {
    console.log(`  [ABORT] media ${NEW_HERO_ID} not found in this database.`);
  } else if (media.filename !== NEW_HERO_FILENAME) {
    console.log(`  [ABORT] media ${NEW_HERO_ID} is "${media.filename}", expected "${NEW_HERO_FILENAME}".`);
  } else if (media.sizes?.hero?.filename !== LARGE_BACKFILL.filename) {
    // Guard the whole point of the script: if the hero crop isn't there,
    // backfilling 'large' with its filename would just create a second 404.
    console.log(`  [ABORT] media ${NEW_HERO_ID} has no '${LARGE_BACKFILL.filename}' hero variant`);
    console.log(`          (sizes.hero.filename = ${media.sizes?.hero?.filename ?? 'null'}).`);
  } else {
    mediaOk = true;
    const large = media.sizes?.large ?? {};
    const largeDone = large.filename === LARGE_BACKFILL.filename;
    const altDone = media.alt === NEW_ALT;

    if (largeDone) {
      console.log(`  [ok] media ${NEW_HERO_ID} sizes.large already points at the 2000×1200 crop`);
    } else {
      console.log(`  [sizes] media ${NEW_HERO_ID} sizes.large: ${large.filename ?? '(unset — falls back to the 1500×2000 portrait original)'}`);
      console.log(`                              → ${LARGE_BACKFILL.filename} (2000×1200)`);
    }
    if (altDone) {
      console.log(`  [ok] media ${NEW_HERO_ID} alt already set`);
    } else {
      console.log(`  [alt]   media ${NEW_HERO_ID}: "${media.alt ?? '(none)'}"`);
      console.log(`                    → "${NEW_ALT}"`);
    }

    if (!largeDone || !altDone) {
      if (EXECUTE) {
        await payload.update({
          collection: 'media',
          id: NEW_HERO_ID,
          data: {
            alt: NEW_ALT,
            sizes: { ...(media.sizes ?? {}), large: LARGE_BACKFILL },
          },
        });
        console.log(`  ✓ updated media ${NEW_HERO_ID}`);
      }
      changes++;
    }
  }
}

// ---- 2. repoint the hedge-cutting hero -------------------------------------
console.log();
if (!mediaOk) {
  console.log('  [skip] not repointing the service hero — media checks above did not pass.');
} else {
  const res = await payload.find({
    collection: 'services',
    where: { slug: { equals: SERVICE_SLUG } },
    limit: 1,
    depth: 0,
  });
  const svc = res.docs[0];

  if (!svc) {
    console.log(`  [missing] service /services/${SERVICE_SLUG} not found`);
  } else {
    const current = typeof svc.heroImage === 'object' ? svc.heroImage?.id : svc.heroImage;
    if (current === NEW_HERO_ID) {
      console.log(`  [ok] /services/${SERVICE_SLUG} (id ${svc.id}) hero already media ${NEW_HERO_ID}`);
    } else {
      console.log(`  [hero] /services/${SERVICE_SLUG} (id ${svc.id}):`);
      console.log(`         media ${current ?? '(none)'}${current === OLD_HERO_ID ? ' (broken — all variants missing from the bucket)' : ''} → ${NEW_HERO_ID}`);
      if (EXECUTE) {
        await payload.update({
          collection: 'services',
          id: svc.id,
          data: { heroImage: NEW_HERO_ID },
        });
        console.log(`  ✓ updated service ${svc.id}`);
      }
      changes++;
    }
  }
}

console.log();
console.log(`done: ${changes} changes${EXECUTE ? '' : ' (dry-run)'}`);
console.log(
  `note: media ${OLD_HERO_ID} is left in place but is now referenced by nothing — delete or re-upload separately.`,
);
process.exit(0);
