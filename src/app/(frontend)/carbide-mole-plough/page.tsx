import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { getPayload } from 'payload';
import config from '@payload-config';

import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { Breadcrumb } from '@/components/Breadcrumb';
import { TikTokEmbed } from '@/components/TikTokEmbed';
import { FaqAccordion, type FaqItem } from '@/components/paddock-maintenance/FaqAccordion';
import { mediaUrl } from '@/lib/media';
import { SITE_PHONE, SITE_PHONE_TEL } from '@/lib/site';
import { jsonLd } from '@/lib/jsonld';
import styles from './carbide-mole-plough.module.css';

/**
 * /carbide-mole-plough — product launch page.
 *
 * First of the new implement product line: an indexable carbide-tipped
 * mole plough, built in-house. Distinct from /services/mole-ploughing
 * (the contracting service) — this page sells/demos the implement itself.
 */

export async function generateMetadata(): Promise<Metadata> {
  const hero = await getHeroPhoto();
  const ogImage =
    mediaUrl(hero as Parameters<typeof mediaUrl>[0], 'large') ??
    mediaUrl(hero as Parameters<typeof mediaUrl>[0]);
  return {
    title: { absolute: 'Indexable Carbide-Tipped Mole Plough | Hampshire Paddock Management' },
    // ~155 chars — Google truncates around 160, so it must end cleanly.
    description:
      'A world-first mole plough with an indexable, replaceable carbide cutting tip and Hardox protection — built for hard, compacted ground. Book a demonstration.',
    alternates: { canonical: '/carbide-mole-plough' },
    openGraph: {
      title: 'Indexable Carbide-Tipped Mole Plough',
      description:
        'A replaceable carbide cutting tip instead of a blunt steel edge — built for hard, heavily compacted ground. See it working and arrange a demonstration.',
      type: 'website',
      url: '/carbide-mole-plough',
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  };
}

// ISR so Payload media changes flow through without a full redeploy.
export const revalidate = 3600;

// "Mole ploughing" action shot — placeholder hero until dedicated product
// photography of the carbide implement is uploaded.
const HERO_MEDIA_ID = 173;

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
  ['carbide-mole-plough-hero'],
  { revalidate: 3600, tags: ['media'] },
);

const TIKTOK_VIDEO_ID = '7671307871564369174';
const TIKTOK_USERNAME = 'emmerdale.agricul';
const TIKTOK_CAPTION =
  'Testing out our world first carbide tipped mole plough in some super hard ground!';
const TIKTOK_URL = `https://www.tiktok.com/@${TIKTOK_USERNAME}/video/${TIKTOK_VIDEO_ID}`;

// TikTok video ids encode their creation time in the top 32 bits.
const TIKTOK_UPLOAD_DATE = new Date(
  Number(BigInt(TIKTOK_VIDEO_ID) >> 32n) * 1000,
).toISOString();

