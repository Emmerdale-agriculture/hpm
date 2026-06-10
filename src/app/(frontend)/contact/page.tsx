import type { Metadata } from 'next';
import Image from 'next/image';
import { Suspense } from 'react';
import { unstable_cache } from 'next/cache';
import { getPayload } from 'payload';
import config from '@payload-config';

import { Nav } from '@/components/Nav';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Footer } from '@/components/Footer';
import { mediaUrl } from '@/lib/media';
import { SITE_PHONE, SITE_PHONE_TEL } from '@/lib/site';
import { ContactForm } from './ContactForm';
import styles from './contact.module.css';

export const metadata: Metadata = {
  // Bare title — the layout template appends " | Hampshire Paddock Management".
  title: 'Get a quote',
  description:
    'Tell me about your paddock — usually replies within hours, day or night. Hampshire and surrounding counties.',
  // canonical '/contact' also resolves the /quote rewrite (next.config) so the
  // two URLs don't compete as duplicate content.
  alternates: { canonical: '/contact' },
};

// ISR so Payload media changes (revalidateTag('media')) flow through without
// a full redeploy.
export const revalidate = 3600;

// Reuse the John Deere 6250R for the contact hero — it's already optimised
// (large variant) and recognisable. Same id used on /services hero.
const CONTACT_HERO_MEDIA_ID = 174;

const getContactHero = unstable_cache(
  async () => {
    const payload = await getPayload({ config });
    try {
      return await payload.findByID({
        collection: 'media',
        id: CONTACT_HERO_MEDIA_ID,
        depth: 0,
      });
    } catch {
      return null;
    }
  },
  ['contact-hero'],
  { revalidate: 300, tags: ['media'] },
);

export default async function ContactPage() {
  const hero = await getContactHero();
  const heroUrl = mediaUrl(hero, 'large') ?? mediaUrl(hero);
  const heroAlt =
    (typeof hero === 'object' && hero?.alt) || 'Hampshire Paddock Management';

  return (
    <>
      {/* ===== HERO ===== */}
      <section className={styles.hero}>
        <Nav variant="overlay" />
        {heroUrl && (
          <div className={styles.heroPhoto}>
            <Image
              src={heroUrl}
              alt={heroAlt}
              fill
              priority
              sizes="100vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
        )}
        <div className={styles.heroInner}>
          <Breadcrumb items={[{ label: 'Contact' }]} />
          <div className={styles.eyebrowLight}>Get a quote</div>
          <h1 className={styles.heroTitle}>
            Tell me about your <em>paddock</em>
          </h1>
          <p className={styles.heroSub}>
            Usually replies within hours, day or night. No obligation, no
            follow-up sales calls if you don&rsquo;t want one.
          </p>
        </div>
      </section>

      {/* ===== MAIN ===== */}
      <section className={styles.main}>
        {/* Form column */}
        <div className={styles.formCol}>
          <div className={styles.formEyebrow}>Send a message</div>
          <h2 className={styles.formTitle}>
            Quick form, <em>honest reply</em>
          </h2>
          <p className={styles.formIntro}>
            Fill in what you can. The more you tell me about the field, the better
            the quote — but if you&rsquo;d rather just leave a number, that works
            too.
          </p>

          {/* Suspense around the form because useSearchParams suspends */}
          <Suspense fallback={null}>
            <ContactForm />
          </Suspense>
        </div>

        {/* Sidebar */}
        <aside className={styles.sidebar}>
          {/* What happens next */}
          <div className={styles.panel}>
            <div className={styles.panelEyebrow}>What happens next</div>
            <h4 className={styles.panelTitle}>Three steps, no fuss</h4>
            <ol className={styles.steps}>
              <li>
                <div className={styles.stepNum}>1</div>
                <div className={styles.stepBody}>
                  <div className={styles.stepTitle}>I&rsquo;ll reply quickly</div>
                  <div className={styles.stepDetail}>
                    Usually within hours, day or night. By phone first — quicker
                    than email tag.
                  </div>
                </div>
              </li>
              <li>
                <div className={styles.stepNum}>2</div>
                <div className={styles.stepBody}>
                  <div className={styles.stepTitle}>A quick chat about the field</div>
                  <div className={styles.stepDetail}>
                    Most jobs I can quote over the phone from a description.
                    Trickier ones I&rsquo;ll come and walk with you — no charge for
                    that.
                  </div>
                </div>
              </li>
              <li>
                <div className={styles.stepNum}>3</div>
                <div className={styles.stepBody}>
                  <div className={styles.stepTitle}>Honest quote, no obligation</div>
                  <div className={styles.stepDetail}>
                    Fixed price where I can, ballparks where I can&rsquo;t. Decide
                    in your own time.
                  </div>
                </div>
              </li>
            </ol>
          </div>

          {/* Or call directly */}
          <div className={`${styles.panel} ${styles.callPanel}`}>
            <div className={styles.panelEyebrow}>Or call directly</div>
            <h4 className={styles.panelTitle}>Faster on the phone</h4>
            <p className={styles.callPanelSub}>
              If you&rsquo;d rather skip the form, give me a ring.
            </p>
            <a href={`tel:${SITE_PHONE_TEL}`} className={styles.phoneLink}>
              {SITE_PHONE}
            </a>
            <div className={styles.callHours}>
              Available any time, any day.
              <br />
              If I can&rsquo;t pick up, leave a message and I&rsquo;ll come back to
              you.
            </div>
          </div>

          {/* Where I work */}
          <div className={`${styles.panel} ${styles.areaPanel}`}>
            <div className={styles.panelEyebrow}>Where I work</div>
            <h4 className={styles.panelTitle}>Hampshire and surrounding counties</h4>
            <p>
              Most jobs across Hampshire, Wiltshire, Sussex, Surrey, Berkshire
              and Dorset. Further afield by arrangement — ask.
            </p>
          </div>
        </aside>
      </section>

      <Footer />
    </>
  );
}
