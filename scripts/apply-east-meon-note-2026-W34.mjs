#!/usr/bin/env node
/**
 * scripts/apply-east-meon-note-2026-W34.mjs
 *
 * Publishes Tom's East Meon case study to /notes and wires it to the new
 * /services/wood-chipping page.
 *
 * Why this matters more than tuning the service page: GSC shows this site's
 * traffic comes from /notes/*, not /services/*. Last 180d the best service
 * page managed 962 impressions while four notes articles cleared 3,000+ and
 * the top one 9,272. The wood-chipping service page shipped with zero links
 * to /notes (peers have 4–6) because no clearance post existed. This is that
 * post.
 *
 * Requires the code side (tags.ts 'clearance' TagDef, tag-service-map
 * entries) to be deployed. Run this AFTER the deploy is READY — otherwise
 * the in-article service CTA and the service page's "notes" section stay
 * dormant until the next deploy. Harmless either way, just invisible.
 *
 * What it does:
 *   1. Uploads five job photos from SOURCE_DIR, baking in EXIF rotation.
 *      Four of the five are portrait shots saved as 2000×1500 with EXIF
 *      orientation 6 — i.e. they only look landscape to software that
 *      ignores the tag. Payload's sharp pipeline is not guaranteed to
 *      normalise that (the `IMG_5480-rotated` / `IMG_5178-rotated` names
 *      already in the media library suggest it has bitten before), so we
 *      rotate the pixels and strip the tag before upload rather than
 *      hoping. Idempotent: an existing media doc with the same target
 *      filename is reused, not re-uploaded.
 *   2. Creates the post: category case-study, tags [clearance, equipment],
 *      primaryTag clearance (which drives the wood-chipping CTA panel),
 *      hero + four in-body photos, and in-body links to the wood chipping,
 *      flailing and overseeding service pages.
 *
 * Tom's copy is reproduced verbatim — the inline markdown parser below
 * preserves his **bold** and *italic* exactly. Only the service links are
 * additions.
 *
 * Idempotent. Dry-run by default; pass --execute to write.
 *
 *   Local mirror:
 *     node_modules/.bin/tsx --env-file=.env.local scripts/apply-east-meon-note-2026-W34.mjs
 *
 *   Prod (dry-run first, then add --execute):
 *     DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *       node_modules/.bin/tsx --env-file=.env.local \
 *       scripts/apply-east-meon-note-2026-W34.mjs --execute
 *
 * Photos default to the Windows Downloads folder they arrived in; override
 * with EAST_MEON_PHOTOS=/some/dir.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const SOURCE_DIR = process.env.EAST_MEON_PHOTOS ?? '/mnt/c/Users/tomos/Downloads';

const SLUG = 'clearing-overgrown-paddocks-east-meon';

// source filename → { name: target filename, alt, caption }
const PHOTOS = [
  {
    src: 'before we started.jpeg',
    name: 'east-meon-paddock-overgrown-before-clearance.jpg',
    alt: 'Three acres of overgrown horse paddock in East Meon, waist-high grass and self-seeded saplings in tree guards',
    caption: 'Before we started — three acres of paddock lost to grass, scrub and self-seeded saplings.',
  },
  {
    src: 'Flails been in.jpeg',
    name: 'east-meon-paddock-after-flail-mowing.jpg',
    alt: 'The same East Meon paddock after flail mowing, with the undergrowth cut away and the saplings left standing',
    caption: 'After the flail mower — the undergrowth gone, and the scale of the tree job finally visible.',
  },
  {
    src: 'flails been in 2.jpeg',
    name: 'east-meon-paddock-flailed-ground-revealed.jpg',
    alt: 'Flailed East Meon paddock showing the cleared ground surface with the treeline beyond',
    caption: 'The shape of the original paddock, visible again for the first time in years.',
  },
  {
    src: 'Trees gone.jpeg',
    name: 'east-meon-paddock-trees-cleared.jpg',
    alt: 'East Meon paddock cleared of more than 300 self-seeded trees, with a pile of collected tree guards and stakes',
    caption: 'Trees down and chipped — with a few hundred tree guards and stakes collected up.',
  },
  {
    src: 'trees gone 2.jpeg',
    name: 'east-meon-paddock-stumps-remaining.jpg',
    alt: 'Cleared East Meon paddock showing the remaining tree stumps and scattered wood chip, with the valley beyond',
    caption: 'What is left: several hundred stumps, waiting for the ground to soften in late September.',
  },
];

const HERO = 'east-meon-paddock-overgrown-before-clearance.jpg';

// --- lexical helpers ---------------------------------------------------------
const IS_BOLD = 1;
const IS_ITALIC = 2;

const textNode = (str, format = 0) => ({
  mode: 'normal', text: str, type: 'text', style: '', detail: 0, format, version: 1,
});
const linkNode = (url, children) => ({
  type: 'link',
  fields: { url, newTab: false, linkType: 'custom' },
  format: '', indent: 0, version: 3, direction: 'ltr',
  children,
});

/**
 * Minimal inline-markdown → lexical text nodes: **bold**, *italic* and
 * [anchor](/url). Keeps Tom's emphasis faithful without hand-building every
 * node, and without pulling in a markdown dependency.
 *
 * Recurses into each match rather than treating the three forms as flat
 * alternatives — otherwise the **bold** branch wins on a string like
 * "**tracked [chipper](/services/wood-chipping)**" and swallows the link,
 * emitting the raw brackets as visible text. `format` is a lexical format
 * bitmask carried down so nesting composes (bold inside a link, etc).
 */
