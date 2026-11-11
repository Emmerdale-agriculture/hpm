#!/usr/bin/env node
/**
 * scripts/apply-seo-review-2026-W46.mjs
 *
 * Applies the 2026-11-11 monthly SEO review and closes the eight pending
 * opportunities from the 2026-11-01 agent run (run_1793516423065).
 *
 * What the review found (28d 2026-10-12 → 11-08 vs YoY 2025-10-13 → 11-09,
 * GSC + URL Inspection on all 102 sitemap URLs + live crawl + prod DB):
 *
 *  - Seven of the eight opportunities repeat queries already worked:
 *    #60/#62/#63/#64 (harrowing variants) all land on post 29, which has
 *    carried the "How to Harrow a Field" section and its FAQs since W40;
 *    #61 "mole plough pipe laying" is the 5th raise (post 19 is titled for
 *    it and has the step-by-step guide); #59 "paddock management" and
 *    #65 "paddock maintenance" are the 5th and 8th raises against the
 *    homepage. Root cause was in the agent (fixed in the same commit:
 *    findActivePriorOpportunity now applies a 120-day cooldown across
 *    types), so this is the last month these need closing by hand.
 *
 *  - #66 "paddock topping" is real. /services/paddock-topping ranks ~10
 *    for its head term on two legacy WordPress paragraphs and has nothing
 *    on timing. The agent's draft is used, corrected: its FAQ claimed
 *    topping uses "a rotary mower" as opposed to flailing, but this page
 *    says HPM tops WITH a flail mower; and "we usually top at 7–10cm" was
 *    a first-person claim nothing on the site supports — both dropped.
 *    Timing and frequency follow the service's own metaHighlights
 *    ("May / August", "1–2 × season"). Also links /services/flailing and
 *    /services/finish-mowing,
 *    which Google has never crawled, from a page it does crawl.
 *
 *  - "paddock maintenance" cannibalisation: in the prior 28 days the
 *    homepage was the only page ranking for it (90 impr, pos 5.5; post 55
 *    had 7 at pos 22). This window Google split it — post 55 73 impr at
 *    pos 9.5, homepage 59 at 6.5. Post 55's meta ("Hampshire Paddock
 *    Maintenance for Horse Owners" / "Tailored maintenance programmes…")
 *    pitches as a service page against the homepage, but its body is an
 *    owner's how-to guide (grazing rotation, soil pH, drainage, weeds).
 *    Retitled to say what it is, aimed at "horse paddock maintenance".
 *
 * Writes: services/paddock-topping body (sentinel-guarded append), post 55
 * seo meta, opportunity rows #59–#66 (status + decidedAt + notes).
 * Idempotent; dry-run by default.
 *
 *   Local mirror: node_modules/.bin/tsx --env-file=.env.local scripts/apply-seo-review-2026-W46.mjs
 *   Prod:         DATABASE_URL="$(grep -m1 '^DATABASE_URL_PROD=' .env.local | cut -d= -f2- | tr -d '"')" \
 *                   node_modules/.bin/tsx --env-file=.env.local \
 *                   scripts/apply-seo-review-2026-W46.mjs --execute
 *
 * Verify live (pages are ISR'd for up to an hour after the run):
 *   /services/paddock-topping contains "When to Top Your Paddock"
 *   /notes/paddock-management <title> is "Horse Paddock Maintenance: A Practical Guide for Owners"
 *   select status,count(*) from seo_opportunities → 0 pending
 */

const EXECUTE = process.argv.includes('--execute');

// ------------------------------------------------------------ node helpers
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

