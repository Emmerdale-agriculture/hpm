#!/usr/bin/env node
/**
 * scripts/apply-wood-chipping-service-2026-W34.mjs
 *
 * Creates a new service page: /services/wood-chipping — "Wood chipping &
 * land clearance". Requested by Tom (2026-08-20) with hero image media 189
 * (Timberwolf TW 280FTR, uploaded to prod the same day).
 *
 * Why a new page rather than folding it into /services/land-ditch-clearance:
 * that page is about *water* — ditches, culverts and drainage outfalls, and
 * its copy and SEO are pointed squarely at drainage intent. Vegetation and
 * timber clearance plus on-site chipping is a different query cluster
 * ("land clearance hampshire", "wood chipping hampshire", "site clearance").
 * Sharing one URL would make both pages worse. The two are cross-linked
 * instead so the distinction is obvious to a reader who lands on either.
 *
 * Slug is `wood-chipping` (not `land-clearance`) deliberately — a sibling
 * /services/land-clearance next to the existing /services/land-ditch-clearance
 * would cannibalise it. The land-clearance intent is carried by the title,
 * H1, meta and body copy instead.
 *
 * What it does:
 *   1. Creates (or updates in place, if re-run) the wood-chipping service:
 *      published, category ground-care, orderInMenu 95 so it sits directly
 *      above Land & ditch clearance in the index/footer, hero media 189,
 *      equipment sidebar, at-a-glance, ~600 words of body copy, related
 *      services resolved by slug.
 *   2. Improves media 189's alt text — Payload derived it from the filename
 *      ("Timberwolf tm 280 ftr ready to work social"), which is what would
 *      otherwise ship as the hero alt and the OG image alt.
 *   3. Gives the new page an inbound link: sets relatedServices on
 *      land-ditch-clearance (currently unset, so it falls back to three
 *      arbitrary services) and appends a short signposting paragraph to its
 *      body pointing at the new page.
 *
 * No code changes needed — services with a category set are picked up
 * automatically by /services, the footer and the sitemap. Cache refreshes on
 * the 1h ISR TTL (revalidateTag is a no-op outside a request scope).
 *
 * Idempotent. Dry-run by default; pass --execute to write.
 *
 *   Local mirror:
 *     node_modules/.bin/tsx --env-file=.env.local scripts/apply-wood-chipping-service-2026-W34.mjs
 *
 *   Prod (dry-run first, then add --execute):
 *     DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *       node_modules/.bin/tsx --env-file=.env.local \
 *       scripts/apply-wood-chipping-service-2026-W34.mjs --execute
 *
 * Note on the invocation: DATABASE_URL_PROD lives in .env.local and is not
 * exported into the shell, so a bare `DATABASE_URL=$DATABASE_URL_PROD` prefix
 * sets it to the empty string. Node's --env-file does NOT override a variable
 * that is already present in the environment, so the empty value wins and the
 * connect fails with "client password must be a string". Hence the grep.
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');

const SLUG = 'wood-chipping';
const HERO_MEDIA_ID = 189; // Timberwolf TW 280FTR ready to work — landscape 2000×1745
const HERO_MEDIA_FILENAME = 'timberwolf-tm-280-ftr-ready-to-work-social.jpg';
const HERO_ALT =
  'Timberwolf TW 280FTR tracked wood chipper and chainsaws on a Hampshire field after clearance work';
const RELATED_SLUGS = ['land-ditch-clearance', 'flailing', 'hedge-cutting'];

// --- lexical helpers (same shapes as apply-hedge-cutting-service-2026-W29) ---
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
const bullets = (items) => ({
  type: 'list',
  tag: 'ul',
  listType: 'bullet',
  start: 1,
  format: '', indent: 0, version: 1, direction: 'ltr',
  children: items.map((str, i) => ({
    type: 'listitem',
    value: i + 1,
    checked: undefined,
    format: '', indent: 0, version: 1, direction: 'ltr',
    children: [text(str)],
  })),
});

const BODY_LEXICAL = {
  root: {
    type: 'root', format: '', indent: 0, version: 1, direction: 'ltr',
    children: [
      heading('h2', 'Clearing the ground is the easy half'),
      para([
        text(
          'Land that has stood for a few years doesn’t come back with a mow. Bramble, blackthorn and self-seeded ash take the corners first, then the fence lines, then the field. Cutting it down is straightforward enough — the awkward part is the heap of brash left behind, which is too big to burn casually, too bulky to trailer out, and too green to be much use to anyone.',
        ),
      ]),
      para([
        text(
          'Chipping deals with that on site. Everything that comes off goes through the chipper where it falls, and instead of a fortnight of trailer runs you’re left with a few cubic metres of clean woodchip. That either stays — spread on gateways and muddy tracks, mulched round trees, or stacked to rot down — or goes away with the rest of the tidy-up. Either way the field is usable again at the end of the job rather than at the end of the clear-up.',
        ),
      ]),
      heading('h2', 'A chipper that gets to the work'),
      para([
        text(
          'I run a Timberwolf TW 280FTR: a tracked, self-propelled chipper with an 8-inch (210 mm) throat, a 57 hp Kubota engine and a throughput of around seven tonnes an hour. The tracks are the point of it. A towed chipper has to sit on hard standing while somebody drags brash a hundred yards down to it; this one walks up the field, across soft ground and through ordinary gateways, and works alongside the pile. On horse paddocks, smallholdings and the tight corners I mostly work in, that’s the difference between a job that’s worth doing and one that isn’t.',
        ),
      ]),
      para([
        text(
          'Anything bigger than the chipper will take gets rung down with the saw first — cordwood stacked for your log pile if you want it, chipped if you don’t.',
        ),
      ]),
      heading('h2', 'Typical clearance jobs'),
      bullets([
        'Overgrown paddocks and fields coming back into use after a few years standing',
        'Bramble, blackthorn, gorse and scrub along fence lines and boundaries',
        'Self-seeded ash, sycamore and willow taking over grazing',
        'Storm-fallen and dead timber, and the brash left behind after tree work',
        'Clearing a line before new fencing goes in, or a whole site before reseeding',
        'Arb arisings and garden clearance too big for a green bin',
      ]),
      heading('h2', 'Timing, and the nesting-season rule'),
      para([
        text(
          'Scrub clearance follows the same constraint as hedge work: between March and August hedges and scrub are full of nesting birds, and it’s an offence to damage an active nest. That puts the bulk of clearance work between September and February — which suits the job anyway, because with the foliage down you can see what you’re actually cutting and the ground is usually firmer underfoot.',
        ),
      ]),
      para([
        text(
          'Winter also settles the disposal question. Burning is still an option on farmland, but it wants an Environment Agency exemption, a dry day and somebody standing over it until it’s out. Chipping needs none of that, and doesn’t leave a scorched circle in the middle of a paddock.',
        ),
      ]),
      heading('h2', 'What it costs'),
      para([
        text(
          'Clearance is quoted per job rather than per hour or per acre, because the price depends on what’s actually in there. Two acres of light bramble is a very different day to half an acre of twenty-year-old blackthorn with old fencing wire buried through it. A few photos and a rough idea of the area are usually enough for a price the same day; if it’s a big or an awkward one, I’ll come and look first.',
        ),
      ]),
      heading('h2', 'Related work'),
      para([
        text('Ditches, culverts and drainage outfalls are a separate job — that’s '),
        link('/services/land-ditch-clearance', 'land & ditch clearance'),
        text('. If what you’ve got is heavy grass and light scrub rather than woody growth, '),
        link('/services/flailing', 'flailing'),
        text(' is usually quicker and cheaper, and boundary hedges are covered under '),
        link('/services/hedge-cutting', 'hedge cutting'),
        text('.'),
      ]),
    ],
  },
};

// Sentinel heading — if the body already contains it, the page has been built.
const SENTINEL_HEADING = 'Clearing the ground is the easy half';

const SERVICE_DATA = {
  title: 'Wood chipping & land clearance',
  slug: SLUG,
  _status: 'published',
  shortDescription:
    'Wood chipping and general land clearance across Hampshire — overgrown scrub, brambles, self-seeded trees and fallen timber cleared and chipped on site with a tracked Timberwolf TW 280FTR.',
  strapline:
    'Scrub, brash and fallen timber chipped where it falls — a tracked chipper that gets up the field, not just onto the hard standing.',
  heroImage: HERO_MEDIA_ID,
  orderInMenu: 95, // directly above Land & ditch clearance (100) in ground care
  category: 'ground-care',
  equipment: [
    { name: 'Timberwolf TW 280FTR', spec: '8in (210mm) tracked chipper · 57 hp · ~7 t/hr' },
    { name: 'Compact tractor & flail', spec: 'Knocking down scrub and bramble ahead of the chipper' },
    { name: 'Professional chainsaws', spec: 'Felling, snedding and ringing down on site' },
  ],
  metaHighlights: {
    bestTime: 'Sept – Feb (outside nesting season)',
    frequency: 'One-off or as needed',
    quoteTurnaround: 'Same day',
  },
  content: [{ blockType: 'richText', content: BODY_LEXICAL }],
  seo: {
    metaTitle: 'Wood Chipping & Land Clearance in Hampshire | Tracked Chipper',
    metaDescription:
      'Wood chipping and land clearance across Hampshire — scrub, brambles, fallen timber and site clearance. Tracked 8in chipper works off-road. Same-day quotes.',
  },
};

// --- signposting paragraph appended to land-ditch-clearance ------------------
const LDC_SLUG = 'land-ditch-clearance';
const LDC_SENTINEL = 'Clearing scrub, self-seeded trees or fallen timber';
const LDC_PARA = para([
  text('Clearing scrub, self-seeded trees or fallen timber rather than water? That’s '),
  link(`/services/${SLUG}`, 'wood chipping & land clearance'),
  text(' — everything that comes off gets chipped on site instead of carted away.'),
]);

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] applying' : '[dry-run] use --execute to write');
console.log();

let changes = 0;

// ---- 0. hero media sanity check + alt text ----------------------------------
let heroOk = false;
{
  let media = null;
  try {
    media = await payload.findByID({ collection: 'media', id: HERO_MEDIA_ID, depth: 0 });
  } catch {
    media = null;
  }
  if (!media) {
    console.log(`  [MISSING] media ${HERO_MEDIA_ID} not found in this database.`);
    console.log(`            Expected "${HERO_MEDIA_FILENAME}". The service will be`);
    console.log(`            written without a hero image — re-run once the upload exists.`);
  } else if (media.filename !== HERO_MEDIA_FILENAME) {
    console.log(`  [MISMATCH] media ${HERO_MEDIA_ID} is "${media.filename}", expected`);
    console.log(`             "${HERO_MEDIA_FILENAME}" — NOT using it as the hero.`);
  } else {
    heroOk = true;
    if (media.alt === HERO_ALT) {
      console.log(`  [ok] media ${HERO_MEDIA_ID} alt already set`);
    } else {
      console.log(`  [alt] media ${HERO_MEDIA_ID}: "${media.alt ?? '(none)'}"`);
      console.log(`               → "${HERO_ALT}"`);
      if (EXECUTE) await payload.update({ collection: 'media', id: HERO_MEDIA_ID, data: { alt: HERO_ALT } });
      changes++;
    }
  }
}

// ---- 1. create / update the service -----------------------------------------
console.log();
{
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

  const data = {
    ...SERVICE_DATA,
    relatedServices: relatedIds,
    ...(heroOk ? {} : { heroImage: null }),
  };

  const existing = await payload.find({
    collection: 'services',
    where: { slug: { equals: SLUG } },
    limit: 1,
    depth: 0,
  });

  if (existing.docs.length === 0) {
    console.log(`  [create] service /services/${SLUG} — "${SERVICE_DATA.title}"`);
    console.log(`           category ${SERVICE_DATA.category} · order ${SERVICE_DATA.orderInMenu} · hero ${heroOk ? HERO_MEDIA_ID : '(none)'}`);
    console.log(`           related: ${RELATED_SLUGS.join(', ')}`);
    if (EXECUTE) {
      const created = await payload.create({ collection: 'services', data });
      console.log(`  ✓ created id ${created.id}`);
    }
    changes++;
  } else {
    const svc = existing.docs[0];
    const built = JSON.stringify(svc.content ?? []).includes(SENTINEL_HEADING);
    if (built && svc.category === SERVICE_DATA.category && svc._status === 'published') {
      console.log(`  [ok] service /services/${SLUG} (id ${svc.id}) already built`);
    } else {
      console.log(`  [update] service /services/${SLUG} (id ${svc.id}) — rebuilding in place`);
      if (EXECUTE) {
        await payload.update({
          collection: 'services',
          id: svc.id,
          data: { ...data, seo: { ...(svc.seo ?? {}), ...SERVICE_DATA.seo } },
        });
        console.log(`  ✓ updated id ${svc.id}`);
      }
      changes++;
    }
  }
}

// ---- 2. inbound link from land-ditch-clearance -------------------------------
console.log();
{
  const res = await payload.find({
    collection: 'services',
    where: { slug: { equals: LDC_SLUG } },
    limit: 1,
    depth: 0,
  });
  const ldc = res.docs[0];
  const newRes = await payload.find({
    collection: 'services',
    where: { slug: { equals: SLUG } },
    limit: 1,
    depth: 0,
  });
  const newId = newRes.docs[0]?.id ?? null;

  if (!ldc) {
    console.log(`  [missing] service /services/${LDC_SLUG} — skipping inbound link`);
  } else if (!newId && !EXECUTE) {
    console.log(`  [dry-run] /services/${LDC_SLUG}: would add relatedServices + signpost paragraph`);
    console.log(`            (new service id not known until --execute)`);
  } else if (!newId) {
    console.log(`  [warn] new service id not found after create — skipping inbound link`);
  } else {
    const alreadyLinked = JSON.stringify(ldc.content ?? []).includes(LDC_SENTINEL);
    const relIds = (ldc.relatedServices ?? []).map((r) => (typeof r === 'object' ? r.id : r));
    const relOk = relIds.includes(newId);

    if (alreadyLinked && relOk) {
      console.log(`  [ok] /services/${LDC_SLUG} already links to /services/${SLUG}`);
    } else {
      // Append the signpost to the first richText block rather than replacing
      // the body — that copy is fine, it just doesn't know about the new page.
      const blocks = Array.isArray(ldc.content) ? JSON.parse(JSON.stringify(ldc.content)) : [];
      const rt = blocks.find((b) => b.blockType === 'richText' && b.content?.root?.children);
      if (!rt) {
        console.log(`  [warn] /services/${LDC_SLUG} has no richText block — adding relation only`);
      } else if (!alreadyLinked) {
        rt.content.root.children.push(LDC_PARA);
      }

      const otherRel = [];
      for (const slug of ['flailing', 'hedge-cutting']) {
        const r = await payload.find({ collection: 'services', where: { slug: { equals: slug } }, limit: 1, depth: 0 });
        if (r.docs[0]) otherRel.push(r.docs[0].id);
      }

      console.log(`  [link] /services/${LDC_SLUG} (id ${ldc.id}):`);
      console.log(`         relatedServices: [${relIds.join(', ') || 'unset — falls back to 3 arbitrary'}] → [${[newId, ...otherRel].join(', ')}]`);
      console.log(`         body: ${alreadyLinked ? 'already signposted' : 'append signpost paragraph'}`);
      if (EXECUTE) {
        await payload.update({
          collection: 'services',
          id: ldc.id,
          data: { content: rt ? blocks : ldc.content, relatedServices: [newId, ...otherRel] },
        });
        console.log(`  ✓ updated id ${ldc.id}`);
      }
      changes++;
    }
  }
}

console.log();
console.log(`done: ${changes} changes${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
