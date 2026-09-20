#!/usr/bin/env node
/**
 * scripts/apply-east-meon-part2-2026-W38.mjs
 *
 * Publishes part 2 of Tom's East Meon paddock creation case study to /notes,
 * and closes the loop from part 1 (post id 60,
 * /notes/clearing-overgrown-paddocks-east-meon) forward to it.
 *
 * Part 1 ended with "we'll return at the end of September for the stumps" and
 * no link out — a dead end on the site's best-performing content type. This
 * post is that return visit, and the last thing it does is append a
 * "part 2 is live" line to part 1 so the two read as a series.
 *
 * What it does:
 *   1. Uploads eight job photos from SOURCE_DIR (default: the unzipped
 *      Untitled_Message.zip in the scratchpad; override with
 *      EAST_MEON_PHOTOS=/some/dir). Unlike the part 1 batch these already
 *      have their rotation baked in (orientation=none on all eight), but we
 *      still run them through `sharp().rotate()` so the script stays correct
 *      if Tom re-exports them from a phone. Idempotent: an existing media doc
 *      with the same target filename is reused, not re-uploaded.
 *   2. Creates the post: category case-study, tags
 *      [clearance, hedges, drainage, equipment], primaryTag clearance (which
 *      drives the land-clearance CTA panel via tag-service-map), hero + seven
 *      in-body photos, and in-body links to the hedge cutting, land & ditch
 *      clearance, wood chipping, rotavating and overseeding service pages.
 *   3. Appends a forward link to part 1's body — guarded so re-running
 *      doesn't add it twice, and written with draft:false + an explicit
 *      _status so an old autosaved draft can't ride along and unpublish the
 *      live post (see scripts/apply-seo-opportunities-2026-W36.mjs and the
 *      post-70 incident).
 *
 * Tom's copy is reproduced verbatim — the inline markdown parser below
 * preserves his **bold** exactly. Only the service links are additions.
 *
 * Idempotent. Dry-run by default; pass --execute to write.
 *
 *   Local mirror:
 *     node_modules/.bin/tsx --env-file=.env.local scripts/apply-east-meon-part2-2026-W38.mjs
 *
 *   Prod (dry-run first, then add --execute):
 *     DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *       node_modules/.bin/tsx --env-file=.env.local \
 *       scripts/apply-east-meon-part2-2026-W38.mjs --execute
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const SOURCE_DIR =
  process.env.EAST_MEON_PHOTOS ??
  '/tmp/claude-1000/-home-tomos-hpm-site/1e0cebca-ae0d-43ce-ac0a-cd9c7f8366d7/scratchpad/eastmeon2';

const SLUG = 'east-meon-paddock-creation-stump-removal';
const PART1_SLUG = 'clearing-overgrown-paddocks-east-meon';

// source filename → { name: target filename, alt, caption }
const PHOTOS = [
  {
    src: 'IMG_6054.jpeg',
    name: 'east-meon-excavator-stacking-tree-stumps.jpg',
    alt: 'An 8-tonne excavator stacking uprooted tree stumps and root systems into a pile on a cleared East Meon paddock',
    caption: 'Three hundred trees, reduced to a pile of stumps and roots ready for removal.',
  },
  {
    src: 'IMG_6016.jpeg',
    name: 'east-meon-john-deere-6155r-hedge-cutter.jpg',
    alt: 'John Deere 6155R tractor fitted with a tractor-mounted hedge cutter beside an overgrown hedge in East Meon',
    caption: 'The John Deere 6155R and tractor-mounted hedge cutter, in to reduce the hedge before the excavator started.',
  },
  {
    src: 'IMG_6014.jpeg',
    name: 'east-meon-hedge-cutter-30ft-dividing-hedge.jpg',
    alt: 'Tractor-mounted hedge cutter reaching into a tall overgrown hedge dividing an East Meon paddock under a dark sky',
    caption: 'Roughly 30 feet tall — a long way beyond a normal hedge-trimming job.',
  },
  {
    src: 'IMG_6015.jpeg',
    name: 'east-meon-dividing-hedge-before-removal.jpg',
    alt: 'Overgrown hedge line dividing an East Meon paddock, with the hedge-cutting tractor working at the far end',
    caption: 'The hedge that divided roughly a third of the field, before the cutter reached it.',
  },
  {
    src: 'IMG_6033.jpeg',
    name: 'east-meon-8-tonne-excavator-on-site.jpg',
    alt: 'Hampshire Paddock Management operator standing beside the 8-tonne excavator brought in for the East Meon stump removal',
    caption: 'The right kit for the job: an 8-tonne excavator for three acres of stumps and roots.',
  },
  {
    src: 'IMG_6019.jpeg',
    name: 'east-meon-excavator-lifting-stumps-and-roots.jpg',
    alt: 'Excavator working across a cleared East Meon paddock strewn with chipped brash and excavated root material',
    caption: 'Working back across the site, digging around each stump before lifting the roots out.',
  },
  {
    src: 'IMG_6020.jpeg',
    name: 'east-meon-stump-holes-filled-and-levelled.jpg',
    alt: 'Stump holes filled and tracked level across an East Meon paddock, with the Meon valley beyond',
    caption: 'Holes filled, ground tracked back down — the starting point for cultivation.',
  },
  {
    src: 'IMG_6074.jpeg',
    name: 'east-meon-upper-boundary-cleared-for-stables.jpg',
    alt: 'Cleared and levelled strip of ground along the upper boundary of an East Meon field, ready for new stables',
    caption: "The upper boundary cleared back to bare ground, ready for the client's new stables.",
  },
];

const HERO = 'east-meon-excavator-stacking-tree-stumps.jpg';

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
 * [anchor](/url). Recurses into each match rather than treating the three
 * forms as flat alternatives, so a link inside **bold** survives instead of
 * being swallowed and printed as raw brackets. `format` is a lexical format
 * bitmask carried down so nesting composes.
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
const li = (md, i) => ({
  type: 'listitem', value: i + 1, checked: undefined,
  format: '', indent: 0, version: 1, direction: 'ltr', children: rich(md),
});
const ul = (items) => ({
  type: 'list', tag: 'ul', listType: 'bullet', start: 1,
  format: '', indent: 0, version: 1, direction: 'ltr',
  children: items.map(li),
});
const img = (mediaId) => ({
  type: 'upload', relationTo: 'media', value: mediaId,
  format: '', version: 3,
});

// --- the article -------------------------------------------------------------
// `IMG:<target filename>` markers are replaced with upload nodes once the
// media ids are known.
const BODY = [
  p('Our East Meon paddock creation and rejuvenation project has moved into its next major phase.'),
  p(`When we [last visited the site](/notes/${PART1_SLUG}), we tackled the initial clearance of what had become heavily overgrown paddocks. The fields were flailed, more than **300 saplings and small trees were cut down**, and the resulting timber and branches were processed through a [wood chipper](/services/wood-chipping).`),
  p('With the bulk of the above-ground vegetation removed, we returned this week with heavier machinery to start dealing with what remained below ground and to reshape several areas of the site ready for its eventual transformation into usable horse paddocks.'),

  h2('The Next Stage of the Project'),
  p('There were several major jobs to complete during this visit.'),
  p("The client wanted a substantial section of hedge removed which partially divided roughly a third of the field. At approximately **30 feet tall**, this was considerably more than a normal [hedge-cutting](/services/hedge-cutting) job."),
  'IMG:east-meon-dividing-hedge-before-removal.jpg',
  p('Drainage also needed to be improved in this section of the field. The plan was to create a ditch along the lower ground to collect surface water and direct it towards a nearby stream.'),
  p("We then needed to uproot the stumps and root systems left behind from the approximately 300 trees removed during our previous visit, fill and level the resulting holes, and clear another large section of hedge along the client's upper boundary."),
  p('This required considerably heavier equipment than the first stage of the project.'),

  h2('Stage 1 – Removing Trees, Stumps and Roots'),
  p('For this stage, we brought an **8-tonne excavator** onto site.'),
  'IMG:east-meon-8-tonne-excavator-on-site.jpg',
  p("Although the trees had already been felled during our previous visit, hundreds of stumps and root systems remained in the ground. Simply cutting trees at ground level wouldn't have been sufficient for this project. The land will eventually be cultivated and turned back into paddocks, so the stumps needed to be physically removed."),
  p('Leaving them in place would not only allow some species to regrow, but would also create serious obstacles when we later begin rotavating and preparing the seedbed.'),
  p('To make the clearance operation more manageable, we also brought in a **tractor-mounted hedge cutter on a John Deere 6155R**.'),
  'IMG:east-meon-john-deere-6155r-hedge-cutter.jpg',
  p('This allowed us to quickly reduce much of the remaining hedge and foliage before the excavator moved in.'),
  'IMG:east-meon-hedge-cutter-30ft-dividing-hedge.jpg',
  p('Once the vegetation had been reduced, the excavator could begin working through the site, digging around each stump before lifting the root systems out of the ground.'),
  p('With around **300 former trees across approximately three acres**, this was a substantial part of the project.'),
  'IMG:east-meon-excavator-lifting-stumps-and-roots.jpg',

  h2('Stage 2 – Filling and Levelling the Ground'),
  p('Removing hundreds of stumps inevitably leaves hundreds of holes.'),
  p('Once the root systems had been excavated, the stumps were moved into piles ready for removal or processing. We could then work back across the field and begin repairing the ground.'),
  p('Each stump hole was filled using the excavated soil and surrounding material before being tracked and levelled.'),
  'IMG:east-meon-stump-holes-filled-and-levelled.jpg',
  p('This stage is particularly important because the next phases of the project will involve cultivating the ground.'),
  p('Trying to [rotavate](/services/rotavating) a field containing large stump holes would make cultivation considerably more difficult and could leave an extremely uneven finished surface.'),
  p("By filling and roughly levelling the holes now, we're creating a much better starting point for the later ground preparation."),

  h2('Stage 3 – Clearing the Upper Boundary'),
  p("Attention then moved to the large hedge along the client's upper boundary."),
  p('The vegetation on the client\'s side of the fence was removed before the excavator dug out the larger roots and remaining material.'),
  p('Once everything had been cleared, the excavator was used to track the area repeatedly, consolidating and smoothing the disturbed ground.'),
  'IMG:east-meon-upper-boundary-cleared-for-stables.jpg',
  p("Unlike the main paddock area, this section isn't being immediately returned to grass."),
  p('The client intends to use this area for **new stables**, so our job was to clear the vegetation, remove the major root systems and leave a substantially flatter and more accessible area ready for the next stage of construction and ground preparation.'),

  h2('Drainage and Ditch Creation'),
  p('Drainage is another important part of bringing this land back into productive use.'),
  p('One section of the field naturally collects water, so part of the project involves [creating a ditch](/services/land-ditch-clearance) along the bottom of this area. This will intercept and collect water before directing it towards the existing drainage route and nearby stream.'),
  p('Addressing drainage before carrying out the final paddock renovation work makes considerably more sense than trying to correct water problems once the land has already been cultivated and reseeded.'),
  p("Good paddock creation isn't simply about putting grass seed into the ground. The underlying problems that affect the land—whether that's drainage, compaction, vegetation or poor ground conditions—need to be addressed first."),

  h2('From Overgrown Ground to Horse Paddocks'),
  p('This project is a good example of just how much work can be involved in reclaiming land that has been allowed to become heavily overgrown.'),
  p('What initially looked like several acres of scrub and young woodland is gradually being opened back up.'),
  p('So far, the project has involved:'),
  ul([
    'Flailing approximately three acres of overgrown vegetation',
    'Felling more than 300 saplings and small trees',
    'Chipping the resulting branches and timber',
    'Cutting back substantial mature hedging',
    'Excavating approximately 300 stumps and root systems',
    'Filling and levelling the resulting holes',
    'Clearing ground along the upper boundary for future stables',
    'Beginning the drainage and ditching work required to improve the wetter areas',
  ]),
  p('But clearance is only the beginning.'),
  p("The objective isn't simply to make the site look tidy. The end goal is to turn the land into **proper, usable horse paddocks**."),

  h2('Coming Next – Creating the Paddocks'),
  p('With the majority of the trees, stumps and unwanted vegetation removed, we can finally start moving towards the part of the project where the land begins to resemble paddocks again.'),
  p('The next chapter will focus on preparing the ground for grass establishment.'),
  p("We'll begin working the soil, correcting the damaged and uneven areas created during clearance, preparing a suitable seedbed and moving towards [reseeding](/services/overseeding) the land."),
  p('After months of cutting, chipping, digging and clearing, this is where the transformation really starts to become visible.'),
  p('**Next: East Meon Paddock Creation & Rejuvenation Project – Part 3: From Cleared Ground to New Paddocks**'),
];

const POST_DATA = {
  title: 'East Meon Paddock Project Part 2: Removing 300 Tree Stumps',
  slug: SLUG,
  _status: 'published',
  category: 'case-study',
  tags: [{ tag: 'clearance' }, { tag: 'hedges' }, { tag: 'drainage' }, { tag: 'equipment' }],
  primaryTag: 'clearance',
  excerpt:
    'Part two of the East Meon paddock creation project: an 8-tonne excavator lifts around 300 tree stumps and root systems out of three acres, the holes are filled and levelled, a 30ft hedge comes out and the drainage ditch begins.',
  seo: {
    metaTitle: 'Removing 300 Tree Stumps from Overgrown Paddocks',
    metaDescription:
      'Part two of our East Meon paddock project — an 8-tonne excavator lifts 300 tree stumps and roots, the ground is filled and levelled, and the ditching begins.',
  },
};

/** Appended to part 1 so the series reads forwards, not just backwards. */
const PART1_FOOTER = `**Update — part 2 is now live: [Removing 300 tree stumps and reshaping the ground](/notes/${SLUG}).** The excavator went in, the stumps and roots came out, and the ditching started.`;

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
    console.log(`           category=${POST_DATA.category} tags=[clearance,hedges,drainage,equipment] primaryTag=clearance`);
    console.log(`           hero=${heroId ?? '(pending — needs --execute)'} · ${children.filter((c) => c.type === 'upload').length} in-body photos`);
    console.log(`           links → part 1, /services/{wood-chipping,hedge-cutting,rotavating,land-ditch-clearance,overseeding}`);
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
        draft: false,
        data: { ...data, _status: 'published', seo: { ...(post.seo ?? {}), ...POST_DATA.seo } },
      });
      console.log(`  ✓ updated post id ${post.id}`);
    }
    changes++;
  }
}

