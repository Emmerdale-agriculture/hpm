#!/usr/bin/env node
/**
 * scripts/apply-east-meon-part-3-2026-W42.mjs
 *
 * Publishes Part 3 of the East Meon paddock series to /notes: spraying off,
 * rotavating, rolling and seeding the cleared ground. Picks up exactly where
 * Part 2 (/notes/east-meon-paddock-creation-stump-removal) signed off.
 *
 * What it does:
 *   1. Uploads three photos from SOURCE_DIR (sprayer, 4066M + Kuhn rotavator,
 *      4066M + Fleming roller), EXIF rotation baked in like the Part 1 script.
 *      Idempotent: an existing media doc with the same filename is reused.
 *   2. Creates (or rewrites in place) the Part 3 post: category case-study,
 *      tags [ground-care, clearance, equipment], primaryTag ground-care,
 *      rotavator shot as hero, sprayer + roller in-body, links to the
 *      spraying / weed-control / rotavating / rolling / overseeding services
 *      and back to Parts 1 and 2.
 *   3. Turns Part 2's closing plain-text "Next: … Part 3" line into a link to
 *      the new post. Skipped if Part 2 isn't found or is already linked.
 *
 * Tom's notes are the only source of facts; the copy expands them into the
 * series' voice without adding anything he didn't say (kit names come from
 * what's visible in the photos).
 *
 * Idempotent. Dry-run by default; pass --execute to write.
 *
 *   Prod (dry-run first, then add --execute):
 *     DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *       node_modules/.bin/tsx --env-file=.env.local \
 *       scripts/apply-east-meon-part-3-2026-W42.mjs --execute
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

const SLUG = 'east-meon-paddock-creation-seeding';
const PART_1 = '/notes/clearing-overgrown-paddocks-east-meon';
const PART_2_SLUG = 'east-meon-paddock-creation-stump-removal';
const PART_2 = `/notes/${PART_2_SLUG}`;

// source filename → { name: target filename, alt, caption }
const PHOTOS = [
  {
    src: 'IMG_6476.jpeg',
    name: 'east-meon-john-deere-4066m-kuhn-rotavator.jpg',
    alt: 'John Deere 4066M compact tractor with a Kuhn rotavator working the cleared East Meon paddock, with the valley and treeline behind',
    caption: 'The John Deere 4066M and Kuhn rotavator working the whole area down into a level, aerated seedbed.',
  },
  {
    src: 'tight-spaces-web.jpg',
    name: 'east-meon-boom-sprayer-glyphosate.jpg',
    alt: 'Rear view of a tractor-mounted boom sprayer with its booms folded, parked beside a paddock fence under a cloudy sky',
    caption: 'The boom sprayer: the first pass over the cleared ground was glyphosate, then two weeks of waiting.',
  },
  {
    src: 'IMG_6616.jpeg',
    name: 'east-meon-fleming-roller-seedbed.jpg',
    alt: 'John Deere 4066M compact tractor pulling a Fleming roller across the rotavated East Meon paddock on a sunny autumn day',
    caption: 'The Fleming roller on the rotavated ground, firming the bed ahead of the seeder.',
  },
];

const HERO = 'east-meon-john-deere-4066m-kuhn-rotavator.jpg';

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

/** Minimal inline-markdown → lexical: **bold**, *italic*, [anchor](/url). */
function rich(md, format = 0) {
  if (!md) return [];
  const out = [];
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
  p(`Our East Meon paddock creation and rejuvenation project has reached the stage where the land finally starts to look like paddocks again.`),
  p(`In [Part 1](${PART_1}) we flailed three acres of overgrown ground and felled more than 300 self-seeded trees. In [Part 2](${PART_2}) an excavator pulled out the stumps and root systems, the holes were filled and roughly levelled, and the hedges and drainage were dealt with.`),
  p(`With the trees gone, this visit was all about the ground itself: **killing off what was left growing in it, cultivating it, and getting grass seed into a proper seedbed**.`),

  h2('Stage One: Spraying Off with Glyphosate'),
  p(`After the trees and stumps had been removed, the next step was to [spray the whole area with glyphosate](/services/spraying).`),
  p(`There were two reasons for this. The cleared ground had developed **extensive weed growth**, and underneath it there were still **root networks** from everything that had been removed. We wanted to be certain all of that was dead before continuing, rather than cultivating it and spreading living roots and weeds right through the new seedbed.`),
  'IMG:east-meon-boom-sprayer-glyphosate.jpg',
  p(`Once the fields had been sprayed we left them for **two weeks**. Glyphosate works by translocating through the plant down into its roots, and that takes time. Spray and cultivate the same week and you simply chop up plants that are still alive. Give it a fortnight and the whole root system dies with the top growth.`),
  p(`It is a frustrating pause on a project like this, but it is the difference between a clean seedbed and one that is fighting [weeds](/services/weed-control) from day one.`),

  h2('Stage Two: Rotavating the Whole Area'),
  p(`With the spray-off done, the next step was to [rotavate](/services/rotavating) the entire area with the **John Deere 4066M and Kuhn rotavator**.`),
  p(`Rotavating did several jobs at once on this site. It **filled in the holes left from the tree and stump removal**, it **levelled out the humps and bumps** that months of clearance work and excavator traffic had left behind, and it broke the surface down into a **homogeneous, aerated bed** ready for rolling.`),
  p(`On ground that had been scrub and young woodland for years, this was the first time the whole three acres had been worked as one consistent surface. The difference, after everything that had come before, was enormous.`),

  h2('Stage Three: Rolling, Seeding and Rolling Again'),
  p(`A freshly rotavated bed is too loose and fluffy to seed straight into, so the paddock was then [rolled](/services/rolling) with a **light roller**.`),
  'IMG:east-meon-fleming-roller-seedbed.jpg',
  p(`The choice of a light roller is deliberate. The aim is to firm the surface enough for the seeder to work accurately and for seed-to-soil contact, **without causing excessive compaction** in ground that has only just been opened up. Compaction is one of the main reasons paddocks struggle, and there is no sense in building it into a brand-new one.`),
  p(`We then [seeded](/services/overseeding) the area using a **dimple seeder at 2.5 g/m²**. The dimple seeder presses a pattern of small indentations into the firmed surface and drops the seed into them, which gives each seed a sheltered spot with good soil contact.`),
  p(`Finally the whole area was **rolled a second time** to properly bed the seed in. That second pass closes the dimples over the seed, keeps moisture around it and makes it far harder for birds and weather to shift it.`),

  h2('The Job Is Not Finished When the Seed Goes In'),
  p(`If there is one thing to take from a project like this, it is this: **the land must be monitored for weed growth** once it has been seeded.`),
  p(`A newly seeded paddock is bare ground with nothing competing on it. Until the grass has established, **weeds will proliferate** given the slightest chance, and a bed that was perfectly clean after spraying and cultivating can fill with unwanted growth before the sward has closed over.`),
  p(`Keeping an eye on it in the weeks after seeding, and dealing with any weeds early, is what turns a good seedbed into a good paddock.`),

  h2('From Woodland Back to Paddocks'),
  p(`Looking back across the three parts of this project so far, the site has gone from [heavily overgrown ground with more than 300 self-seeded trees](${PART_1}), through [excavating hundreds of stumps and roots](${PART_2}), to a sprayed, rotavated, rolled and seeded surface that is ready to grow grass.`),
  p(`The next part is mostly down to the weather and the seed. We will be back to check on establishment and deal with anything that comes up in the meantime.`),
  p(`If you have **cleared land, a damaged paddock or ground that needs a full renovation** rather than a patch-up, the process is the same: deal with what is already growing, cultivate properly, roll, seed and roll again, and then watch it. We [carry out paddock renovation](/services/rotavating) like this across Hampshire and the surrounding counties.`),
];

