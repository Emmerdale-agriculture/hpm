import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { Nav } from '@/components/Nav';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Footer } from '@/components/Footer';
import { mediaUrl } from '@/lib/media';
import { getNotesData, countByTag } from './data';
import { NotesClient } from './NotesClient';
import { FilterBar } from './FilterBar';
import { formatMonth } from './PostCard';
import styles from './notes.module.css';

export const metadata: Metadata = {
  // Bare title — the layout template appends " | Hampshire Paddock Management".
  title: 'Notes from the field',
  description:
    'Practical advice on paddocks, weeds, kit, and seasonal jobs — written from the seat of a tractor.',
  // canonical '/notes' also folds any legacy /notes?tag=<slug> URLs (now
  // 301ed to /notes/tag/<slug> in middleware) back to the index.
  alternates: { canonical: '/notes' },
};

// ISR so newly published posts (revalidateTag('posts')) appear without a full
// redeploy. Without this the page was fully static after build.
export const revalidate = 3600;

export default async function NotesIndexPage() {
  const { featured, grid, heroMedia } = await getNotesData();
  const all = [...(featured ? [featured] : []), ...grid];
  const counts = countByTag(all);

  const heroUrl =
    mediaUrl(heroMedia as Parameters<typeof mediaUrl>[0], 'large') ??
    mediaUrl(heroMedia as Parameters<typeof mediaUrl>[0]);
  const heroAlt =
    (typeof heroMedia === 'object' && heroMedia?.alt) ||
    'Hampshire paddock work';

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
          <Breadcrumb items={[{ label: 'Notes' }]} />
          <div className={styles.eyebrowLight}>Notes from the field</div>
          <h1 className={styles.heroTitle}>
            Things <em>worth knowing</em>
          </h1>
          <p className={styles.heroSub}>
            Practical advice on paddocks, weeds, kit, and seasonal jobs —
            written from the seat of a tractor.
          </p>
        </div>
      </section>

      {/* ===== FEATURED ===== */}
      {featured && (
        <section className={styles.featuredWrap}>
          <div className={styles.featuredEyebrow}>Featured</div>
          <Link href={`/notes/${featured.slug}`} className={styles.featured}>
            {featured.hero?.url && (
              <div className={styles.featuredPhoto}>
                <Image
                  src={featured.hero.url}
                  alt={featured.hero.alt}
                  fill
                  sizes="(max-width: 1100px) 100vw, 60vw"
                  style={{ objectFit: 'cover' }}
                />
              </div>
            )}
            <div>
              <div className={styles.featuredMeta}>
                {featured.primaryTag && (
                  <span className={styles.tagPill}>{featured.primaryTag}</span>
                )}
                {featured.publishedAt && <span>·</span>}
                {featured.publishedAt && (
                  <span>{formatMonth(featured.publishedAt)}</span>
                )}
              </div>
              <h2 className={styles.featuredTitle}>{featured.title}</h2>
              {featured.excerpt && (
                <p className={styles.featuredExcerpt}>{featured.excerpt}</p>
              )}
              <span className={styles.featuredCta}>Read the post →</span>
            </div>
          </Link>
        </section>
      )}

      {/* ===== TOPIC LINKS + GRID + LOAD MORE (first page of cards renders
           in server HTML; chips link to crawlable /notes/tag/* hubs) ===== */}
      <FilterBar counts={counts} active={null} shownCount={grid.length} />
      <NotesClient posts={grid} />

      {/* ===== FULL ARCHIVE (server-rendered) =====
           Every published post gets a crawlable link from /notes — the
           interactive grid above only shows a page at a time. */}
      <section className={styles.archive} aria-label="All notes">
        <h2 className={styles.archiveTitle}>All notes</h2>
        <ul className={styles.archiveList}>
          {all.map((p) => (
            <li key={p.id}>
              <Link href={`/notes/${p.slug}`}>{p.title}</Link>
              {p.publishedAt && (
                <span className={styles.archiveDate}> — {formatMonth(p.publishedAt)}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ===== CTA BAND ===== */}
      <section className={styles.ctaBand}>
        <h3 className={styles.ctaTitle}>
          Reading is fine. <em>Doing is better.</em>
        </h3>
        <p className={styles.ctaBody}>
          If your paddock needs work and you&rsquo;d rather someone else
          handled it, get in touch.
        </p>
        <Link href="/contact" className={styles.btnPrimary}>
          Get a quote →
        </Link>
      </section>

      <Footer />
    </>
  );
}