function rich(md, format = 0) {
  if (!md) return [];
  const out = [];
  //            **bold**            *italic*                [anchor](/url)
  const re = /\*\*([\s\S]+?)\*\*|(?<!\*)\*([^*]+?)\*(?!\*)|\[([^\]]+?)\]\(([^)]+?)\)/g;
  let last = 0, m;
  while ((m = re.exec(md)) !== null) {
    if (m.index > last) out.push(textNode(md.slice(last, m.index), format));
    if (m[1] !== undefined) out.push(...rich(m[1], format | IS_BOLD));
    else if (m[2] !== undefined) out.push(...rich(m[2], format | IS_ITALIC));
    else out.push(linkNode(m[4], rich(m[3], format)));
    last = re.lastIndex;
  }
  if (last < md.length) out.push(textNode(md.slice(last), format));
  return out.length ? out : [textNode(md, format)];
}

const p = (md) => ({
  type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr', children: rich(md),
});
const h2 = (str) => ({
  tag: 'h2', type: 'heading', format: '', indent: 0, version: 1, direction: 'ltr',
  children: [textNode(str)],
});
const img = (mediaId) => ({
  type: 'upload', relationTo: 'media', value: mediaId,
  format: '', version: 3,
});

// --- the article -------------------------------------------------------------
// `IMG:<target filename>` markers are replaced with upload nodes once the
// media ids are known.
const BODY = [
  p('We were recently contacted by a new client in **East Meon, Hampshire**, who had purchased a property with around **three acres of paddocks**. The long-term plan was simple: bring their horses home and make use of the land as grazing.'),
  // NB: the "before" shot is the hero, so it is deliberately not repeated here.
  p('There was just one fairly substantial problem — over the years, the paddocks had been left unmanaged and nature had taken over.'),
  p('What should have been three acres of grazing had become heavily overgrown, with **more than 300 self-seeded saplings and small trees** scattered throughout the fields. Years of natural regeneration had effectively started turning the paddocks into young woodland.'),
  p('Our job was to begin reversing that process and get the land on its way back to becoming usable horse paddocks.'),

  h2('Stage One: Finding the Paddock Again'),
  p('The first job was to remove as much of the vegetation as possible before tackling the trees themselves.'),
  p('We brought in our **compact tractor and [flail mower](/services/flailing)** and worked across the three acres, cutting down the long grass, weeds, brambles and lighter vegetation that had developed between the trees.'),
  p('A flail mower is ideal for this sort of initial paddock clearance. Unlike a conventional finishing mower, it can deal with much rougher vegetation and allows us to quickly expose the ground underneath.'),
  p('Within a few hours, the transformation was already significant.'),
  'IMG:east-meon-paddock-after-flail-mowing.jpg',
  p('The dense undergrowth had disappeared and, for the first time in some time, it was possible to properly see the shape of the original paddocks.'),
  p('Unfortunately, it also revealed the scale of the next part of the job.'),
  p('Once the vegetation had been cleared, we were effectively left with **three acres containing hundreds of small trees and saplings**.'),
  'IMG:east-meon-paddock-flailed-ground-revealed.jpg',

  h2('More Than 300 Trees to Remove'),
  p("Many of the trees had simply seeded themselves naturally while the paddocks weren't being actively managed. Individually, most weren't particularly large, but with more than 300 spread across three acres, there was a considerable amount of work involved."),
  p('For this stage there were **two of us working with two Stihl chainsaws**, cutting the trees as close to ground level as practical.'),
  p('With this many trees, keeping the operation moving efficiently was important. There is little benefit in having someone cutting continuously if the resulting timber and branches then pile up around the site.'),
  p("That's where the chipper became one of the most important machines on the job."),

  h2('Putting the Timberwolf TW 280FTR to Work'),
  p('For the clearance we used our **tracked [Timberwolf TW 280FTR wood chipper](/services/wood-chipping)**.'),
  p('A tracked chipper makes a huge difference on a job like this because we can take the machine to the material rather than having to continually drag branches and whole trees across the paddock to a stationary chipper.'),
  p('As trees were felled, the Timberwolf could be positioned close to the working area and the resulting material processed as we progressed.'),
  p('The majority of the branches and smaller timber were chipped, dramatically reducing the volume of material that would otherwise have been left behind.'),
  p("It also meant we weren't creating enormous piles of brash around the paddocks that would then need handling again later."),
  p('Between **two people, two Stihl chainsaws, six chains and the tracked Timberwolf**, we managed to turn more than 300 standing trees into nothing more than stumps in the ground.'),
  'IMG:east-meon-paddock-trees-cleared.jpg',
  p('The tree-clearance stage took approximately **two and a half days**.'),
  p('For three acres that had been left to naturally regenerate for years, the difference was enormous.'),

  h2("Why We Haven't Removed the Stumps Yet"),
  p('The temptation on a land-clearance project is to immediately move onto the next stage, but ground conditions have a major influence on how efficiently some operations can be carried out.'),
  p('At the moment, the ground in East Meon is extremely dry and hard — closer to concrete than workable soil in places.'),
  p('Trying to remove hundreds of tree stumps in these conditions would make the job considerably harder than it needs to be and would place unnecessary strain on machinery.'),
  p("Instead, we've scheduled the next phase of the project for **the end of September**, when we would normally expect the ground to have picked up some moisture and become easier to work."),
  p("Sometimes the most efficient approach isn't simply throwing bigger machinery at difficult ground; it's choosing the right time to carry out the work."),
  'IMG:east-meon-paddock-stumps-remaining.jpg',

  h2('Next Stage: Removing Hundreds of Stumps'),
  p('Removing the trees is only the first major stage of converting this land back into paddocks.'),
  p('Every tree has left behind a stump and root system, and these need to be dealt with before we can properly renovate the surface.'),
  p("Leaving hundreds of stumps isn't practical for a horse paddock. Aside from interfering with future mowing and maintenance, uneven ground, holes and exposed roots aren't something we want to leave in an area intended for horses."),
  p("Once conditions improve, we'll return to **remove the stumps and roots**, deal with the disturbed ground and start preparing the site for the next phase of paddock renovation."),
  p('That is when the project will begin changing from a land-clearance job into a **proper paddock restoration project**.'),

  h2('Turning the Land Back Into Grazing'),
  p("Once the stumps are out, we'll be able to properly assess the condition of the soil and surface across the whole three acres."),
  p('Years of trees, scrub and unmanaged vegetation inevitably leave an uneven surface, while machinery and historic use can also create areas of compaction.'),
  p('The aim isn\'t simply to make the field *look* like a paddock again. The end result needs to be a surface capable of establishing a strong grass sward and ultimately providing safe, usable grazing for horses.'),
  p('Depending on what we find once the stumps have been removed, the next stages are likely to involve **ground preparation, levelling, cultivation and [reseeding](/services/overseeding)**, followed by sufficient establishment time before horses are allowed onto the new grass.'),
  p('It takes longer than simply clearing the vegetation, but proper preparation at this stage can make an enormous difference to the quality and longevity of the finished paddock.'),

  h2('A Huge Transformation in Just Three Days'),
  p("This project is a good example of just how quickly grazing land can disappear when it isn't regularly maintained."),
  p('Self-seeded trees initially look insignificant, but leave them for several years and a handful of saplings can quickly become hundreds. Eventually, mowing becomes impossible and the land gradually transitions from grassland into scrub and young woodland.'),
  p('In this case, however, the process can be reversed.'),
  p("In around **three working days**, including the initial flailing and two and a half days of tree clearance, we've gone from three acres of heavily overgrown ground containing more than 300 trees to an open site where the original paddocks can be clearly seen again."),
  p('There is still plenty of work ahead, but the biggest visual obstacle has gone.'),

  h2('The East Meon Paddock Restoration Continues'),
  p("We'll be returning to the site at the **end of September** for the next stage: tackling the hundreds of remaining stumps and beginning the ground-restoration process."),
  p('From there, the objective is to take what had effectively become young woodland and turn it back into **three acres of established, manageable horse paddocks**, ready for the owners to finally bring their horses home.'),
  p("We'll be documenting the next stages of the project as the paddocks progress from clearance, through ground preparation and reseeding, to the finished grazing."),
  p("If you have **overgrown paddocks, neglected grazing land or fields that have become covered in scrub, saplings and self-seeded trees**, it doesn't necessarily mean the land is lost. With the right machinery and a staged approach to [clearance and renovation](/services/wood-chipping), even heavily neglected paddocks can often be brought back into productive use."),
];

