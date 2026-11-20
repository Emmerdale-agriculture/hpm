#!/usr/bin/env node
/**
 * scripts/apply-horse-walker-part-1-2026-W47.mjs
 *
 * Publishes Part 1 of the horse walker repair series to /notes: a client's
 * walker that slowed down and stopped, diagnosed to a failed hydraulic system
 * (no pressure, badly contaminated oil, internally corroded control valve,
 * scored pump). Ends on "Part 2 to follow", the rebuild.
 *
 *   1. Uploads six photos from SOURCE_DIR with EXIF rotation baked in.
 *      Idempotent: an existing media doc with the same filename is reused.
 *   2. Creates (or rewrites in place) the post: category case-study,
 *      tags [equipment], primaryTag equipment, cabinet shot as hero.
 *
 * Tom's notes are the only source of facts. The copy expands them without
 * adding diagnosis he didn't give. Kit details (30 µF run capacitor,
 * gauge reading zero) come from what the photos show.
 *
 * Idempotent. Dry-run by default; pass --execute to write.
 *
 *   Prod (dry-run first, then add --execute):
 *     DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *       node_modules/.bin/tsx --env-file=.env.local --env-file=.env.vercel \
 *       scripts/apply-horse-walker-part-1-2026-W47.mjs --execute
 *
 * .env.vercel is needed for the S3 (media storage) keys; .env.local alone fails
 * the upload with "a non-empty Access Key (AKID) must be provided".
 *
 * Photos default to ~/photos/horse-walker-part1; override with
 * HORSE_WALKER_PHOTOS=/some/dir.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const SOURCE_DIR = process.env.HORSE_WALKER_PHOTOS ?? path.join(os.homedir(), 'photos/horse-walker-part1');

const SLUG = 'horse-walker-repair-hydraulic-failure-diagnosis';

const PHOTOS = [
  {
    src: 'control cabinet.jpeg',
    name: 'horse-walker-control-cabinet-hydraulic-power-pack.jpg',
    alt: 'Open steel control cabinet of a horse walker showing the hydraulic control valve and lever on the top shelf and the electric motor and oil tank below',
    caption: 'The walker’s control cabinet: hydraulic control valve on the top shelf, electric motor and oil tank underneath.',
  },
  {
    src: 'run capacitor check.jpeg',
    name: 'horse-walker-motor-run-capacitor-check.jpg',
    alt: 'Hand holding a 30 microfarad motor run capacitor in front of the open terminal box of the horse walker electric motor',
    caption: 'First check: the motor and its run capacitor. Both were running to standard.',
  },
  {
    src: 'Hydraulic pressure test.jpeg',
    name: 'horse-walker-hydraulic-pressure-test-gauge-zero.jpg',
    alt: 'Hydraulic pressure gauge fitted to a test point on the horse walker control valve, with the needle reading zero',
    caption: 'A pressure gauge on the new test point. With the motor running, the needle stayed at zero.',
  },
  {
    src: 'contaminated oil.jpeg',
    name: 'horse-walker-contaminated-hydraulic-oil-tank.jpg',
    alt: 'Inside of the horse walker hydraulic tank showing cloudy yellow contaminated oil and sludge-coated pipework and suction strainer',
    caption: 'Inside the tank: badly contaminated oil, with the pipework and strainer coated in sludge.',
  },
  {
    src: 'corroded spool valve.jpeg',
    name: 'horse-walker-corroded-control-valve-spool.jpg',
    alt: 'Hand holding the spool removed from the horse walker hydraulic control valve, showing heavy internal corrosion and pitting',
    caption: 'The spool from the control valve, badly corroded internally.',
  },
  {
    src: 'scored pump.jpeg',
    name: 'horse-walker-scored-hydraulic-gear-pump-body.jpg',
    alt: 'Close-up of the opened horse walker hydraulic gear pump body showing scoring in the gear bores',
    caption: 'The pump body opened up: bad scoring, with metal being ground off the inside.',
  },
];

const HERO = 'horse-walker-control-cabinet-hydraulic-power-pack.jpg';

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
const BODY = [
  p(`One of our clients asked us to have a look at their horse walker, which had suddenly stopped working. Except it had not really been sudden. By their account it had been **getting slower and slower over time until, one day, it just stopped**.`),
  p(`That gradual slowdown is a useful clue. A walker that dies instantly usually points to an electrical fault. One that fades away over weeks or months is telling you something is wearing out. So we went through it step by step, starting with the simplest checks.`),
  'IMG:horse-walker-control-cabinet-hydraulic-power-pack.jpg',
  p(`This walker is hydraulically driven. An electric motor in the bottom of the cabinet drives a hydraulic pump, which draws oil from the tank underneath. The pump feeds a control valve on the top shelf, and that sends oil out to drive the walker round.`),

  h2('Step One: Check the Motor and Capacitor'),
  p(`The first step was to rule out the electrical side. We checked the **motor and its run capacitor**, and both were running to standard.`),
  'IMG:horse-walker-motor-run-capacitor-check.jpg',
  p(`It is worth doing this first because it is quick, and a tired capacitor can make a single-phase motor sluggish. Here, though, the motor was doing its job. Whatever was wrong was further down the line.`),

  h2('Step Two: Add Hydraulic Test Points'),
  p(`Next we **added hydraulic test points** to the system so we could see what was actually going on inside it, rather than guessing.`),
  p(`The first test point told us most of what we needed to know: **there was no pressure in the system at all**.`),
  'IMG:horse-walker-hydraulic-pressure-test-gauge-zero.jpg',
  p(`With the motor turning and the pump being driven, the gauge did not move off zero. Something between the tank and the valve had failed.`),

  h2('Step Three: Open Up the Tank'),
  p(`So we opened up the hydraulic tank. **The oil was very badly contaminated.**`),
  'IMG:horse-walker-contaminated-hydraulic-oil-tank.jpg',
  p(`Hydraulic oil should be clear. What we found was cloudy and full of sludge, with the pipework and strainer inside the tank coated in it. Every part of the system had been running on that oil, so the next job was to look at the parts it had been running through.`),

  h2('Step Four: The Control Valve and the Pump'),
  p(`On inspection, the **control valve was badly corroded internally**.`),
  'IMG:horse-walker-corroded-control-valve-spool.jpg',
  p(`Then we took the pump apart. There was **bad scoring inside, and pieces of metal were being ground off the pump body**.`),
  'IMG:horse-walker-scored-hydraulic-gear-pump-body.jpg',
  p(`A gear pump builds pressure by keeping very tight clearances between the gears and the body. Once that body is being scored and worn away, the oil just slips back past the gears instead of being pushed out into the system. As the wear gets worse, there is less and less pressure, and the walker turns slower and slower. Eventually there is nothing left.`),
  p(`So it was no surprise there was no pressure in the system. It also explained the gradual slowdown the client had noticed.`),

  h2('The Decision: Rebuild the Hydraulics'),
  p(`We showed the client everything we had found: the contaminated oil, the corroded valve and the scored pump. With all of that in front of them, they **chose to rebuild the hydraulic side of the system**.`),
  p(`When the oil is this contaminated and the pump has been shedding metal, swapping one part on its own does not make sense. Everything else in the circuit has been running on the same dirty oil.`),
  p(`If your horse walker is slowing down, do not wait for it to stop. The earlier it gets looked at, the more of it can usually be saved. [Get in touch](/contact) and we will come and take a look.`),

  h2('Part 2 to Follow'),
  p(`Next: rebuilding the hydraulic system and getting the walker turning again.`),
];

const POST_DATA = {
  title: 'Horse Walker Repair Part 1: Why It Slowed Down and Stopped',
  slug: SLUG,
  _status: 'published',
  category: 'case-study',
  tags: [{ tag: 'equipment' }],
  primaryTag: 'equipment',
  excerpt:
    'A client’s horse walker got slower and slower until it stopped. We checked the motor and capacitor, added hydraulic test points, and found no pressure, badly contaminated oil, a corroded control valve and a scored pump. Part 1 of the repair.',
  seo: {
    metaTitle: 'Horse Walker Stopped Working? A Hydraulic Diagnosis',
    metaDescription:
      'A horse walker that slowed down and stopped: motor and capacitor checks, hydraulic pressure testing, contaminated oil, a corroded control valve and a scored pump. Part 1 of the repair.',
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
    console.log(`            Set HORSE_WALKER_PHOTOS to the folder holding the originals.`);
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
    console.log(`           category=${POST_DATA.category} tags=[equipment] primaryTag=equipment`);
    console.log(`           hero=${heroId ?? '(pending — needs --execute)'} · ${children.filter((c) => c.type === 'upload').length} in-body photos · ~${words} words`);
    console.log(`           links → /contact`);
    if (EXECUTE) {
      const created = await payload.create({ collection: 'posts', data, draft: false });
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
        draft: false,
        data: { ...data, _status: 'published', seo: { ...(post.seo ?? {}), ...POST_DATA.seo } },
      });
      console.log(`  ✓ updated post id ${post.id}`);
    }
    changes++;
  }
}

console.log();
console.log(`done: ${changes} change${changes === 1 ? '' : 's'}${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
