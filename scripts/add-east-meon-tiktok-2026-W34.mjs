#!/usr/bin/env node
/**
 * scripts/add-east-meon-tiktok-2026-W34.mjs
 *
 * Appends Tom's chipper TikTok to the bottom of the East Meon case study.
 *
 *   https://www.tiktok.com/@emmerdale.agricul/video/7675461014774680865
 *   "Turns out you can shred a whole tree in one go"
 *
 * Adds a `video` content block after the existing richText block, so the
 * embed lands below the article body and above the service CTA / related
 * notes. Needs the code side deployed: TikTok was not previously a valid
 * `provider` on the video block (only youtube / vimeo / self), and
 * ContentBlocks had no branch to render it — the component existed but was
 * hardcoded into /carbide-mole-plough. Run this AFTER the deploy is READY,
 * otherwise the block renders as nothing.
 *
 * Idempotent — checks for an existing video block with this URL.
 *
 *   Local mirror:
 *     node_modules/.bin/tsx --env-file=.env.local scripts/add-east-meon-tiktok-2026-W34.mjs
 *
 *   Prod (dry-run first, then add --execute):
 *     DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *       node_modules/.bin/tsx --env-file=.env.local \
 *       scripts/add-east-meon-tiktok-2026-W34.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');

const SLUG = 'clearing-overgrown-paddocks-east-meon';
const VIDEO_URL = 'https://www.tiktok.com/@emmerdale.agricul/video/7675461014774680865';
// Caption doubles as the embed's pre-load fallback text and the <figcaption>.
const CAPTION = 'Turns out you can shred a whole tree in one go — the Timberwolf TW 280FTR at work in East Meon.';

const VIDEO_BLOCK = {
  blockType: 'video',
  provider: 'tiktok',
  url: VIDEO_URL,
  caption: CAPTION,
};

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] applying' : '[dry-run] use --execute to write');
console.log();

const res = await payload.find({
  collection: 'posts',
  where: { slug: { equals: SLUG } },
  limit: 1,
  depth: 0,
});
const post = res.docs[0];

if (!post) {
  console.log(`  [ABORT] post /notes/${SLUG} not found — run apply-east-meon-note-2026-W34.mjs first.`);
  process.exit(0);
}

const blocks = Array.isArray(post.content) ? JSON.parse(JSON.stringify(post.content)) : [];
const already = blocks.some((b) => b?.blockType === 'video' && b?.url === VIDEO_URL);

if (already) {
  console.log(`  [ok] post /notes/${SLUG} (id ${post.id}) already has this video`);
  console.log();
  console.log('done: 0 changes (dry-run)'.replace('(dry-run)', EXECUTE ? '' : '(dry-run)'));
  process.exit(0);
}

console.log(`  [video] post /notes/${SLUG} (id ${post.id})`);
console.log(`          appending video block after ${blocks.length} existing block(s)`);
console.log(`          provider=tiktok  ${VIDEO_URL}`);
console.log(`          caption: "${CAPTION}"`);

if (EXECUTE) {
  await payload.update({
    collection: 'posts',
    id: post.id,
    // Blocks carry an `id` from Payload; strip it so the update doesn't try to
    // reconcile against rows it no longer recognises, and let Payload reissue.
    data: { content: [...blocks.map(({ id, ...rest }) => rest), VIDEO_BLOCK] },
  });
  console.log(`  ✓ updated post ${post.id}`);
}

console.log();
console.log(`done: 1 change${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
