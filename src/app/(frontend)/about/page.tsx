import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { getPayload } from 'payload';
import config from '@payload-config';

import { Nav } from '@/components/Nav';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Footer } from '@/components/Footer';
import { mediaUrl } from '@/lib/media';
import { AREA, CREDENTIALS, CTA, HERO, INTRO, PHOTOS, STORY } from './content';
import styles from './about.module.css';

export const metadata: Metadata = {
  // Bare title — the layout template appends " | Hampshire Paddock Management".
  title: 'About',
  description:
    "Tom runs Hampshire Paddock Management — modern compact equipment, full-time paddock work across Hampshire, Wiltshire, Berkshire, Surrey, Dorset and West Sussex.",
  alternates: { canonical: '/about' },
};

// ISR so Payload media changes (revalidateTag('media')) flow through without
// a full redeploy; matches the other public pages.
export const revalidate = 3600;

// Photos are static here — cache the media lookups so we don't pay the
// Payload round-trip every render.
const getAboutPhotos = unstable_cache(
  async () => {
    const payload = await getPayload({ config });
    const ids = [PHOTOS.hero, PHOTOS.intro, PHOTOS.break];
    const docs = await Promise.all(
      ids.map((id) =>
        payload
          .findByID({ collection: 'media', id, depth: 0 })
          .catch(() => null),
      ),
    );
    return { hero: docs[0], intro: docs[1], break: docs[2] };
  },
  ['about-photos'],
  { revalidate: 300, tags: ['media'] },
);

function resolveUrl(media: Parameters<typeof mediaUrl>[0]) {
  return mediaUrl(media, 'large') ?? mediaUrl(media);
}

function altOf(media: Parameters<typeof mediaUrl>[0], fallback: string) {
  return (typeof media === 'object' && media?.alt) || fallback;
}

export default async function AboutPage() {
  const photos = await getAboutPhotos();

  const heroUrl = resolveUrl(photos.hero);
  const introUrl = resolveUrl(photos.intro);
  const breakUrl = resolveUrl(photos.break);

  return (
    <>
      {/* ===== HERO ===== */}
      <section className={styles.hero}>
        <Nav variant="overlay" />
        {heroUrl && (
          <div className={styles.heroPhoto}>
            <Image
              src={heroUrl}
              alt={altOf(photos.hero, 'Hampshire paddock work')}
              fill
              priority
              sizes="100vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
        )}
        <div className={styles.heroInner}>
          <Breadcrumb items={[{ label: 'About' }]} />
          <div className={styles.eyebrowLight}>{HERO.eyebrow}</div>
          <h1
            className={styles.heroTitle}
            dangerouslySetInnerHTML={{ __html: HERO.headlineHtml }}
          />
          <p className={styles.heroSub}>{HERO.sub}</p>
        </div>
      </section>

      {/* ===== INTRO ===== */}
      <section className={styles.intro}>
        <div className={styles.introPhoto}>
          {introUrl && (
            <Image
              src={introUrl}
              alt={altOf(photos.intro, 'Tom — Hampshire Paddock Management')}
              fill
              sizes="(max-width: 1100px) 100vw, 45vw"
              style={{ objectFit: 'cover' }}
            />
          )}
        </div>
        <div className={styles.introText}>
          <div className={styles.eyebrowDark}>{INTRO.eyebrow}</div>
          <h2
            className={styles.introTitle}
            dangerouslySetInnerHTML={{ __html: INTRO.headlineHtml }}
          />
          {INTRO.paragraphs.map((html, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: html }} />
          ))}
        </div>
      </section>

      {/* ===== STORY ===== */}
      <section className={styles.story}>
        {STORY.paragraphsBeforeQuote.map((html, i) => (
          <p key={`before-${i}`} dangerouslySetInnerHTML={{ __html: html }} />
        ))}
        <blockquote
          className={styles.pullQuote}
          dangerouslySetInnerHTML={{ __html: `&ldquo;${STORY.pullQuote}&rdquo;` }}
        />
        {STORY.paragraphsAfterQuote.map((html, i) => (
          <p key={`after-${i}`} dangerouslySetInnerHTML={{ __html: html }} />
        ))}
      </section>

      {/* ===== CREDENTIALS ===== */}
      <section className={styles.credentials}>
        <div className={styles.credentialsInner}>
          <div className={styles.credsEyebrow}>{CREDENTIALS.eyebrow}</div>
          <h3
            className={styles.credsTitle}
            dangerouslySetInnerHTML={{ __html: CREDENTIALS.headlineHtml }}
          />
          <div className={styles.credsGrid}>
            {CREDENTIALS.cards.map((c) => (
              <div key={c.title} className={styles.cred}>
                <div className={styles.credBadge}>{c.badge}</div>
                <div className={styles.credTitle}>{c.title}</div>
                <div className={styles.credDetail}>{c.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== AREA ===== */}
      <section className={styles.area}>
        <div className={styles.areaEyebrow}>{AREA.eyebrow}</div>
        <h3
          className={styles.areaTitle}
          dangerouslySetInnerHTML={{ __html: AREA.headlineHtml }}
        />
        <p dangerouslySetInnerHTML={{ __html: AREA.body }} />
      </section>

      {/* ===== PHOTO BREAK ===== */}
      <div className={styles.photoBreak}>
        {breakUrl && (
          <Image
            src={breakUrl}
            alt={altOf(photos.break, 'John Deere fleet at Hampshire Paddock Management')}
            fill
            sizes="100vw"
            style={{ objectFit: 'cover' }}
          />
        )}
      </div>

      {/* ===== CTA ===== */}
      <section className={styles.ctaBand}>
        <div className={styles.ctaInner}>
          <h3
            className={styles.ctaTitle}
            dangerouslySetInnerHTML={{ __html: CTA.headlineHtml }}
          />
          <p className={styles.ctaBody} dangerouslySetInnerHTML={{ __html: CTA.body }} />
          <div className={styles.ctaButtons}>
            <Link href={CTA.primary.href} className={styles.btnPrimary}>
              {CTA.primary.label}
            </Link>
            <Link href={CTA.secondary.href} className={styles.btnSecondary}>
              {CTA.secondary.label}
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