// ----------------------------------------------------- 1. topping section
const TOPPING_SLUG = 'paddock-topping';
const TOPPING_SENTINEL = 'When to Top Your Paddock (and When Not To)';
const TOPPING_NODES = [
  heading('h2', TOPPING_SENTINEL),
  para([text('Topping works best when the grass has got away from the horses and weeds such as docks, thistles and buttercups are flowering but haven’t yet set seed. Cutting at that stage stops the seed spreading, knocks the weeds back and encourages the grass to tiller and thicken. For most Hampshire paddocks that means a first cut in May and a second in August, depending on grazing pressure and how the season has gone.')]),
  para([text('Avoid topping in a drought: cutting stressed grass exposes the crown and sets regrowth back by weeks. Equally, don’t top when the ground is soft enough to rut — the tyres do more harm than the cut does good. And if a paddock is more weed than grass, or overrun with ragwort, topping alone won’t fix it; it needs '), link('/services/weed-control', 'targeted weed control'), text(' or a full renovation instead.')]),
  heading('h2', 'Paddock Topping FAQs'),
  heading('h3', 'How often should a horse paddock be topped?'),
  para([text('Once or twice a season for most paddocks — in May, and again in August if the grass and weeds have come back. Heavily grazed or weedy paddocks sometimes need a third pass; lightly used ones may only need one.')]),
  heading('h3', 'What do you top with?'),
  para([text('Mostly a flail topper, which chops the cuttings into small pieces that break down quickly back into the sward rather than lying in swathes. Where a neater, lawn-like finish matters there’s a rotary finishing mower — see '), link('/services/finish-mowing', 'finish mowing'), text(' — and for tougher, overgrown growth like brambles and nettles, '), link('/services/flailing', 'flailing'), text('.')]),
  heading('h3', 'Will topping get rid of docks, thistles and buttercups?'),
  para([text('It weakens them and stops them setting seed, but it won’t kill established plants with deep roots. For long-term control, combine topping with '), link('/services/weed-control', 'spraying'), text(' — and '), link('/services/harrowing', 'harrowing'), text(' afterwards to open up the sward so the grass can fill the gaps.')]),
];

// ---------------------------------------------------- 2. post 55 retarget
const PM_SLUG = 'paddock-management';
const PM_META = {
  metaTitle: 'Horse Paddock Maintenance: A Practical Guide for Owners',
  metaDescription: 'Grazing rotation, soil pH and fertiliser, drainage, topping, overseeding and weed control: how to keep a horse paddock productive all year round.',
};

// ------------------------------------------------- 3. opportunity closure
const RUN = 'run_1793516423065';
const CLOSE = [
  [59, 'superseded', 'W46 review: 5th raise of this query against the homepage (W19 rejected, W27, W31, W40). Homepage meta already targets the money term "paddock maintenance". Agent repeat-raise fixed in this commit (120-day cooldown).'],
  [60, 'superseded', 'W46 review: lands on post 29, which has carried "How to Harrow a Field: Passes, Direction and Ground Conditions" + FAQs (how often, wet ground, rolling after) since W40 (#52). Draft duplicates it.'],
  [61, 'superseded', 'W46 review: 5th raise. Post 19 is titled "Mole Ploughing & Pipe Laying for Waterlogged Fields" with a step-by-step guide (hierarchy fixed W40); query is seasonal (Nov–Apr) and at pos 8.7 rising. No draft.'],
  [62, 'superseded', 'W46 review: 4th raise; same page and same content as #60 — covered by post 29\'s W40 how-to section.'],
  [63, 'superseded', 'W46 review: 2nd raise; post 29, covered by the W40 how-to section. No draft.'],
  [64, 'superseded', 'W46 review: 5th raise; post 29 already has "How Paddock Harrowing Works" + the W40 how-to + FAQ.'],
  [65, 'superseded', 'W46 review: 8th raise. Real issue found instead: post 55 started competing with the homepage for this query (73 impr pos 9.5 vs homepage 59 pos 6.5; prior 28d homepage held it alone). Fixed by retargeting post 55\'s meta to "horse paddock maintenance".'],
  [66, 'completed', 'W46 review: section added to /services/paddock-topping using the agent draft, corrected — dropped the "rotary mower vs flail" FAQ (HPM tops with a flail mower) and the unsupported "we top at 7–10cm" claim; timing follows metaHighlights (May / August, 1–2 × season). Links weed-control, flailing, finish-mowing, harrowing; the equipment FAQ follows the page’s own equipment list.'],
];

// ------------------------------------------------------------------- main
// GOTCHA (post 70, 2026-09-01): payload.update() merges onto the LATEST
// version; a newer draft silently unpublishes the page. Always draft:false
// and re-assert _status for docs that were published when read.
const publishGuard = (doc) => (doc?._status === 'published' ? { _status: 'published' } : {});
const bodyHas = (blocks, needle) => JSON.stringify(blocks ?? []).includes(needle);

