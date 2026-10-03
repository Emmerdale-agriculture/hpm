#!/usr/bin/env node
/**
 * scripts/publish-paddock-management-post-2026-W40.mjs
 *
 * Publishes post 63 "Paddock Management in Hampshire: What It Actually
 * Involves" — a draft the SEO agent created on 2026-07-01 and nobody ever
 * published. Tom's call on 2026-10-03: publish it.
 *
 * It cannot simply be flipped to published: the agent stored raw MARKDOWN
 * inside Lexical paragraph nodes ("## heading", "- bullet", "[a](/url)"),
 * which would render literally. So this script carries the body as
 * markdown (with two fixes: the duplicate "# Title" line dropped and the
 * dead "/blog/when-to-harrow-paddocks" link pointed at the real note) and
 * builds proper Lexical nodes — h2/h3, bullet lists, links, bold.
 *
 * CAVEAT — this reverses a July decision. The W29 consolidation
 * (apply-seo-consolidation-2026-W29.mjs, phase 3, run on prod 2026-07-16)
 * treated this post as a duplicate of /notes/paddock-management (post 55,
 * "the keeper carries this year's on-page rank-push work"), unpublished it
 * and added redirect #42: /notes/paddock-management-hampshire-what-it-involves
 * → /notes/paddock-management (301, active). Publishing the post with that
 * redirect live would be pointless (middleware 301s before the page renders),
 * so this script also DEACTIVATES that redirect. Both posts then target the
 * "paddock management" head term; the alternative is to fold this body into
 * post 55 instead. Tom chose publish on 2026-10-03 (and may change his mind
 * at run time — nothing happens without --execute).
 *
 * Upsert by slug so it is testable on the mirror (which predates the
 * draft): create there, rewrite-and-publish the existing draft on prod.
 * Tags set explicitly (advice / ground-care / seasonal, primaryTag advice —
 * informational, so no service CTA panel) because autoDerive refills blank
 * tags. publishedAt is set to the run time so it tops /notes and the feed.
 *
 * Discovery (the lesson of every review since August): new URLs get crawled
 * through in-content links from pages Google already visits, so a sentinel
 * paragraph linking to the new post is appended to post 55
 * (/notes/paddock-management, 160 impr) and post 48 (year-round care).
 *
 * Idempotent. Dry-run by default.
 *
 *   Local mirror: node_modules/.bin/tsx --env-file=.env.local scripts/publish-paddock-management-post-2026-W40.mjs
 *   Prod:         DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *                   node_modules/.bin/tsx --env-file=.env.local \
 *                   scripts/publish-paddock-management-post-2026-W40.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const SLUG = 'paddock-management-hampshire-what-it-involves';
const URL = `/notes/${SLUG}`;

// --- lexical helpers ---------------------------------------------------------
const IS_BOLD = 1, IS_ITALIC = 2;
const textNode = (str, format = 0) => ({ mode: 'normal', text: str, type: 'text', style: '', detail: 0, format, version: 1 });
const linkNode = (url, children) => ({
  type: 'link', fields: { url, newTab: false, linkType: 'custom' }, format: '', indent: 0, version: 3, direction: 'ltr', children,
});
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
const p = (md) => ({ type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr', children: rich(md) });
const h = (tag, str) => ({ tag, type: 'heading', format: '', indent: 0, version: 1, direction: 'ltr', children: [textNode(str)] });
const ul = (items) => ({
  type: 'list', tag: 'ul', listType: 'bullet', start: 1, format: '', indent: 0, version: 1, direction: 'ltr',
  children: items.map((md, i) => ({ type: 'listitem', value: i + 1, format: '', indent: 0, version: 1, direction: 'ltr', children: rich(md) })),
});

/** Block-level markdown → lexical: #/##/### headings, "- " bullets, paragraphs. */
function mdToLexical(md) {
  const nodes = [];
  let para = [], list = [];
  const flushP = () => { if (para.length) { nodes.push(p(para.join(' '))); para = []; } };
  const flushL = () => { if (list.length) { nodes.push(ul(list)); list = []; } };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushP(); flushL(); continue; }
    const hm = line.match(/^(#{1,3})\s+(.*)$/);
    if (hm) { flushP(); flushL(); if (hm[1].length > 1) nodes.push(h(`h${hm[1].length}`, hm[2].trim())); continue; } // "# title" dropped — the page h1 is the title
    const lm = line.match(/^-\s+(.*)$/);
    if (lm) { flushP(); list.push(lm[1].trim()); continue; }
    flushL(); para.push(line.trim());
  }
  flushP(); flushL();
  return nodes;
}

