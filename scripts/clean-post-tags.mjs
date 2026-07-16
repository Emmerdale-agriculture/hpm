#!/usr/bin/env node
/**
 * scripts/clean-post-tags.mjs
 *
 * Replaces the noisy auto-derived tags on imported Posts with a curated
 * taxonomy. Heuristic: scan each post's title + existing tags + excerpt
 * for keyword matches against TAXONOMY; assign the matched tags. The
 * first match (in the priority order below) becomes primaryTag, which
 * drives the service CTA panel on the post template.
 *
 * Idempotent: posts already tagged from the taxonomy are left alone
 * unless --force is passed.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   node scripts/clean-post-tags.mjs            # dry-run
 *   node scripts/clean-post-tags.mjs --execute  # write
 *   node scripts/clean-post-tags.mjs --execute --force  # rewrite even if already curated
 */

import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const FORCE = process.argv.includes('--force');

// Priority order matters — if a post matches multiple, the first listed
// wins as primaryTag. (Service-mapped tags first; informational tags
// after, since the CTA panel is more valuable to a service-tagged post.)
// Each keyword is matched as a whole word (regex \b boundaries) so
// 'dock' doesn't fire on 'paddock' and 'spray' doesn't fire on 'sprayed'.
// Multi-word keywords match as phrases.
//
// Priority order matters — first match becomes primaryTag, which decides
// the service-CTA panel. Order: most-specific service-mapped tag first,
// generic informational tags last.
const TAXONOMY = [
  { slug: 'drainage',     keywords: ['drainage', 'mole plough', 'subsoil', 'standing water', 'ditch', 'waterlogged', 'pugged', 'paddocks dry', 'swamp', 'swamps'] },
  { slug: 'topping',      keywords: ['topping', 'topper', 'flail mower', 'mowing'] },
  { slug: 'weeds',        keywords: ['weed', 'weeds', 'ragwort', 'docks', 'thistle', 'thistles', 'herbicide', 'herbicides', 'buttercup', 'buttercups', 'spray', 'spraying', 'nozzle', 'nozzles', 'licensed'] },
  { slug: 'hedges',       keywords: ['hedge', 'hedges', 'hedgerow', 'hedge cutter', 'hedge cutting'] },
  { slug: 'ground-care',  keywords: ['harrow', 'harrowing', 'roll', 'rolling', 'overseed', 'overseeding', 'fertiliser', 'fertilizer', 'reseed', 'aeration', 'aerate', 'compaction', 'compacted', 'rotavating', 'rotavate', 'lime', 'plough', 'ploughing', 'wildflower', 'meadow', 'grass', 'soil', 'seeding', 'seeder'] },
  { slug: 'equipment',    keywords: ['john deere', 'kuhn', 'mcconnel', 'tractor', 'flail', 'wessex', 'deleks', 'aercore', 'pa3430', 'verge flail', 'chapman', 'ryetech', 'sweeper', 'hedge cutter', 'stone burier', 'machinery'] },
  { slug: 'seasonal',     keywords: ['winter', 'spring', 'summer', 'autumn', 'year-round', 'year round'] },
  { slug: 'advice',       keywords: ['guide', 'tips', 'how to', 'advice', 'should', 'when to', 'choosing', 'recognise', 'spotting', 'challenges', 'signs'] },
];

function hasKeyword(haystack, kw) {
  // Multi-word phrase: substring match is fine
  if (kw.includes(' ')) return haystack.includes(kw);
  // Single word: enforce word boundaries
  const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return re.test(haystack);
}

const TAXONOMY_SLUGS = new Set(TAXONOMY.map((t) => t.slug));

function matchTagsForPost(post) {
  // Title matches outrank excerpt/legacy-tag matches for primaryTag — an
  // incidental "weed" in the excerpt must not steal the CTA from what the
  // post is actually about.
  const title = (post.title ?? '').toLowerCase();
  const rest = [
    post.excerpt ?? '',
    ...(post.tags ?? []).map((t) => (typeof t === 'object' ? t.tag : t)),
  ]
    .join(' ')
    .toLowerCase();

  const fromTitle = [];
  const fromRest = [];
  for (const t of TAXONOMY) {
    if (t.keywords.some((k) => hasKeyword(title, k))) fromTitle.push(t.slug);
    else if (t.keywords.some((k) => hasKeyword(rest, k))) fromRest.push(t.slug);
  }
  // Title matches first (in taxonomy priority order), then the rest —
  // matched[0] becomes primaryTag.
  return [...fromTitle, ...fromRest];
}

const payload = await getPayload({ config });

console.log(EXECUTE ? '[execute] writing changes' : '[dry-run] no writes (pass --execute)');
console.log(FORCE ? '[force] rewriting posts that look already-curated\n' : '');

const res = await payload.find({ collection: 'posts', limit: 0, depth: 0 });

let updated = 0;
let skipped = 0;

for (const post of res.docs) {
  const slug = post.slug ?? `id-${post.id}`;

  // Commentary posts are quarantined off-topic content — they must not
  // surface in the paddock tag hubs, so strip any curated tags they have.
  if (post.category === 'commentary') {
    const hasTags = (post.tags ?? []).length > 0 || post.primaryTag;
    if (!hasTags) {
      skipped++;
      continue;
    }
    console.log(`✕ [${post.id}] ${slug.slice(0, 40).padEnd(40)} commentary — clearing tags`);
    if (EXECUTE) {
      await payload.update({
        collection: 'posts',
        id: post.id,
        data: { tags: [], primaryTag: null },
      });
    }
    updated++;
    continue;
  }

  const existing = (post.tags ?? []).map((t) => (typeof t === 'object' ? t.tag : t));
  const alreadyCurated =
    existing.length > 0 && existing.every((t) => TAXONOMY_SLUGS.has(t));

  if (alreadyCurated && !FORCE) {
    console.log(`= [${post.id}] ${slug.slice(0, 40).padEnd(40)} already curated [${existing.join(',')}]`);
    skipped++;
    continue;
  }

  const matched = matchTagsForPost(post);
  const primary = matched[0] ?? null;

  if (matched.length === 0) {
    // Don't wipe a post's existing tags just because the heuristic
    // didn't recognise any. Leave it alone for Tom to tag manually.
    console.log(`? [${post.id}] ${slug.slice(0, 40).padEnd(40)} no taxonomy match — leaving tags untouched`);
    skipped++;
    continue;
  }

  console.log(`→ [${post.id}] ${slug.slice(0, 40).padEnd(40)} [${matched.join(',')}] primary=${primary}`);

  if (EXECUTE) {
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: {
        tags: matched.map((tag) => ({ tag })),
        primaryTag: primary,
      },
    });
  }
  updated++;
}

console.log(
  `\nDone — ${updated} ${EXECUTE ? 'updated' : 'would update'}, ${skipped} unchanged`,
);
