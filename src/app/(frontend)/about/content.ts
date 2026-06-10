/**
 * Long-form copy for /about. Lifted out of page.tsx so the JSX stays
 * readable. Tom will edit this directly when the real copy is ready.
 *
 * Photos are referenced by Media-collection ID; the page resolves the
 * actual URL via mediaUrl() at render time so we get the 'large' variant
 * automatically when present.
 */

export const PHOTOS = {
  // Wide landscape — establishing shot
  hero: 51,
  // Portrait — Tom (intro photo column)
  intro: 41,
  // Wide landscape — full-bleed break section
  break: 174,
} as const;

export const HERO = {
  eyebrow: 'About',
  // <em> wraps the italic Georgia fragment in the headline
  headlineHtml: 'Specialist paddock work, <em>run properly</em>',
  sub: 'The person you call is the person on the tractor. No subcontractors, no sales team, no waiting until next month.',
};

export const INTRO = {
  eyebrow: 'Hello',
  headlineHtml: "I&rsquo;m Tom &mdash; I run <em>Hampshire Paddock Management</em>.",
  paragraphs: [
    "If you&rsquo;ve got a paddock that&rsquo;s getting away from you &mdash; long grass, ragwort coming through, hooves cutting in where they shouldn&rsquo;t &mdash; I&rsquo;m probably the person you want to call.",
    "I do this full-time. It&rsquo;s not a side hustle for the quiet months between something else. The kit is mine, the work is mine, and when you ring the number on this site, I&rsquo;m the one who picks up.",
  ],
};

export const STORY = {
  paragraphsBeforeQuote: [
    "HPM started because there was a gap. Plenty of farmers will tackle a paddock if it&rsquo;s near their yard and they&rsquo;ve got a slow week &mdash; but they&rsquo;ll fit you in around their real work, and the kit they bring is the kit they happen to own. That&rsquo;s fine if you&rsquo;re lucky. It&rsquo;s not fine if you&rsquo;re trying to keep horses on a few acres and the field&rsquo;s becoming a problem.",
    "I run modern, well-maintained equipment that&rsquo;s actually right for paddock work. Tractors sized for the job &mdash; not the heavy farm gear that compacts the ground or can&rsquo;t get through a normal gateway. Toppers, harrows, rollers, sprayers, the lot. All kept in the yard, all serviced, all ready to go.",
  ],
  pullQuote:
    'The work I&rsquo;m proudest of is the stuff nobody notices &mdash; paddocks that just look right, year after year.',
  paragraphsAfterQuote: [
    "Most of what I do is repeat work. Owners ring once, like the result, and ring again the next season. That&rsquo;s the bit of the business I want to keep growing &mdash; proper relationships with people who care about their land, not chasing one-off jobs across half the country.",
    "When I&rsquo;m not on a tractor I&rsquo;m probably behind a camera. I shoot every job, which is partly why this site is wall-to-wall photographs &mdash; none of it is stock, all of it is mine. If you want to see what the work actually looks like, the gallery&rsquo;s the place.",
  ],
};

export const CREDENTIALS = {
  eyebrow: 'Tickets & cover',
  headlineHtml: 'Properly <em>certified</em>, properly insured.',
  cards: [
    { badge: 'PA1', title: 'PA1 certified', detail: 'Pesticide application — foundation' },
    { badge: 'PA2', title: 'PA2 certified', detail: 'Boom sprayer, mounted equipment' },
    { badge: 'HGV', title: 'HGV & Cat B', detail: 'Plant moves and transport handled' },
    // £5m figure unverified — Tom to confirm before launch.
    { badge: '£', title: 'Public liability', detail: '£5m cover, certificate on request' },
  ],
};

export const AREA = {
  eyebrow: 'Where I work',
  headlineHtml: 'Hampshire and the <em>surrounding counties</em>.',
  body: "If you&rsquo;re in Hampshire or anywhere not too far over the border &mdash; Wiltshire, Sussex, Surrey, Berkshire, Dorset &mdash; get in touch and we&rsquo;ll work out whether the trip makes sense. For most jobs it does. Quote first, then decide.",
};

export const CTA = {
  headlineHtml: 'Want me to take a look at <em>your paddock?</em>',
  body: "Drop me a message and I&rsquo;ll come out, walk the field, and tell you honestly what&rsquo;s worth doing.",
  primary: { label: 'Get a quote →', href: '/contact' },
  secondary: { label: 'See the work', href: '/gallery' },
};