// --- the article (agent draft, two fixes marked) -----------------------------
const BODY_MD = `
Paddock management is one of those phrases that gets thrown around a lot, but it means different things to different people. For some it's just keeping the grass down. For others it's a full annual programme of aeration, weed control, reseeding and drainage work. Both are valid — it depends on what the land is being used for and what shape it's in.

This is a plain-English rundown of what paddock management actually covers, the jobs that tend to make the biggest difference, and how we approach it across Hampshire and the neighbouring counties.

## What paddock management really means

At its core, paddock management is keeping grazing land productive, safe and reasonably tidy. That means:

- Grass at a sensible height for the time of year and the animals on it
- Weeds kept under control before they take over
- Soil that isn't so compacted or waterlogged that grass can't grow
- Muck, ruts, molehills and poaching dealt with before they turn into bigger problems
- Fences, hedges and ditches doing their job

Most paddocks don't need everything on that list every year. But nearly every paddock we look at needs at least two or three of them.

## The jobs that make the biggest difference

### Topping and flail mowing

If the grass is getting away from you, or horses are leaving rough patches around the dung areas, topping evens things out and stops seed heads forming on weeds. A [paddock topper](/services/paddock-topping) is quick and cheap for big open fields. A [flail mower](/services/flailing) copes better with longer, tougher growth and leaves a tidier finish. If you don't want the cuttings left on the surface — useful where laminitis is a concern, or where the grass is very long — [flail collecting](/services/flail-collecting) picks it up as it goes.

### Harrowing and rolling

Harrowing pulls out dead thatch, breaks up droppings and lets air and light get to the base of the sward. Rolling pushes stones back down, firms up poached ground and levels off hoofprints after a wet winter. They're often done back-to-back in spring. More on timing in our post on [when to harrow paddocks](/notes/when-to-harrow-paddocks-timing-benefits-and-best-practices). If you need both jobs done, [harrowing](/services/harrowing) and [rolling](/services/rolling) usually pair up naturally.

### Weed control and spraying

Docks, thistles, ragwort, buttercups, nettles — the usual suspects. Once they get established they're hard to shift by mowing alone. Selective spraying knocks them back without killing the grass. We're licensed to spray, and the [weed control](/services/weed-control) and [spraying](/services/spraying) pages cover what we can and can't treat.

### Fertiliser and overseeding

If your grass is thin, patchy or slow to come back after grazing, the soil may be short of nutrients or the sward may just be worn out. [Fertiliser application](/services/fertiliser-application) puts back what grazing takes out. [Overseeding](/services/overseeding) fills in bare patches without the cost and disruption of a full reseed.

### Drainage, compaction and heavier work

Parts of Hampshire sit on clay, other parts on chalk, and both cause different problems. Heavy clay compacts under hooves and holds water; chalk can dry out and thin the sward in summer. Where compaction is the issue, we can look at deeper aeration. Where drainage is genuinely poor, [mole ploughing](/services/mole-ploughing) or [ditch clearance](/services/land-ditch-clearance) may be needed. For paddocks that have gone past the point of tidying up, [rotavating](/services/rotavating) and [stone burying](/services/stone-burying) reset the ground so you can start again with a clean seedbed.

### Hedges and boundaries

Overhanging hedges shade the grass, drop leaves and slowly eat into the usable area of the paddock. Annual [hedge cutting](/services/hedge-cutting) keeps them in check and stops them turning into a much bigger job in three or four years' time.

## A rough seasonal shape

Every paddock is different, but as a general guide:

- **Late winter / early spring:** harrow, roll, look at fertiliser, plan any spraying
- **Spring into summer:** topping as needed, spot-spraying weeds, overseeding thin areas
- **Summer:** keep on top of grass height, watch for poaching around gates and water troughs
- **Autumn:** last cut, overseeding, hedge cutting, drainage work before it gets too wet
- **Winter:** rest the ground where you can, keep an eye on ditches

Nothing here is fixed. A wet spring can push everything back by weeks. A dry summer might mean no topping needed at all.

## How we work

We cover Hampshire and the surrounding counties. Most jobs start with a look at the field — either in person or from photos and a quick chat — so we can work out what's actually needed rather than selling you a package you don't want. Some paddocks need one visit a year. Others need a proper programme spread across the seasons. Both are fine.

We run the machinery ourselves, so if you want to know exactly what a job involves before booking, ask. It's usually easier to explain over a phone call than in an email.

## Getting in touch

If you're not sure where to start, or you've got a paddock that's been let go and you want an honest view on what it needs, [drop us a message](/contact). Happy to take a look and tell you what we'd do — and what can wait. For the horse-owner's side of the same subject, our [paddock management overview](/notes/paddock-management) covers why it matters for the animals as much as the grass.
`;

