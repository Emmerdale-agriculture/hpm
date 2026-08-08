#!/usr/bin/env node
/**
 * scripts/apply-carbide-mole-plough-links.mjs
 *
 * Internal links into the new /carbide-mole-plough product page (launched
 * 2026-08-08). The page's only inbound links are the sitewide footer plus
 * one code-route link (paddock-maintenance winter list); a brand-new page
 * needs contextual in-content links from the topically-closest pages:
 *
 *   services/15 mole-ploughing — short "new product" paragraph at the end
 *     of the service body.
 *   posts/58 super-compacted-paddocks… — the compaction pillar note; the
 *     product exists precisely for the ground this post describes.
 *   posts/1 can-you-mole-plough-using-a-compact-tractor… — draft-force
 *     angle: a tip that cuts draft matters most on smaller tractors.
 *
 * Idempotent: each append is skipped if the target's content already
 * links to /carbide-mole-plough.
 *
 *   Local mirror: node_modules/.bin/tsx scripts/apply-carbide-mole-plough-links.mjs
 *   Prod:         DATABASE_URL=$DATABASE_URL_PROD node_modules/.bin/tsx scripts/apply-carbide-mole-plough-links.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const PAGE_URL = '/carbide-mole-plough';

const text = (str, format = 0) => ({
  mode: 'normal', text: str, type: 'text', style: '', detail: 0, format, version: 1,
});
const para = (children) => ({
  type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr', children,
});
const link = (url, anchor) => ({
  type: 'link',
  fields: { url, newTab: false, linkType: 'custom' },
  format: '', indent: 0, version: 3, direction: 'ltr',
  children: [text(anchor)],
});
const richTextBlock = (children) => ({
  blockType: 'richText',
  content: {
    root: { type: 'root', format: '', indent: 0, version: 1, direction: 'ltr', children },
  },
});

const TARGETS = [
  {
    collection: 'services',
    id: 15,
    slug: 'mole-ploughing',
    block: richTextBlock([
      para([
        text('New for 2026: '),
        text("we've developed our own "),
        link(PAGE_URL, 'indexable carbide-tipped mole plough'),
        text(
          ' — a world-first design with a replaceable carbide cutting tip and Hardox wear protection, built for ground too hard and compacted for a conventional steel edge. It’s the implement we run on jobs like these, and it’s available to buy or see demonstrated.',
        ),
      ]),
    ]),
  },
  {
    collection: 'posts',
    id: 58,
    slug: 'super-compacted-paddocks-are-stopping-your-grass-growing-heres-how-to-fix-it',
    block: richTextBlock([
      para([
        text('Update: for ground too hard for conventional kit, we now build an '),
        link(PAGE_URL, 'indexable carbide-tipped mole plough'),
        text(
          ' — a replaceable carbide cutting tip instead of a blunt steel edge, designed specifically for breaking severely compacted ground like the paddocks this post describes.',
        ),
      ]),
    ]),
  },
  {
    collection: 'posts',
    id: 1,
    slug: 'can-you-mole-plough-using-a-compact-tractor-with-grass-tyres',
    block: richTextBlock([
      para([
        text(
          'Update: draft force is the whole battle on a compact tractor, which is why we developed our ',
        ),
        link(PAGE_URL, 'indexable carbide-tipped mole plough'),
        text(
          ' — a carbide cutting tip that concentrates the cutting action at the leading edge, reducing the draft needed to pull the leg through hard ground.',
        ),
      ]),
    ]),
  },
];

const alreadyLinked = (blocks) =>
  JSON.stringify(blocks ?? []).includes(`"url":"${PAGE_URL}"`) ||
  JSON.stringify(blocks ?? []).includes(`"url": "${PAGE_URL}"`);

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] writing internal links' : '[dry-run] pass --execute to write');

for (const t of TARGETS) {
  const doc = await payload.findByID({ collection: t.collection, id: t.id, depth: 0 });
  if (!doc || doc.slug !== t.slug) {
    console.error(`  ✗ ${t.collection}/${t.id} missing or slug mismatch (${doc?.slug}) — skipping`);
    continue;
  }
  if (alreadyLinked(doc.content)) {
    console.log(`  = ${t.collection}/${t.slug} already links to ${PAGE_URL} — skipping`);
    continue;
  }
  console.log(`  + ${t.collection}/${t.slug}: append link paragraph (${(doc.content ?? []).length} → ${(doc.content ?? []).length + 1} blocks)`);
  if (EXECUTE) {
    await payload.update({
      collection: t.collection,
      id: t.id,
      data: { content: [...(doc.content ?? []), t.block] },
    });
    console.log('    ✓ written');
  }
}

console.log('\ndone');
process.exit(0);