const POST_DATA = {
  title: 'From Overgrown Woodland Back to Horse Paddocks in East Meon',
  slug: SLUG,
  _status: 'published',
  category: 'case-study',
  tags: [{ tag: 'clearance' }, { tag: 'equipment' }],
  primaryTag: 'clearance',
  excerpt:
    'Three acres of East Meon paddock had been left to nature and grown more than 300 self-seeded trees. Here is how we flailed, felled and chipped it back to open ground in three working days — and why the stumps are waiting until September.',
  seo: {
    metaTitle: 'Clearing 300 Self-Seeded Trees from Overgrown Paddocks',
    metaDescription:
      'How three acres of overgrown East Meon paddock, lost to scrub and 300+ self-seeded trees, were flailed, felled and chipped back to open grazing in three days.',
  },
};

// --- run ---------------------------------------------------------------------
const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] applying' : '[dry-run] use --execute to write');
console.log();

let changes = 0;
const mediaIds = new Map();

// ---- 1. photos ---------------------------------------------------------------
for (const photo of PHOTOS) {
  const existing = await payload.find({
    collection: 'media',
    where: { filename: { equals: photo.name } },
    limit: 1,
    depth: 0,
  });
  if (existing.docs[0]) {
    mediaIds.set(photo.name, existing.docs[0].id);
    console.log(`  [ok] media "${photo.name}" already uploaded (id ${existing.docs[0].id})`);
    continue;
  }

  const srcPath = path.join(SOURCE_DIR, photo.src);
  let raw;
  try {
    raw = await fs.readFile(srcPath);
  } catch {
    console.log(`  [MISSING] ${srcPath}`);
    console.log(`            Set EAST_MEON_PHOTOS to the folder holding the originals.`);
    continue;
  }

  const meta = await sharp(raw).metadata();
  // .rotate() with no argument applies the EXIF orientation and drops the tag.
  const buf = await sharp(raw).rotate().jpeg({ quality: 86 }).toBuffer();
  const out = await sharp(buf).metadata();
  console.log(`  [upload] ${photo.src}`);
  console.log(`           ${meta.width}×${meta.height} exif-orientation=${meta.orientation ?? 'none'} → ${out.width}×${out.height} baked`);
  console.log(`           → ${photo.name}`);

  if (EXECUTE) {
    const created = await payload.create({
      collection: 'media',
      data: { alt: photo.alt, caption: photo.caption },
      file: { data: buf, mimetype: 'image/jpeg', name: photo.name, size: buf.length },
    });
    mediaIds.set(photo.name, created.id);
    console.log(`  ✓ media id ${created.id}`);
  }
  changes++;
}