async function main() {
  const { getPayload } = await import('payload');
  const { default: config } = await import('../src/payload/payload.config.ts');
  const payload = await getPayload({ config });
  console.log(EXECUTE ? '[execute] W46 review fixes' : '[dry-run] use --execute to write');

  const one = async (collection, slug) => {
    const { docs } = await payload.find({ collection, where: { slug: { equals: slug } }, limit: 1, depth: 0, draft: false });
    return docs[0] ?? null;
  };
  const write = async (collection, doc, data, verify) => {
    if (!EXECUTE) return;
    await payload.update({ collection, id: doc.id, draft: false, data: { ...data, ...publishGuard(doc) } });
    const check = await payload.findByID({ collection, id: doc.id, depth: 0, draft: false });
    const ok = check._status === doc._status && verify(check);
    console.log(ok ? '      ✓ written and re-read' : '      ✗ RE-READ FAILED — inspect this doc');
  };
  let changes = 0;

  console.log('\n1. /services/paddock-topping timing section + FAQ:');
  const svc = await one('services', TOPPING_SLUG);
  if (!svc) console.log('  [missing] services/paddock-topping — skipping');
  else if (svc._status !== 'published') console.error(`  ✗ services/${svc.id} is ${svc._status} — skipping`);
  else if (bodyHas(svc.content, TOPPING_SENTINEL)) console.log(`  [unchanged] services/${svc.id} already has the section`);
  else {
    // Append to the last richText block (the page's only one on prod), so
    // the section reads as part of the body rather than a detached block.
    const content = [...(svc.content ?? [])];
    const idx = content.map((b) => b.blockType).lastIndexOf('richText');
    if (idx === -1) throw new Error('services/paddock-topping has no richText block');
    const b = content[idx];
    content[idx] = { ...b, content: { ...b.content, root: { ...b.content.root, children: [...b.content.root.children, ...TOPPING_NODES] } } };
    changes += 1;
    console.log(`  [append] services/${svc.id} block ${idx}: +${TOPPING_NODES.length} nodes (2 h2, 3 h3)`);
    await write('services', svc, { content }, (c) => bodyHas(c.content, TOPPING_SENTINEL));
  }

  console.log('\n2. Post 55 meta (stop competing with the homepage):');
  const pm = await one('posts', PM_SLUG);
  if (!pm) console.log('  [missing] posts/paddock-management — skipping');
  else {
    for (const v of [PM_META.metaTitle, PM_META.metaDescription]) {
      if (v.length > (v === PM_META.metaTitle ? 60 : 160)) throw new Error(`too long (${v.length}): ${v}`);
    }
    const seo = { ...(pm.seo ?? {}) };
    let dirty = false;
    for (const k of ['metaTitle', 'metaDescription']) {
      if (seo[k] !== PM_META[k]) { console.log(`  [${k}] posts/${pm.id}: "${seo[k] ?? ''}"\n      → "${PM_META[k]}"`); seo[k] = PM_META[k]; dirty = true; }
    }
    if (!dirty) console.log(`  [unchanged] posts/${pm.id}`);
    else {
      changes += 1;
      await write('posts', pm, { seo }, (c) => c.seo?.metaTitle === PM_META.metaTitle && c.seo?.metaDescription === PM_META.metaDescription);
    }
  }

  console.log('\n3. Opportunities from ' + RUN + ':');
  for (const [id, status, notes] of CLOSE) {
    const opp = await payload.findByID({ collection: 'seo-opportunities', id, depth: 0 }).catch(() => null);
    if (!opp) { console.log(`  [missing] #${id} — skipping (stale mirror?)`); continue; }
    if (opp.agentRunId !== RUN) throw new Error(`#${id} belongs to ${opp.agentRunId}, not ${RUN}`);
    if (opp.status === status) { console.log(`  [unchanged] #${id} already ${status}`); continue; }
    changes += 1;
    console.log(`  [${status}] #${id} "${opp.query}" (was ${opp.status})`);
    if (EXECUTE) {
      await payload.update({ collection: 'seo-opportunities', id, data: { status, notes, decidedAt: new Date().toISOString() } });
      const c = await payload.findByID({ collection: 'seo-opportunities', id, depth: 0 });
      console.log(c.status === status ? '      ✓ written and re-read' : '      ✗ RE-READ FAILED');
    }
  }

  console.log(`\n${changes} change(s) ${EXECUTE ? 'applied' : 'pending'}.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
