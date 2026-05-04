#!/usr/bin/env node
/**
 * scripts/apply-on-page-tweak-2026-W19-rotavating.mjs
 *
 * Applies SEO opportunity #10 from the 2026-W19 agent run:
 * an on_page_tweak for "rotavating soil" targeting posts.id 7
 * (effective-field-rotavating-for-soil-health).
 *
 * Appends a new richText block at the end of the post containing:
 *   - H2 "When to Rotavate Soil (and When Not To)" + 2 paragraphs
 *     (with inline links to /soil-aeration and /harrowing)
 *   - H2 "Common Questions About Rotavating"
 *   - 4 H3+P FAQ pairs
 *
 * Marks seo_opportunities #10 as completed once applied.
 *
 * Idempotent: refuses to append if a heading with the same text
 * already exists anywhere in the post body.
 *
 * Run against prod:
 *   DATABASE_URL=$DATABASE_URL_PROD npx tsx scripts/apply-on-page-tweak-2026-W19-rotavating.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const POST_ID = 7;
const OPPORTUNITY_ID = 10;
const SENTINEL_HEADING = 'When to Rotavate Soil (and When Not To)';

const text = (str, format = 0) => ({
  mode: 'normal',
  text: str,
  type: 'text',
  style: '',
  detail: 0,
  format,
  version: 1,
});

const para = (children) => ({
  type: 'paragraph',
  format: '',
  indent: 0,
  version: 1,
  direction: 'ltr',
  children,
});

const heading = (tag, str) => ({
  tag,
  type: 'heading',
  format: '',
  indent: 0,
  version: 1,
  direction: 'ltr',
  children: [text(str)],
});

const link = (url, anchor) => ({
  type: 'link',
  fields: { url, newTab: false, linkType: 'custom' },
  format: '',
  indent: 0,
  version: 3,
  direction: 'ltr',
  children: [text(anchor)],
});

const NEW_BLOCK_LEXICAL = {
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [
      heading('h2', SENTINEL_HEADING),
      para([
        text(
          'Rotavating soil works best when the ground is moist but not wet — squeeze a handful and it should hold shape without dripping. In Hampshire that usually means late spring or early autumn, once the worst of the winter wet has drained but before the ground bakes hard. Rotavating waterlogged soil smears the structure and leaves a compacted pan just below the tine depth, which causes more problems than it solves. Equally, rotavating bone-dry summer ground tends to produce dust and large clods rather than a workable tilth.',
        ),
      ]),
      para([
        text('Before committing to a rotavator, check whether the issue is surface thatch, compaction, or genuine soil structure breakdown. Light compaction is often better dealt with by '),
        link('/soil-aeration', 'aerating'),
        text(' or '),
        link('/harrowing', 'harrowing'),
        text('; a full rotavation is the right call when you’re reseeding, breaking in rough ground, or burying surface vegetation ahead of a new ley. Going in at the wrong time, or with the wrong tool, will cost you a season.'),
      ]),
      heading('h2', 'Common Questions About Rotavating'),
      heading('h3', 'What is rotavating soil?'),
      para([text('Rotavating uses powered rotating tines to break up the top layer of soil, chopping through roots, surface vegetation and clods to create a fine, workable tilth. It’s typically done to a depth of 100–200mm depending on the machine and ground conditions, and is most often used to prepare ground for reseeding, level rough paddocks, or incorporate organic matter into the soil profile.')]),
      heading('h3', 'How deep should you rotavate soil?'),
      para([text('For paddock and field reseeding, 100–150mm is usually sufficient — deep enough to bury surface vegetation and create a seed bed, but shallow enough to avoid bringing buried stones to the surface. Going deeper than 200mm is rarely useful on grassland and risks damaging soil structure below the working layer.')]),
      heading('h3', 'Will rotavating fix compacted soil?'),
      para([text('Rotavating breaks up compaction in the top few inches but can leave a compacted pan immediately below the tine depth, especially on damp clay. For deeper compaction issues you’re better off aerating, sward-lifting or mole ploughing first, then rotavating only if you genuinely need a fresh tilth on top.')]),
      heading('h3', 'Can you rotavate wet soil?'),
      para([text('No — rotavating wet soil smears the structure, destroys soil aggregates and creates a compacted layer beneath the working depth. Wait until the ground is moist but friable. If you’re squeezing soil into a sticky ribbon, it’s still too wet.')]),
    ],
  },
};

function bodyContainsHeading(blocks, headingText) {
  for (const block of blocks ?? []) {
    if (block.blockType !== 'richText') continue;
    const children = block.content?.root?.children ?? [];
    const flat = JSON.stringify(children);
    if (flat.includes(headingText)) return true;
  }
  return false;
}

const payload = await getPayload({ config });

console.log(EXECUTE ? '[execute] appending richText block + marking completed' : '[dry-run] use --execute to write');

const post = await payload.findByID({ collection: 'posts', id: POST_ID, depth: 0 });
if (!post) {
  console.error(`Post id ${POST_ID} not found`);
  process.exit(1);
}

console.log(`\nTarget: posts/${post.slug} (id=${POST_ID}, _status=${post._status})`);
console.log(`Current content blocks: ${(post.content ?? []).length}`);

if (bodyContainsHeading(post.content, SENTINEL_HEADING)) {
  console.log(`\n[unchanged] heading "${SENTINEL_HEADING}" already present — skipping append`);
} else {
  console.log(`\n[append] new richText block (1 H2 + 2 paragraphs + FAQ H2 + 4 H3+P pairs, 2 inline links)`);

  if (EXECUTE) {
    const newContent = [
      ...(post.content ?? []),
      { blockType: 'richText', content: NEW_BLOCK_LEXICAL },
    ];
    try {
      await payload.update({
        collection: 'posts',
        id: POST_ID,
        data: { content: newContent },
      });
      console.log('  ✓ post updated');
    } catch (err) {
      console.error(`  error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  }
}

if (EXECUTE) {
  try {
    await payload.update({
      collection: 'seo-opportunities',
      id: OPPORTUNITY_ID,
      data: { status: 'completed', decidedAt: new Date().toISOString() },
    });
    console.log(`  ✓ opportunity #${OPPORTUNITY_ID} marked completed`);
  } catch (err) {
    console.error(`  [opp #${OPPORTUNITY_ID}] could not mark completed: ${err instanceof Error ? err.message : err}`);
  }
}

console.log('\nDone');
process.exit(0);