const POST_DATA = {
  title: 'Paddock Management in Hampshire: What It Actually Involves',
  slug: SLUG,
  _status: 'published',
  category: 'paddock',
  tags: [{ tag: 'advice' }, { tag: 'ground-care' }, { tag: 'seasonal' }],
  primaryTag: 'advice',
  excerpt:
    'What paddock management actually covers in Hampshire — topping, harrowing, rolling, weed control, overseeding, drainage and hedges — the jobs that make the biggest difference, and a rough seasonal shape.',
  seo: {
    metaTitle: 'Paddock Management in Hampshire: What It Actually Involves',
    metaDescription:
      'What paddock management actually covers — topping, harrowing, rolling, spraying, overseeding, drainage and hedges — which jobs matter most, and when in the year to do them.',
  },
};

// --- discovery links ---------------------------------------------------------
const SENTINEL = 'what paddock management actually involves';
const LINK_TARGETS = [
  { id: 55, slug: 'paddock-management', md: `If you want the job-by-job version — what each task does, which ones matter most and a rough seasonal order — read [${SENTINEL}](${URL}).` },
  { id: 48, slug: 'year-round-paddock-care-made-simple', md: `For a fuller breakdown of each of these jobs and how we approach them across Hampshire, see [${SENTINEL}](${URL}).` },
];

const publishGuard = (doc) => (doc?._status === 'published' ? { _status: 'published' } : {});
const richTextBlock = (children) => ({ blockType: 'richText', content: { root: { type: 'root', format: '', indent: 0, version: 1, direction: 'ltr', children } } });

// --- run ---------------------------------------------------------------------
const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] publishing' : '[dry-run] use --execute to write');

const children = mdToLexical(BODY_MD);
const content = [richTextBlock(children)];
const counts = children.reduce((a, n) => { const k = n.type === 'heading' ? n.tag : n.type; a[k] = (a[k] ?? 0) + 1; return a; }, {});
const links = JSON.stringify(children).match(/"url":"[^"]+"/g) ?? [];
console.log(`\nbody: ${JSON.stringify(counts)} · ${links.length} links · ${(BODY_MD.match(/\S+/g) ?? []).length} words`);
if (JSON.stringify(children).includes('](')) throw new Error('unconverted markdown link in body');

const existing = await payload.find({ collection: 'posts', where: { slug: { equals: SLUG } }, limit: 1, depth: 0, draft: false });
const post = existing.docs[0];
const data = { ...POST_DATA, content, publishedAt: new Date().toISOString() };