// ---- 2. the post -------------------------------------------------------------
console.log();
{
  const existing = await payload.find({
    collection: 'posts',
    where: { slug: { equals: SLUG } },
    limit: 1,
    depth: 0,
  });

  // Swap the IMG: markers for upload nodes.
  const children = [];
  let missingImages = 0;
  for (const node of BODY) {
    if (typeof node === 'string' && node.startsWith('IMG:')) {
      const key = node.slice(4);
      const id = mediaIds.get(key);
      if (id) children.push(img(id));
      else missingImages++;
      continue;
    }
    children.push(node);
  }
  if (missingImages && EXECUTE) {
    console.log(`  [warn] ${missingImages} in-body image(s) unresolved — post will publish without them.`);
  }

  const content = [{
    blockType: 'richText',
    content: { root: { type: 'root', format: '', indent: 0, version: 1, direction: 'ltr', children } },
  }];

  const heroId = mediaIds.get(HERO) ?? null;
  const data = {
    ...POST_DATA,
    content,
    ...(heroId ? { heroImage: heroId } : {}),
    publishedAt: existing.docs[0]?.publishedAt ?? new Date().toISOString(),
  };

  if (!existing.docs[0]) {
    console.log(`  [create] post /notes/${SLUG}`);
    console.log(`           "${POST_DATA.title}"`);
    console.log(`           category=${POST_DATA.category} tags=[clearance,equipment] primaryTag=clearance`);
    console.log(`           hero=${heroId ?? '(pending — needs --execute)'} · ${children.filter((c) => c.type === 'upload').length} in-body photos`);
    console.log(`           links → /services/wood-chipping ×2, /services/flailing, /services/overseeding`);
    if (EXECUTE) {
      const created = await payload.create({ collection: 'posts', data });
      console.log(`  ✓ created post id ${created.id}`);
    }
    changes++;
  } else {
    const post = existing.docs[0];
    console.log(`  [update] post /notes/${SLUG} (id ${post.id}) — rewriting body/tags/hero in place`);
    if (EXECUTE) {
      await payload.update({
        collection: 'posts',
        id: post.id,
        data: { ...data, seo: { ...(post.seo ?? {}), ...POST_DATA.seo } },
      });
      console.log(`  ✓ updated post id ${post.id}`);
    }
    changes++;
  }
}

console.log();
console.log(`done: ${changes} change${changes === 1 ? '' : 's'}${EXECUTE ? '' : ' (dry-run)'}`);
console.log("reminder: the in-article CTA and the service page's notes section need the");
console.log("          tags.ts / tag-service-map.ts change deployed to appear.");
process.exit(0);