// Thumbnail for the VideoObject schema. TikTok CDN thumbnail URLs carry
// signed expiry tokens, so they can't be hardcoded — refetch daily via
// oEmbed and simply omit the VideoObject if TikTok is unreachable.
async function getTikTokThumbnail(): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(TIKTOK_URL)}`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { thumbnail_url?: string };
    return data.thumbnail_url ?? null;
  } catch {
    return null;
  }
}

const FEATURES = [
  {
    title: 'Indexable carbide cutting tip',
    body: 'The cutting action is concentrated at an extremely hard, purpose-designed leading edge — not spread along a slab of steel.',
  },
  {
    title: 'Removable and replaceable',
    body: 'When the tip wears, you replace the cutting component — not the main assembly. Indexing extends the life of every tip.',
  },
  {
    title: 'Hardox wear protection',
    body: 'Hardox plating in the high-draft and high-abrasion areas protects the main structure from the constant punishment of working underground.',
  },
  {
    title: 'Heavy-duty construction',
    body: 'Built for hard and heavily compacted soils — a seriously heavy-duty piece of equipment for seriously difficult ground.',
  },
  {
    title: 'Better penetration',
    body: 'Designed to improve penetration compared with a conventional blunt or chamfered steel edge, reducing draft force, wheel slip and fuel burn.',
  },
  {
    title: 'Built for modern ground',
    body: 'Developed specifically for increasingly difficult conditions — long dry spells, machinery traffic and overgrazing that leave ground baked hard.',
  },
];

const FAQS: FaqItem[] = [
  {
    q: "What's the difference between a mole plough and a subsoiler?",
    a: "They're close relatives — both pull a steel leg through the ground below the surface. A subsoiler is about lifting and shattering compacted layers; a mole plough tows a bullet-shaped foot that forms an unlined drainage channel as it goes. Traditionally both rely on the same thing at the business end: a slab of steel with an edge ground onto it. That leading edge is the part we've redesigned.",
  },
  {
    q: 'Why carbide instead of steel?',
    a: "Tungsten carbide is dramatically harder than even hardened steel, so it holds its engineered cutting geometry as it wears instead of rounding off into a blunt edge. Concentrating the cutting action at a purpose-designed carbide tip means the leg isn't fighting its way through the ground — which reduces draft force, wheel slip, and fuel burn in hard conditions.",
  },
  {
    q: "What does 'indexable' mean?",
    a: "It's a term from modern cutting-tool engineering: the tip can be rotated to present a fresh cutting edge as it wears, and removed and replaced entirely when it's done. You replace the inexpensive cutting component, not the main assembly.",
  },
  {
    q: 'Can I see it working before buying one?',
    a: "Yes — that's exactly what we'd suggest. Get in touch and we'll arrange a demonstration in real ground, ideally your own, so you can see what it does in the conditions you actually deal with.",
  },
  {
    q: 'Do you sell the mole plough or just run it yourselves?',
    a: 'Both. We run mole ploughing as a contracting service across Hampshire and the surrounding counties, and the Indexable Carbide-Tipped Mole Plough is available to purchase. Either way, start with a phone call or the contact form.',
  },
];

export default async function CarbideMolePloughPage() {
  const [heroMedia, tiktokThumbnail] = await Promise.all([
    getHeroPhoto(),
    getTikTokThumbnail(),
  ]);
  const heroUrl = mediaUrl(heroMedia, 'hero') ?? mediaUrl(heroMedia);
  // Deliberate override of the CMS alt ("Mole ploughing") — describe what the
  // photo shows in this page's context until dedicated product shots exist.
  const heroAlt =
    'Tractor mole ploughing hard, compacted ground — the conditions the carbide-tipped mole plough is designed for';

  // Product JSON-LD. The brand/manufacturer references the sitewide
  // LocalBusiness @id (defined in the root layout) so Google treats it as
  // the same entity. No Offer block — price is on application.
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || 'https://hampshirepaddockmanagement.com'
  ).replace(/\/$/, '');
  const productImage =
    mediaUrl(heroMedia as Parameters<typeof mediaUrl>[0], 'large') ?? heroUrl;
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Indexable Carbide-Tipped Mole Plough',
    description:
      'Agricultural mole plough with an indexable, removable and replaceable carbide cutting tip and Hardox wear protection in high-draft and high-abrasion areas. Designed for hard and heavily compacted soils.',
    ...(productImage ? { image: productImage } : {}),
    brand: { '@type': 'Brand', name: 'Emmerdale Agriculture' },
    manufacturer: {
      '@type': 'LocalBusiness',
      '@id': `${siteUrl}/#business`,
      name: 'Hampshire Paddock Management',
      telephone: SITE_PHONE_TEL,
    },
    category: 'Agricultural machinery',
    url: `${siteUrl}/carbide-mole-plough`,
  };

  // Video rich-result eligibility needs a thumbnail, so only emit the
  // VideoObject when the oEmbed lookup succeeded.
  const videoJsonLd = tiktokThumbnail
    ? {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: 'Carbide-tipped mole plough working in hard ground',
        description: TIKTOK_CAPTION,
        thumbnailUrl: tiktokThumbnail,
        uploadDate: TIKTOK_UPLOAD_DATE,
        contentUrl: TIKTOK_URL,
        embedUrl: `https://www.tiktok.com/embed/v2/${TIKTOK_VIDEO_ID}`,
        publisher: { '@type': 'Organization', name: 'Emmerdale Agriculture' },
      }
    : null;

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
        dangerouslySetInnerHTML={{ __html: jsonLd(productJsonLd) }}
      />
      {videoJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(videoJsonLd) }}
        />
      )}
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
          <Breadcrumb items={[{ label: 'Carbide mole plough' }]} />
          <p className={styles.eyebrow}>New product line</p>
          <h1 className={styles.h1}>
            Indexable Carbide-Tipped <em>Mole Plough</em>
          </h1>
          <p className={styles.heroLead}>
            The subsoiler has barely changed in generations. We thought it was time it did.
          </p>
        </div>
      </section>

      {/* INTRO */}
      <section className={styles.intro}>
        <p>
          Look at the business end of most conventional subsoilers and mole ploughs and the
          principle is remarkably simple: a heavy slab of steel, usually with a basic
          chamfered cutting edge, dragged through the ground.
        </p>
        <p>
          It works. But is it really the most efficient way of doing it?
        </p>
        <p>
          Modern agricultural ground is becoming increasingly challenging. Longer periods of
          dry weather can leave soils extremely hard, while repeated machinery traffic and
          overgrazing can create severe compaction. Breaking through that ground can require
          enormous draft force — putting more load through the tractor, increasing wheel
          slip, and ultimately burning more fuel.
        </p>
        <p>
          <strong>So we approached the problem differently.</strong>
        </p>
      </section>

      {/* THE IDEA */}
      <section className={styles.idea}>
        <div className={styles.ideaInner}>
          <p className={styles.sectionEyebrow}>The idea</p>
          <h2 className={styles.sectionHeading}>
            Something designed <em>to cut</em>
          </h2>
          <p className={styles.ideaText}>
            Rather than relying on a conventional steel leading edge, we&apos;ve developed a
            replaceable carbide cutting tip designed to attack hard and heavily compacted
            ground more effectively.
          </p>
          <p className={styles.ideaText}>
            Using modern deep-drilling and precision manufacturing techniques, we&apos;ve
            created what we believe to be a world-first agricultural mole plough design
            incorporating an <strong>indexable, removable and replaceable carbide cutting
            tip</strong>.
          </p>
          <p className={styles.ideaText}>
            The concept is simple: instead of making the entire leg fight its way through
            the soil, concentrate the cutting action at an extremely hard, purpose-designed
            leading edge. We&apos;ve also incorporated <strong>Hardox wear protection into
            the high-draft and high-abrasion areas</strong> of the assembly, protecting the
            main structure from the constant punishment of working underground.
          </p>
          <p className={styles.ideaText}>
            The result is a seriously heavy-duty piece of equipment designed for seriously
            difficult ground.
          </p>
        </div>
      </section>

      {/* VIDEO */}
      <section className={styles.video}>
        <p className={styles.sectionEyebrow}>See it working</p>
        <h2 className={styles.sectionHeading}>
          In real ground, <em>not a brochure</em>
        </h2>
        <p className={styles.sectionIntro}>
          Here it is on test in some seriously hard ground — follow{' '}
          <a
            href={`https://www.tiktok.com/@${TIKTOK_USERNAME}`}
            target="_blank"
            rel="noreferrer"
          >
            @{TIKTOK_USERNAME}
          </a>{' '}
          for more footage as the product line develops.
        </p>
        <TikTokEmbed
          videoId={TIKTOK_VIDEO_ID}
          username={TIKTOK_USERNAME}
          caption={TIKTOK_CAPTION}
        />
      </section>

      {/* FEATURES */}
      <section className={styles.featuresBlock}>
        <div className={styles.featuresInner}>
          <p className={styles.sectionEyebrow}>Key features</p>
          <h2 className={styles.sectionHeading}>
            Built different, <em>on purpose</em>
          </h2>
          <p className={styles.sectionIntro}>
            This isn&apos;t about creating something complicated for the sake of it.
            It&apos;s about applying modern cutting-tool technology to an agricultural
            implement whose basic cutting principle has remained largely unchanged for
            decades.
          </p>
          <div className={styles.featuresGrid}>
            {FEATURES.map((f) => (
              <div key={f.title} className={styles.featureCard}>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureBody}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICE CROSS-LINK */}
      <section className={styles.serviceNote}>
        <p>
          Want the result without the implement? We run mole ploughing as a service across
          Hampshire and the surrounding counties — see{' '}
          <Link href="/services/mole-ploughing">mole ploughing</Link> for drainage work on
          wet fields.
        </p>
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
      <section className={styles.ctaBand} aria-labelledby="carbide-mole-plough-cta-heading">
        <h2 id="carbide-mole-plough-cta-heading" className={styles.ctaBandHeading}>
          When the ground is baked hard, you need something{' '}
          <em>designed to cut</em>
        </h2>
        <p>
          If you&apos;d like to see the Indexable Carbide-Tipped Mole Plough working in real
          ground — or you&apos;re interested in purchasing one — get in touch. We&apos;d be
          happy to arrange a demonstration and show you exactly what it can do.
        </p>
        <div className={styles.ctaRow}>
          <Link href="/contact?subject=mole-plough" className={styles.ctaButton}>
            Arrange a demonstration →
          </Link>
          <a href={`tel:${SITE_PHONE_TEL}`} className={styles.ctaPhone}>
            or call {SITE_PHONE}
          </a>
        </div>
      </section>

      <Footer />
    </>
  );
}
