#!/usr/bin/env node
/**
 * scripts/apply-paddock-maintenance-onpage.mjs
 *
 * On-page tweak for the "paddock maintenance" query (pos ~8.7, 118 imp,
 * 0% CTR — striking distance). Appends a new RichText block to the
 * paddock-management post (id 55): a "What a paddock maintenance
 * programme includes" section with internal links to the service pages,
 * the annual-herbicide-spray pillar, and a FAQ section. Pure rank/relevance
 * push — meta is already good and is left untouched.
 *
 * Safety:
 *  - Appends a NEW block; existing content is never mutated.
 *  - Idempotent: skips if the marker heading already exists.
 *  - Keeps the post published.
 *  - Payload validates the Lexical on write — a malformed tree throws
 *    rather than persisting.
 *
 * Dry-run by default; pass --execute to write.
 *   Local mirror test:  node_modules/.bin/tsx scripts/apply-paddock-maintenance-onpage.mjs --execute
 *   Prod:  DATABASE_URL=$DATABASE_URL_PROD node_modules/.bin/tsx scripts/apply-paddock-maintenance-onpage.mjs --execute
 */
import { getPayload } from 'payload';
import config from '../src/payload/payload.config.ts';

const EXECUTE = process.argv.includes('--execute');
const POST_ID = 55;
const MARKER = 'What a paddock maintenance programme includes';

// ---- Lexical node helpers (default lexicalEditor feature set) ----
const BOLD = 1;
const t = (text, format = 0) => ({ mode: 'normal', text, type: 'text', style: '', detail: 0, format, version: 1 });
const lnk = (url, label) => ({
  type: 'link', version: 3, fields: { linkType: 'custom', url, newTab: false },
  format: '', indent: 0, direction: 'ltr', children: [t(label)],
});
const p = (...children) => ({
  type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr',
  textStyle: '', textFormat: 0, children,
});
const h = (tag, text) => ({
  type: 'heading', tag, format: '', indent: 0, version: 1, direction: 'ltr', children: [t(text)],
});
const li = (...children) => ({
  type: 'listitem', value: 1, checked: undefined, format: '', indent: 0, version: 1, direction: 'ltr', children,
});
const ul = (items) => ({
  type: 'list', tag: 'ul', listType: 'bullet', start: 1, format: '', indent: 0, version: 1, direction: 'ltr',
  children: items.map((c, i) => ({ ...li(...c), value: i + 1 })),
});

const children = [
  h('h2', MARKER),
  p(t("Proper paddock maintenance isn't one job — it's a seasonal cycle of complementary operations that keep grazing productive, safe and usable year round. A typical programme combines:")),
  ul([
    [t('Topping', BOLD), t(' — '), lnk('/services/paddock-topping', 'paddock topping'),
     t(' cuts back rough, ungrazed growth, docks, thistles and ragwort before they set seed, evening out selective grazing and encouraging fresh, palatable regrowth.')],
    [t('Harrowing', BOLD), t(' — '), lnk('/services/harrowing', 'chain harrowing'),
     t(' tears out dead thatch, breaks up and spreads droppings to disrupt the worm cycle, and lets air and water back into the sward.')],
    [t('Rolling', BOLD), t(' — '), lnk('/services/rolling', 'rolling'),
     t(' firms ground lifted by winter frost or poaching, presses stones down and leaves a level, even surface for grazing and machinery.')],
    [t('Fertiliser', BOLD), t(' — '), lnk('/services/fertiliser-application', 'fertiliser application'),
     t(' replaces the nutrients grazing strips out, keeping grass vigorous instead of thinning and letting weeds move in.')],
    [t('An annual herbicide spray', BOLD), t(' — the backbone of weed management. A yearly '), lnk('/services/spraying', 'herbicide spray'),
     t(', backed by ongoing '), lnk('/services/weed-control', 'weed control'),
     t(', knocks back ragwort, docks, nettles, thistles and buttercups before they take hold and spread.')],
  ]),
  p(
    t('And that last point earns its place, because '),
    t("every weed is a patch of grass you don't have", BOLD),
    t(". A one-acre paddock that's half covered in weeds is, in grazing terms, a half-acre paddock — you're fencing, paying for and managing land that isn't feeding anything. An annual herbicide spray is the single most cost-effective way to claw that grazing back and keep maximum grass coverage across the whole paddock, year after year."),
  ),
  h('h2', 'Paddock maintenance FAQs'),
  h('h3', 'How often should I spray my paddock for weeds?'),
  p(t('An annual herbicide spray is the sensible baseline for most horse paddocks — done once a year, timed to spring or early summer when weeds are actively growing and most vulnerable. Left unsprayed, weeds spread fast and steal ground from the grass; a yearly spray keeps them in check so the whole paddock stays productive. Ragwort and other stubborn weeds may also need spot treatment between sprays.')),
  h('h3', 'How often should a paddock be maintained?'),
  p(t('Little and often beats occasional heavy intervention. Topping and harrowing suit the growing season as grass and weeds get away; rolling is usually a spring job; fertiliser and weed control are timed to need rather than the calendar.')),
  h('h3', 'When is the best time of year for paddock maintenance?'),
  p(t('Spring for rolling, fertilising and harrowing as the ground dries; summer for topping to keep weeds and rough growth in check; autumn for harrowing, repairs and a final top before winter. The key rule is to avoid working wet, soft ground.')),
  h('h3', 'Do you offer ongoing paddock maintenance in Hampshire?'),
  p(t('Yes — across Hampshire and the South of England, we put together a maintenance programme tailored to each paddock, with an annual herbicide spray as standard. '), lnk('/contact', 'Get in touch for a quote'), t('.')),
];

const newBlock = {
  blockType: 'richText',
  content: { root: { type: 'root', format: '', indent: 0, version: 1, direction: 'ltr', children } },
};

const payload = await getPayload({ config });
console.log(EXECUTE ? '[execute] appending on-page section to post 55' : '[dry-run] use --execute to write');

const post = await payload.findByID({ collection: 'posts', id: POST_ID, depth: 0 });
const blocks = Array.isArray(post.content) ? post.content : [];
const already = JSON.stringify(blocks).includes(MARKER);

const linkCount = children.flatMap((n) => n.children ?? []).filter((c) => c?.type === 'link').length
  + children.filter((n) => n.type === 'list').flatMap((l) => l.children).flatMap((li2) => li2.children).filter((c) => c?.type === 'link').length;

console.log(`  post 55 (${post.slug}) _status=${post._status}, existing blocks=${blocks.length}`);
console.log(`  new block: ${children.filter((n) => n.type === 'heading').length} headings, 1 list, ${children.filter((n) => n.type === 'paragraph').length} paragraphs, internal links to 6 service/contact pages`);

if (already) {
  console.log('  [skip] marker section already present — nothing to do');
  process.exit(0);
}

if (EXECUTE) {
  await payload.update({
    collection: 'posts',
    id: POST_ID,
    data: { content: [...blocks, newBlock], _status: 'published' },
  });
  console.log('  [done] block appended, post kept published');
} else {
  console.log('  [dry-run] would append 1 RichText block and keep the post published');
}
process.exit(0);
