#!/usr/bin/env node
/**
 * scripts/fix-rotavating-internal-links.mjs
 *
 * Regression fix for the on_page_tweak applied to posts.id 7
 * (effective-field-rotavating-for-soil-health) earlier today.
 *
 * The agent's draftContent specified internal-link slugs without
 * collection prefixes. When the appended block went live, the two
 * inline links pointed at:
 *   /soil-aeration  → 404 (no public route for the pages collection)
 *   /harrowing      → 404 (services live under /services/SLUG)
 *
 * Correct destinations:
 *   /soil-aeration  → /notes/overcome-poor-soil-aeration-for-thriving-land
 *                     (existing blog post on the same topic)
 *   /harrowing      → /services/harrowing (the actual service page)
 *
 * Idempotent: skips any link that's already pointing at the corrected URL.
 *
 *   DATABASE_URL=$DATABASE_URL_PROD npx tsx scripts/fix-rotavating-internal-links.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const POST_ID = 7;

const URL_FIXES = new Map([
  ['/soil-aeration', '/notes/overcome-poor-soil-aeration-for-thriving-land'],
  ['/harrowing', '/services/harrowing'],
]);

function patchLinks(node, stats) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((c) => patchLinks(c, stats));

  if (node.type === 'link' && node.fields?.url) {
    const target = URL_FIXES.get(node.fields.url);
    if (target) {
      stats.fixed.push({ from: node.fields.url, to: target });
      return { ...node, fields: { ...node.fields, url: target } };
    }
  }

  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = patchLinks(v, stats);
  return out;
}

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] patching link URLs in posts/7' : '[dry-run] use --execute to write');

const post = await payload.findByID({ collection: 'posts', id: POST_ID, depth: 0 });
console.log(`Target: posts/${post.slug} (${(post.content ?? []).length} blocks)`);

const stats = { fixed: [] };
const newContent = (post.content ?? []).map((block) => {
  if (block.blockType !== 'richText' || !block.content?.root) return block;
  return { ...block, content: patchLinks(block.content, stats) };
});

if (stats.fixed.length === 0) {
  console.log('\n[unchanged] no broken links found — already fixed or not present');
  process.exit(0);
}

console.log(`\n[fix] ${stats.fixed.length} link(s) to patch:`);
for (const f of stats.fixed) console.log(`  ${f.from}  →  ${f.to}`);

if (!EXECUTE) {
  console.log('\n(dry-run — pass --execute to write)');
  process.exit(0);
}

await payload.update({
  collection: 'posts',
  id: POST_ID,
  data: { content: newContent },
});
console.log('\n  ✓ post updated');
process.exit(0);