const POST_DATA = {
  title: 'East Meon Paddock Project Part 3: Spraying, Rotavating and Seeding the New Paddocks',
  slug: SLUG,
  _status: 'published',
  category: 'case-study',
  tags: [{ tag: 'ground-care' }, { tag: 'clearance' }, { tag: 'equipment' }],
  primaryTag: 'ground-care',
  excerpt:
    'With the trees and stumps gone, the East Meon paddocks were sprayed off with glyphosate, left two weeks, rotavated level, rolled, seeded with a dimple seeder at 2.5 g/m² and rolled again. Part 3 of the series, and why the job is not finished when the seed goes in.',
  seo: {
    metaTitle: 'Spraying, Rotavating and Seeding a Cleared Paddock',
    metaDescription:
      'Part 3 of the East Meon paddock project: glyphosate spray-off, a two-week wait, rotavating, light rolling and dimple seeding at 2.5 g/m² to turn cleared ground into new horse paddocks.',
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

  const children = [];
  let missingImages = 0;
  for (const node of BODY) {
    if (typeof node === 'string' && node.startsWith('IMG:')) {
      const id = mediaIds.get(node.slice(4));
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

  const words = children
    .flatMap((c) => c.children ?? [])
    .flatMap((c) => (c.type === 'link' ? c.children : [c]))
    .map((t) => t.text ?? '')
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;

  if (!existing.docs[0]) {
    console.log(`  [create] post /notes/${SLUG}`);
    console.log(`           "${POST_DATA.title}"`);
    console.log(`           category=${POST_DATA.category} tags=[ground-care,clearance,equipment] primaryTag=ground-care`);
    console.log(`           hero=${heroId ?? '(pending — needs --execute)'} · ${children.filter((c) => c.type === 'upload').length} in-body photos · ~${words} words`);
    console.log(`           links → /services/spraying, weed-control, rotavating ×2, rolling, overseeding; parts 1 & 2 ×2 each`);
    if (EXECUTE) {
      const created = await payload.create({ collection: 'posts', data });
      console.log(`  ✓ created post id ${created.id}`);
    }
    changes++;
  } else {
    const post = existing.docs[0];
    console.log(`  [update] post /notes/${SLUG} (id ${post.id}) — rewriting body/tags/hero in place (~${words} words)`);
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

// ---- 3. link Part 2's "Next:" line to this post ------------------------------
console.log();
{
  const res = await payload.find({
    collection: 'posts',
    where: { slug: { equals: PART_2_SLUG } },
    limit: 1,
    depth: 0,
  });
  const part2 = res.docs[0];
  if (!part2) {
    console.log(`  [skip] Part 2 /notes/${PART_2_SLUG} not found — nothing to link`);
  } else {
    const blocks = Array.isArray(part2.content) ? JSON.parse(JSON.stringify(part2.content)) : [];
    let touched = false;
    let already = false;
    for (const block of blocks) {
      if (block?.blockType !== 'richText') continue;
      const kids = block.content?.root?.children ?? [];
      for (const node of kids) {
        if (node?.type !== 'paragraph') continue;
        const flat = (node.children ?? []).map((c) => (c.type === 'link' ? c.children.map((t) => t.text).join('') : c.text ?? '')).join('');
        if (!/^\s*Next:/i.test(flat)) continue;
        if ((node.children ?? []).some((c) => c.type === 'link' && c.fields?.url === `/notes/${SLUG}`)) {
          already = true;
          continue;
        }
        const m = flat.match(/^(\s*Next:\s*)([\s\S]+)$/i);
        const label = (m?.[2] ?? flat).trim();
        node.children = [textNode(m?.[1] ?? 'Next: '), linkNode(`/notes/${SLUG}`, [textNode(label)])];
        touched = true;
        console.log(`  [link] Part 2 (id ${part2.id}) "Next:" line → /notes/${SLUG}`);
        console.log(`         "${label}"`);
      }
    }
    if (already) console.log(`  [ok] Part 2 already links to /notes/${SLUG}`);
    else if (!touched) console.log(`  [skip] Part 2 has no "Next:" paragraph to link`);
    if (touched) {
      if (EXECUTE) {
        await payload.update({
          collection: 'posts',
          id: part2.id,
          data: { content: blocks.map(({ id, ...rest }) => rest) },
        });
        console.log(`  ✓ updated post id ${part2.id}`);
      }
      changes++;
    }
  }
}

console.log();
console.log(`done: ${changes} change${changes === 1 ? '' : 's'}${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
