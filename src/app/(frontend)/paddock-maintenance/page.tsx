import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { getPayload } from 'payload';
import config from '@payload-config';

import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { Breadcrumb } from '@/components/Breadcrumb';
import { FaqAccordion, type FaqItem } from '@/components/paddock-maintenance/FaqAccordion';
import { mediaUrl } from '@/lib/media';
import { SITE_PHONE_TEL } from '@/lib/site';
import { jsonLd } from '@/lib/jsonld';
import styles from './paddock-maintenance.module.css';

/**
 * /paddock-maintenance — SEO pillar page.
 *
 * Two jobs, in priority:
 *  1. Rank for "paddock maintenance" + adjacent terms by being
 *     comprehensive and densely linking to the 15 service pages.
 *  2. Pitch contract maintenance to the subset of readers ready
 *     for a year-round relationship.
 */

export async function generateMetadata(): Promise<Metadata> {
  // Reuse the cached hero photo as the OG/social preview image so this pillar
  // page gets a real image instead of the generic site default.
  const hero = await getHeroPhoto();
  const ogImage =
    mediaUrl(hero as Parameters<typeof mediaUrl>[0], 'large') ??
    mediaUrl(hero as Parameters<typeof mediaUrl>[0]);
  return {
    title: { absolute: 'Paddock Maintenance — Full Guide & Services | Hampshire Paddock Management' },
    description:
      "Everything paddock maintenance involves — seasonal schedule, full service list, how pricing works, and how to get year-round contract maintenance across Hampshire and the surrounding counties.",
    alternates: { canonical: '/paddock-maintenance' },
    openGraph: {
      title: 'Paddock Maintenance — Full Guide & Services',
      description:
        "The complete picture: what paddock maintenance involves, when each job matters, how it's priced, and how to get someone reliable doing it for you.",
      type: 'article',
      url: '/paddock-maintenance',
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  };
}

// ISR so Payload content/media changes flow through without a full redeploy.
export const revalidate = 3600;

// Hero photo — same default as the gallery uses; prefer a Burcombe Estate shot.
const HERO_MEDIA_ID = 39;

const getHeroPhoto = unstable_cache(
  async () => {
    const payload = await getPayload({ config });
    try {
      return await payload.findByID({
        collection: 'media',
        id: HERO_MEDIA_ID,
        depth: 0,
      });
    } catch {
      return null;
    }
  },
  ['paddock-maintenance-hero'],
  { revalidate: 3600, tags: ['media'] },
);

type SeasonJob = { text: string; href?: string; after?: string };
type Season = { name: string; months: string; lead: string; jobs: SeasonJob[] };

const SEASONS: Season[] = [
  {
    name: 'Spring',
    months: 'Mar — May',
    lead: 'Wake the field up. Get on top of weeds before they bolt.',
    jobs: [
      { text: 'Chain harrowing', href: '/services/harrowing', after: ' to lift thatch and spread muck' },
      { text: 'Rolling', href: '/services/rolling', after: ' to firm up frost-heaved ground' },
      { text: 'First weed control', href: '/services/weed-control', after: ' pass — ragwort, docks, thistles' },
      { text: 'Spring fertiliser application', href: '/services/fertiliser-application' },
      { text: 'Overseeding', href: '/services/overseeding', after: ' bare patches' },
    ],
  },
  {
    name: 'Summer',
    months: 'Jun — Aug',
    lead: "Keep the grass productive. Knock back what the horses won't.",
    jobs: [
      { text: 'First topping', href: '/services/paddock-topping', after: ' after seed-set' },
      { text: 'Spot-spraying', href: '/services/weed-control', after: ' persistent weeds' },
      { text: 'Manure sweeping', href: '/services/manure-sweeping', after: ' to keep parasites down' },
      { text: 'Possible second topping in late August' },
    ],
  },
  {
    name: 'Autumn',
    months: 'Sep — Nov',
    lead: 'Set the field up for winter and the spring after.',
    jobs: [
      { text: 'Final topping', href: '/services/paddock-topping', after: ' if needed' },
      { text: 'Overseeding', href: '/services/overseeding', after: ' while ground is warm' },
      { text: 'Mole ploughing', href: '/services/mole-ploughing', after: ' for drainage on wet fields' },
      { text: 'Autumn fertiliser', href: '/services/fertiliser-application', after: ' on poorer ground' },
      { text: 'Ditch clearance', href: '/services/land-ditch-clearance', after: ' before winter rain' },
    ],
  },
  {
    name: 'Winter',
    months: 'Dec — Feb',
    lead: "Heavy ground work and structural jobs while grass isn't growing.",
    jobs: [
      { text: 'Rotavating', href: '/services/rotavating', after: ' tired sections for renovation' },
      { text: 'Stone burying', href: '/services/stone-burying', after: ' on rough ground' },
      { text: 'Land & ditch clearance', href: '/services/land-ditch-clearance' },
      { text: "Planning the year's spray and fertiliser programme" },
    ],
  },
];

const SERVICES = [
  // Cutting & mowing
  { slug: 'paddock-topping', category: 'Cutting & mowing', name: 'Paddock topping', blurb: 'The bread-and-butter cut. Knocks back ungrazed patches and weeds before they seed.' },
  { slug: 'flailing', category: 'Cutting & mowing', name: 'Flailing', blurb: 'For rougher ground or heavier vegetation than a topper handles cleanly.' },
  { slug: 'flail-collecting', category: 'Cutting & mowing', name: 'Flail collecting', blurb: 'Cuts and collects in one pass — no piles to rake or move afterwards.' },
  { slug: 'finish-mowing', category: 'Cutting & mowing', name: 'Finish mowing', blurb: 'Tidier, lower cut for high-presentation paddocks and amenity grass.' },
  // Ground care
  { slug: 'harrowing', category: 'Ground care', name: 'Harrowing', blurb: 'Lifts thatch, spreads muck, levels hoof prints. The single most useful spring job.' },
  { slug: 'rolling', category: 'Ground care', name: 'Rolling', blurb: 'Firms ground after frost and improves seed-to-soil contact after overseeding.' },
  { slug: 'rotavating', category: 'Ground care', name: 'Rotavating', blurb: 'For full renovation — breaks ground up before reseeding a tired field.' },
  { slug: 'mole-ploughing', category: 'Ground care', name: 'Mole ploughing', blurb: 'Cuts drainage channels under the surface — fixes wet fields without trenching.' },
  { slug: 'stone-burying', category: 'Ground care', name: 'Stone burying', blurb: 'Buries surface stones rather than picking them — fast on stony ground.' },
  { slug: 'land-ditch-clearance', category: 'Ground care', name: 'Land & ditch clearance', blurb: 'Boundary tidying, ditch reinstatement, removing scrub or hedge encroachment.' },
  // Treatment & upkeep
  { slug: 'weed-control', category: 'Treatment & upkeep', name: 'Weed control', blurb: 'Ragwort, docks, thistles, nettles — selective spraying or spot treatment.' },
  { slug: 'spraying', category: 'Treatment & upkeep', name: 'Spraying', blurb: 'Tractor-mounted boom spraying for larger areas. PA1/PA2 certified.' },
  { slug: 'fertiliser-application', category: 'Treatment & upkeep', name: 'Fertiliser application', blurb: "Granular application, calibrated rates, timed to the field's actual need." },
  { slug: 'overseeding', category: 'Treatment & upkeep', name: 'Overseeding', blurb: 'Refreshes thinning paddocks without full renovation. Direct-drilled or broadcast.' },
  { slug: 'manure-sweeping', category: 'Treatment & upkeep', name: 'Manure sweeping', blurb: 'Mechanical sweeping to keep parasite burden and nutrient hot-spots down.' },
] as const;

const FAQS: FaqItem[] = [
  {
    q: 'How often does my paddock actually need maintenance?',
    a: "For a horse paddock that's grazed normally, three to four visits a year is standard — typically a spring service (harrowing, rolling, weed control), a summer topping, and an autumn job (overseeding, fertiliser, sometimes a second topping). Heavily stocked fields or paddocks coming back from neglect need more. The mistake I see most often is owners only calling when the field looks visibly bad. By that point the work is bigger and more expensive. Regular small jobs are far cheaper than recovery work.",
    rich: (
      <>
        <p>
          For a horse paddock that&apos;s grazed normally, three to four visits a year is
          standard — typically a spring service (harrowing, rolling, weed control), a summer
          topping, and an autumn job (overseeding, fertiliser, sometimes a second topping).
          Heavily stocked fields or paddocks coming back from neglect need more.
        </p>
        <p>
          The mistake I see most often is owners only calling when the field looks visibly
          bad. By that point the work is bigger and more expensive. Regular small jobs are
          far cheaper than recovery work.
        </p>
      </>
    ),
  },
  {
    q: 'Do you do one-off jobs or only year-round contracts?',
    a: "Both. Most of my work is one-off — somebody rings about a specific job, I do it, they ring again next season. Contracts are for owners who'd rather not think about timing at all. Either is fine.",
  },
  {
    q: "What's the smallest paddock you'll come out for?",
    a: "No fixed minimum, but very small fields (under an acre or so) work better as part of a route — i.e. if I'm already in the area for someone else. Let me know where you are and what's needed and I'll be straight about whether the trip makes sense.",
  },
  {
    q: "Can you handle paddocks I've let get away from me?",
    a: 'Yes. Heavy flailing, ragwort clearance, and renovation work are bread-and-butter jobs. Bringing a neglected paddock back usually takes a season or two — start with knocking it down, follow with weed control, then build the sward back with overseeding and the right fertiliser. Worth the work.',
    rich: (
      <p>
        Yes. Heavy <Link href="/services/flailing">flailing</Link>, ragwort clearance, and
        renovation work are bread-and-butter jobs. Bringing a neglected paddock back usually
        takes a season or two — start with knocking it down, follow with weed control, then
        build the sward back with overseeding and the right fertiliser. Worth the work.
      </p>
    ),
  },
  {
    q: 'Where do you work? Are you near me?',
    a: 'Hampshire mainly — Winchester, Andover, Basingstoke, Petersfield, Romsey, Stockbridge, Alresford, the Test Valley, the Meon Valley, and the New Forest fringe are all regular runs. Beyond Hampshire there\'s steady work in Wiltshire (Salisbury, Marlborough), Berkshire (Newbury, Hungerford), Surrey, Dorset, and West Sussex. Anywhere further afield is by arrangement — ask, and we\'ll work out whether it makes sense.',
  },
];

const CATEGORIES = ['Cutting & mowing', 'Ground care', 'Treatment & upkeep'] as const;

export default async function PaddockMaintenancePage() {
  const heroMedia = await getHeroPhoto();
  const heroUrl = mediaUrl(heroMedia, 'hero') ?? mediaUrl(heroMedia);
  const heroAlt =
    (typeof heroMedia === 'object' && heroMedia?.alt) || 'Hampshire paddock work';

  // JSON-LD: a Service block for the page itself + an FAQPage block
  // for rich-snippet eligibility on the FAQs. The provider references the
  // sitewide LocalBusiness via @id (defined in the root layout) so Google
  // treats this as the same entity rather than a duplicate org.
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || 'https://hampshirepaddockmanagement.com'
  ).replace(/\/$/, '');
  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Paddock maintenance',
    serviceType: 'Paddock maintenance',
    description:
      'Year-round paddock maintenance for horse owners — topping, harrowing, weed control, fertiliser, drainage, and contract maintenance.',
    provider: {
      '@type': 'LocalBusiness',
      '@id': `${siteUrl}/#business`,
      name: 'Hampshire Paddock Management',
      telephone: SITE_PHONE_TEL,
      address: {
        '@type': 'PostalAddress',
        addressRegion: 'Hampshire',
        addressCountry: 'GB',
      },
    },
    areaServed: [
      { '@type': 'AdministrativeArea', name: 'Hampshire' },
      { '@type': 'AdministrativeArea', name: 'Wiltshire' },
      { '@type': 'AdministrativeArea', name: 'Berkshire' },
      { '@type': 'AdministrativeArea', name: 'Surrey' },
      { '@type': 'AdministrativeArea', name: 'Dorset' },
      { '@type': 'AdministrativeArea', name: 'West Sussex' },
    ],
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <>
      {/* JSON-LD must be in the initial HTML for SEO crawlers — use a plain
          <script> rather than next/script (which is lazy-loaded). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(serviceJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(faqJsonLd) }}
      />

      {/* HERO */}
      <section className={styles.hero}>
        <Nav variant="overlay" />
        <div className={styles.heroPhoto}>
          {heroUrl && (
            <Image
              src={heroUrl}
              alt={heroAlt}
              fill
              priority
              sizes="100vw"
              style={{ objectFit: 'cover' }}
            />
          )}
        </div>
        <div className={styles.heroGradient} />
        <div className={styles.heroInner}>
          <Breadcrumb items={[{ label: 'Paddock maintenance' }]} />
          <p className={styles.eyebrow}>Paddock maintenance</p>
          <h1 className={styles.h1}>
            Everything your paddock <em>actually needs</em>
          </h1>
          <p className={styles.heroLead}>
            The complete picture — what paddock maintenance involves, when each job matters,
            how it&apos;s priced, and how to get someone reliable doing it for you.
          </p>
        </div>
      </section>

      {/* INTRO */}
      <section className={styles.intro}>
        <p>
          <strong>Paddock maintenance</strong> is the ongoing work that keeps a horse paddock
          healthy, safe, and grazing-ready year-round. It covers everything from{' '}
          <Link href="/services/paddock-topping">paddock topping</Link> and{' '}
          <Link href="/services/harrowing">harrowing</Link> through to weed control,
          fertiliser, and ground repair — done at the right time, in the right order, with
          the right kit.
        </p>
        <p>
          Most paddocks need attention three or four times a year. Get the timing right and
          the field stays in condition with relatively little effort. Get it wrong — or skip a
          season — and the work needed to recover the field is several times what regular
          maintenance would have cost.
        </p>
        <p>
          Based in Hampshire, with regular routes through Winchester, Andover, Basingstoke,
          Petersfield, Romsey, Stockbridge, and Alresford, plus into Wiltshire, Berkshire,
          Surrey, Dorset, and West Sussex — if you&apos;re searching for paddock maintenance
          near you in any of these areas, you&apos;re in the catchment.
        </p>
      </section>

      {/* SEASONAL */}
      <section className={styles.seasonal}>
        <p className={styles.sectionEyebrow}>Year round</p>
        <h2 className={styles.sectionHeading}>
          A season-by-season <em>schedule</em>
        </h2>
        <p className={styles.sectionIntro}>
          Paddock work is timing-led. Here&apos;s what each season usually wants — though the
          right schedule depends on your stocking density, soil type, and how the previous year
          went.
        </p>

        <div className={styles.seasonalGrid}>
          {SEASONS.map((s) => (
            <div key={s.name} className={styles.season}>
              <div className={styles.seasonBanner}>
                <span className={styles.seasonName}>{s.name}</span>
                <span className={styles.seasonMonths}>{s.months}</span>
              </div>
              <div className={styles.seasonBody}>
                <p className={styles.seasonLead}>{s.lead}</p>
                <ul className={styles.seasonJobs}>
                  {s.jobs.map((j, i) => (
                    <li key={i}>
                      {j.href ? (
                        <>
                          <Link href={j.href}>{j.text}</Link>
                          {j.after}
                        </>
                      ) : (
                        j.text
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SERVICES */}
      <section className={styles.servicesBlock}>
        <div className={styles.servicesInner}>
          <p className={styles.sectionEyebrow}>All services</p>
          <h2 className={styles.sectionHeading}>
            Every job, <em>covered</em>
          </h2>
          <p className={styles.sectionIntro}>
            Whether you need one-off help with a specific problem or year-round maintenance,
            the full menu is below. Each links to a page with detail, kit used, and how it&apos;s
            priced.
          </p>

          {CATEGORIES.map((cat) => (
            <div key={cat} className={styles.categoryGroup}>
              <h3 className={styles.categoryHeading}>{cat}</h3>
              <div className={styles.servicesGrid}>
                {SERVICES.filter((s) => s.category === cat).map((svc) => (
                  <Link key={svc.slug} href={`/services/${svc.slug}`} className={styles.serviceCard}>
                    <p className={styles.serviceCardCategory}>{svc.category}</p>
                    <h4 className={styles.serviceCardTitle}>{svc.name}</h4>
                    <p className={styles.serviceCardBlurb}>{svc.blurb}</p>
                    <span className={styles.serviceCardArrow}>See more →</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* COST */}
      <section className={styles.cost}>
        <p className={styles.sectionEyebrow}>What does it cost?</p>
        <h2 className={styles.sectionHeading}>
          How <em>pricing works</em>
        </h2>
        <p className={styles.sectionIntro}>
          There&apos;s no fixed price for paddock maintenance because no two paddocks are the
          same. A fair quote depends on the size, the condition, the access, and what
          specifically wants doing. Here&apos;s roughly how it shakes out.
        </p>

        <ol className={styles.costPoints}>
          <li>
            <span className={styles.costNum}>i</span>
            <div className={styles.costText}>
              <strong>Most jobs are priced per acre or per hour</strong>
              Cutting, harrowing, rolling, and spraying are typically per-acre. Specialist or
              short-duration work — small jobs, awkward access — is more often quoted by the
              hour.
            </div>
          </li>
          <li>
            <span className={styles.costNum}>ii</span>
            <div className={styles.costText}>
              <strong>Travel matters more than acreage on small jobs</strong>
              Two acres an hour from the yard versus two acres ninety minutes away are different
              jobs. I&apos;m honest about this on the call rather than baking it into a flat rate
              that hurts everyone.
            </div>
          </li>
          <li>
            <span className={styles.costNum}>iii</span>
            <div className={styles.costText}>
              <strong>Materials are passed through at cost</strong>
              Fertiliser, seed, herbicide — you pay what I pay, with no markup. The only thing
              I charge for is the work and the kit running.
            </div>
          </li>
          <li>
            <span className={styles.costNum}>iv</span>
            <div className={styles.costText}>
              <strong>Bundled or contract maintenance is cheaper than one-offs</strong>
              Knowing in advance that I&apos;ll be on your field three times a year means I can
              plan routes and time-of-year, which keeps your costs down. See the contract
              section below.
            </div>
          </li>
        </ol>

        <p className={styles.costFootnote}>
          Most jobs I can quote over the phone from a description of the field. For trickier
          ones — heavy renovation, drainage, jobs with awkward access — I&apos;ll come and walk
          it with you, no charge.
        </p>
      </section>

      {/* CONTRACT */}
      <section className={styles.contract}>
        <div className={styles.contractInner}>
          <div>
            <p className={styles.contractEyebrow}>Year-round contract</p>
            <h2 className={styles.contractH2}>
              Or just <em>let me handle it</em>
            </h2>
            <p className={styles.contractLead}>
              If you&apos;d rather not think about timing or remember to call when the ragwort
              comes up, an annual contract puts the whole thing on autopilot. I plan the year,
              do the work at the right moments, and keep your field in condition without the
              back-and-forth.
            </p>

            <ul className={styles.contractFeatures}>
              <li>
                <span className={styles.contractTick}>✓</span>
                <div>
                  <strong>Annual plan, fixed budget</strong>
                  We agree what&apos;s needed and roughly when, at the start of the year.
                  Predictable cost, no surprise invoices.
                </div>
              </li>
              <li>
                <span className={styles.contractTick}>✓</span>
                <div>
                  <strong>Right work, right time</strong>
                  I get the timing right because I&apos;m watching the calendar and the
                  weather, not waiting to be asked.
                </div>
              </li>
              <li>
                <span className={styles.contractTick}>✓</span>
                <div>
                  <strong>Priority over one-off jobs</strong>
                  Contract clients go to the front of the queue when it gets busy.
                </div>
              </li>
              <li>
                <span className={styles.contractTick}>✓</span>
                <div>
                  <strong>Better rates, lower hassle</strong>
                  Bundled work is cheaper to schedule, so it&apos;s cheaper for you. Plus you
                  skip every &ldquo;got time for me this week?&rdquo; phone call.
                </div>
              </li>
            </ul>

            <Link href="/contact?subject=contract" className={styles.contractCta}>
              Talk about a contract →
            </Link>
          </div>
          <div className={styles.contractPhotoWrap}>
            {heroUrl && (
              <Image
                src={heroUrl}
                alt={heroAlt}
                fill
                sizes="(max-width: 1100px) 100vw, 45vw"
                style={{ objectFit: 'cover' }}
              />
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={styles.faq}>
        <p className={styles.sectionEyebrow}>Common questions</p>
        <h2 className={styles.sectionHeading}>
          People <em>often ask</em>
        </h2>
        <FaqAccordion items={FAQS} />
      </section>

      {/* CTA BAND */}
      <section className={styles.ctaBand} aria-labelledby="paddock-maintenance-cta-heading">
        <h2 id="paddock-maintenance-cta-heading" className={styles.ctaBandHeading}>
          Want a paddock that <em>actually gets looked after?</em>
        </h2>
        <p>Drop me a line — phone, message, or the form. I&apos;ll usually come back to you within hours.</p>
        <Link href="/contact" className={styles.ctaButton}>
          Get a quote →
        </Link>
      </section>

      <Footer />
    </>
  );
}