// ---- 3. forward link on part 1 ----------------------------------------------
console.log();
{
  const found = await payload.find({
    collection: 'posts',
    where: { slug: { equals: PART1_SLUG } },
    limit: 1,
    depth: 0,
  });
  const post = found.docs[0];
  if (!post) {
    console.log(`  [skip] part 1 (/notes/${PART1_SLUG}) not found — nothing to link from`);
  } else if (JSON.stringify(post.content ?? []).includes(`/notes/${SLUG}`)) {
    console.log(`  [ok] part 1 already links forward to /notes/${SLUG}`);
  } else {
    // Append to the last richText block rather than adding a new block, so the
    // line inherits the article's own typography instead of starting a
    // separate section.
    const blocks = structuredClone(post.content ?? []);
    const last = [...blocks].reverse().find((b) => b?.blockType === 'richText');
    if (!last?.content?.root?.children) {
      console.log(`  [skip] part 1 has no richText block to append to`);
    } else {
      last.content.root.children.push(p(PART1_FOOTER));
      console.log(`  [update] part 1 (id ${post.id}) — appending forward link to /notes/${SLUG}`);
      if (EXECUTE) {
        await payload.update({
          collection: 'posts',
          id: post.id,
          draft: false,
          // _status re-asserted explicitly: payload.update() merges onto the
          // LATEST version, so a stale autosaved draft would otherwise drag
          // the live post back to draft (post 70, 2026-09-01).
          data: { content: blocks, _status: 'published' },
        });
        console.log(`  ✓ updated part 1`);
      }
      changes++;
    }
  }
}

console.log();
console.log(`done: ${changes} change${changes === 1 ? '' : 's'}${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