if (!post) {
  console.log(`[create] ${URL} — "${POST_DATA.title}" (not on this DB: mirror predates the draft)`);
  if (EXECUTE) { const c = await payload.create({ collection: 'posts', data, draft: false }); console.log(`  ✓ created id ${c.id}`); }
} else {
  // Payload normalises stored nodes (adds fields), so compare a structural
  // signature — node type/tag + text + link targets — not the raw JSON.
  const plain = (n) => (n?.type === 'text' ? n.text ?? '' : (n?.children ?? []).map(plain).join(''));
  const sig = (blocks) => (blocks ?? []).flatMap((b) => b.content?.root?.children ?? []).map((n) => `${n.type}:${n.tag ?? ''}:${plain(n)}`).join('|')
    + '#' + (JSON.stringify(blocks ?? []).match(/"url":\s?"[^"]+"/g) ?? []).join(',').replace(/\s/g, '');
  const same = post._status === 'published'
    && sig(post.content) === sig(content)
    && post.primaryTag === POST_DATA.primaryTag
    && JSON.stringify((post.tags ?? []).map((t) => t.tag)) === JSON.stringify(POST_DATA.tags.map((t) => t.tag));
  if (same) console.log(`[unchanged] ${URL} (id ${post.id}) already published with this body`);
  else {
    console.log(`[publish] ${URL} (id ${post.id}) — ${post._status} → published; body rebuilt from markdown (was ${(post.content?.[0]?.content?.root?.children ?? []).length} raw-markdown paragraphs), tags [advice, ground-care, seasonal], primaryTag advice`);
    if (EXECUTE) {
      await payload.update({ collection: 'posts', id: post.id, draft: false, data: { ...data, seo: { ...(post.seo ?? {}), ...POST_DATA.seo } } });
      const check = await payload.findByID({ collection: 'posts', id: post.id, depth: 0, draft: false });
      const ok = check._status === 'published' && check.content?.[0]?.content?.root?.children?.some((n) => n.type === 'heading');
      console.log(ok ? '  ✓ published and re-read' : '  ✗ RE-READ FAILED — inspect this post');
    }
  }
}

console.log('\nRedirect (W29 phase-3 merge):');
{
  const r = await payload.find({ collection: 'redirects', where: { from: { equals: URL } }, limit: 5, depth: 0 });
  for (const red of r.docs) {
    if (!red.active) { console.log(`  [unchanged] redirect #${red.id} ${red.from} → ${red.to} already inactive`); continue; }
    console.log(`  [deactivate] redirect #${red.id} ${red.from} → ${red.to} (${red.statusCode}) — REVERSES the 2026-07-14 duplicate-topic merge`);
    if (EXECUTE) {
      await payload.update({ collection: 'redirects', id: red.id, data: { active: false, notes: `${red.notes ?? ''} Deactivated 2026-10-03: post republished (publish-paddock-management-post-2026-W40.mjs).`.trim() } });
      console.log('    ✓ deactivated');
    }
  }
  if (!r.docs.length) console.log(`  [ok] no redirect from ${URL}`);
}

console.log('\nDiscovery links:');
for (const t of LINK_TARGETS) {
  let doc = null;
  try { doc = await payload.findByID({ collection: 'posts', id: t.id, depth: 0, draft: false }); } catch { doc = null; }
  if (!doc || doc.slug !== t.slug) { console.log(`  [missing] posts/${t.id} (${doc?.slug ?? 'not found'}) — skipping`); continue; }
  if (JSON.stringify(doc.content ?? []).includes(`"url":"${URL}"`)) { console.log(`  [unchanged] posts/${t.id} ${t.slug} already links ${URL}`); continue; }
  console.log(`  [append] posts/${t.id} ${t.slug} → ${URL}`);
  if (EXECUTE) {
    await payload.update({ collection: 'posts', id: doc.id, draft: false, data: { content: [...(doc.content ?? []), richTextBlock([p(t.md)])], ...publishGuard(doc) } });
    console.log('    ✓ written');
  }
}
console.log(`\nDone${EXECUTE ? '' : ' (dry-run)'}`);
process.exit(0);
