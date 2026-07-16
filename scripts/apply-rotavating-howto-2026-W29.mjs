#!/usr/bin/env node
/**
 * scripts/apply-rotavating-howto-2026-W29.mjs
 *
 * Closes the LAST open seo_opportunities row (#13, "how to rotavate",
 * pos 30, 0% CTR). Post 7 is already the rotavating pillar — definition
 * (W29 meta), when-to/wet-soil FAQ (W19) — but has no procedural
 * content, and "how to rotavate" is a procedural query. Appends a
 * step-by-step H2 section (ordered list — the lexical renderer supports
 * listType 'number') + a closing pointer to /services/rotavating, and
 * marks opp #13 completed.
 *
 * Idempotent: skips the append if the sentinel heading already exists.
 *   Local mirror: node_modules/.bin/tsx scripts/apply-rotavating-howto-2026-W29.mjs
 *   Prod:         DATABASE_URL=$DATABASE_URL_PROD node_modules/.bin/tsx scripts/apply-rotavating-howto-2026-W29.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const POST_ID = 7;
const OPPORTUNITY_ID = 13;
const SENTINEL_HEADING = 'How to Rotavate a Field, Step by Step';

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
const listItem = (children, value) => ({
  type: 'listitem', format: '', indent: 0, version: 1, direction: 'ltr', value, children,
});
const numberedList = (items) => ({
  type: 'list', listType: 'number', tag: 'ol', start: 1,
  format: '', indent: 0, version: 1, direction: 'ltr',
  children: items.map((children, i) => listItem(children, i + 1)),
});

const NEW_BLOCK_LEXICAL = {
  root: {
    type: 'root', format: '', indent: 0, version: 1, direction: 'ltr',
    children: [
      heading('h2', SENTINEL_HEADING),
      para([
        text(
          'If you’ve decided rotavating is the right call — you’re reseeding, levelling rough ground, or burying old vegetation — this is the order I work in on paddocks and fields:',
        ),
      ]),
      numberedList([
        [text('Check the moisture first. ', 1), text('Squeeze a handful of soil: it should hold its shape without dripping or ribboning. Too wet and you’ll smear the structure; bone dry and you’ll get clods and dust.')],
        [text('Clear the surface. ', 1), text('Top or spray off dense vegetation a few weeks ahead, and walk the ground for stones, wire and dumped rubble — a rotavator finds all of it the hard way.')],
        [text('Fix deep compaction before you start. ', 1), text('Rotavating only works the top layer. If water sits after rain or a fork won’t go in, aerate, sward-lift or mole plough first — otherwise you’re putting a fine tilth on top of a pan.')],
        [text('First pass shallow. ', 1), text('Set the tines to around 75–100mm and take the first pass steady. Trying to reach full depth in one hit stalls the machine and tears lumps out instead of making tilth.')],
        [text('Second pass deeper, at an angle. ', 1), text('Cross the first pass at 45–90° and drop to your final depth — 100–150mm is plenty for reseeding. The crossing pass is what turns chopped ground into an even seedbed.')],
        [text('Let it settle, then firm it up. ', 1), text('Give the ground a few days (and ideally a shower of rain), then roll or harrow so the seedbed is firm and level. Seed sown into fluffy, freshly rotavated soil dries out and fails.')],
      ]),
      para([
        text('That’s the process on paper — the judgement calls (is it too wet, is the compaction too deep, is the rubbish in the ground worth burying or burying you) are where jobs go wrong. If you’d rather hand it over, '),
        link('/services/rotavating', 'rotavating is one of my core services'),
        text(' across Hampshire and the surrounding counties.'),
      ]),
    ],
  },
};

function bodyContainsHeading(blocks, headingText) {
  for (const block of blocks ?? []) {
    if (block.blockType !== 'richText') continue;
    if (JSON.stringify(block.content?.root?.children ?? []).includes(headingText)) return true;
  }
  return false;
}

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] appending how-to section' : '[dry-run] use --execute to write');

const post = await payload.findByID({ collection: 'posts', id: POST_ID, depth: 0 });
if (!post || !post.slug?.startsWith('effective-field-rotavating')) {
  console.error(`Post id ${POST_ID} missing or slug mismatch (${post?.slug}) — aborting`);
  process.exit(1);
}
console.log(`\nTarget: posts/${post.slug} (id=${POST_ID}, _status=${post._status})`);

if (bodyContainsHeading(post.content, SENTINEL_HEADING)) {
  console.log(`[unchanged] "${SENTINEL_HEADING}" already present — skipping append`);
} else {
  console.log(`[append] H2 + intro + 6-step ordered list + closing service link`);
  if (EXECUTE) {
    await payload.update({
      collection: 'posts',
      id: POST_ID,
      data: { content: [...(post.content ?? []), { blockType: 'richText', content: NEW_BLOCK_LEXICAL }] },
    });
    console.log('  ✓ post updated');
  }
}

let opp = null;
try {
  opp = await payload.findByID({ collection: 'seo-opportunities', id: OPPORTUNITY_ID, depth: 0 });
} catch {
  opp = null;
}
if (!opp) {
  console.log(`[missing] opportunity #${OPPORTUNITY_ID} — skipping (stale mirror?)`);
} else if (opp.status === 'completed') {
  console.log(`[ok] opp #${OPPORTUNITY_ID} already completed`);
} else {
  console.log(`[status] opp #${OPPORTUNITY_ID} "${opp.query}": ${opp.status} → completed`);
  if (EXECUTE) {
    await payload.update({
      collection: 'seo-opportunities',
      id: OPPORTUNITY_ID,
      data: {
        status: 'completed',
        notes: 'Step-by-step how-to section appended to post 7 (W29) — the query is procedural and the pillar post had no procedural content.',
        decidedAt: new Date().toISOString(),
      },
    });
    console.log('  ✓ marked completed');
  }
}

console.log(`\nDone${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
