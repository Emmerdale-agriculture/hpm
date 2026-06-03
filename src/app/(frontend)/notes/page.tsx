import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { unstable_cache } from 'next/cache';
import { getPayload } from 'payload';
import config from '@payload-config';

import { Nav } from '@/components/Nav';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Footer } from '@/components/Footer';
import { mediaUrl } from '@/lib/media';
import { NotesClient } from './NotesClient';
import type { NoteCard } from './types';
import styles from './notes.module.css';

export const metadata: Metadata = {
  // Bare title — the layout template appends " | Hampshire Paddock Management".
  title: 'Notes from the field',
  description:
    'Practical advice on paddocks, weeds, kit, and seasonal jobs — written from the seat of a tractor.',
  // canonical '/notes' also folds the crawlable /notes?tag=<slug> breadcrumb
  // variants (same server HTML) back to the index.
  alternates: { canonical: '/notes' },
};

// ISR so newly published posts (revalidateTag('posts')) appear without a full
// redeploy. Without this the page was fully static after build.
export const revalidate = 3600;

// Tag chip set for the index filter. Order is the display order.
const TAG_OPTIONS: Array<{ slug: string; label: string }> = [
  { slug: 'topping',      label: 'Topping' },
  { slug: 'weeds',        label: 'Weeds' },
  { slug: 'drainage',     label: 'Drainage' },
  { slug: 'ground-care',  label: 'Ground care' },
  { slug: 'equipment',    label: 'Equipment' },
  { slug: 'seasonal',     label: 'Seasonal' },
  { slug: 'advice',       label: 'Advice' },
];

const NOTES_HERO_MEDIA_ID = 39; // Burcombe Estate Vinery — wide landscape

type RawPost = {
  id: number;
  slug: string;
  title: string;
  excerpt?: string | null;
  publishedAt?: string | null;
  primaryTag?: string | null;
  featured?: boolean | null;
  tags?: Array<{ tag?: string | null }> | null;
  heroImage?: unknown;
};

function project(p: RawPost): NoteCard {
  const heroMedia = p.heroImage as Parameters<typeof mediaUrl>[0];
  const heroSrc = mediaUrl(heroMedia, 'large') ?? mediaUrl(heroMedia);
  const heroAlt =
    (typeof heroMedia === 'object' && heroMedia?.alt) || p.title;
  const heroWidth =
    typeof heroMedia === 'object' && heroMedia && 'width' in heroMedia
      ? (heroMedia as { width?: number | null }).width ?? null
      : null;
  const heroHeight =
    typeof heroMedia === 'object' && heroMedia && 'height' in heroMedia
      ? (heroMedia as { height?: number | null }).height ?? null
      : null;

  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt ?? null,
    publishedAt: p.publishedAt ?? null,
    primaryTag: p.primaryTag ?? null,
    tags: (p.tags ?? [])
      .map((t) => t.tag)
      .filter((t): t is string => typeof t === 'string' && t.length > 0),
    hero: heroSrc
      ? { url: heroSrc, alt: heroAlt, width: heroWidth, height: heroHeight }
      : null,
  };
}

const getNotesData = unstable_cache(
  async () => {
    const payload = await getPayload({ config });

    const [postsRes, heroMedia] = await Promise.all([
      payload.find({
        collection: 'posts',
        where: { _status: { equals: 'published' } },
        limit: 0,
        sort: '-publishedAt',
        depth: 1,
        // Card fields only — exclude the heavy `content` blocks for every
        // published post. heroImage still hydrates at depth:1.
        select: {
          slug: true,
          title: true,
          excerpt: true,
          publishedAt: true,
          primaryTag: true,
          featured: true,
          tags: true,
          heroImage: true,
        },
      }),
      payload
        .findByID({ collection: 'media', id: NOTES_HERO_MEDIA_ID, depth: 0 })
        .catch(() => null),
    ]);

    const rawDocs = postsRes.docs as RawPost[];
    const all = rawDocs.map(project);

    // Featured: explicit flag wins (results are sorted newest-first, so the
    // first flagged post is the most recent), else fall back to most recent.
    // Derived in-memory from the single query above — no extra round-trip.
    let featured: NoteCard | null = null;
    const featuredRaw = rawDocs.find((p) => p.featured === true);
    if (featuredRaw) {
      featured = project(featuredRaw);
    } else if (all.length > 0) {
      featured = all[0];
    }

    // Index grid excludes the featured post (avoid duplication).
    const grid = featured ? all.filter((p) => p.id !== featured!.id) : all;

    return { featured, grid, heroMedia };
  },
  ['notes-data'],
  { revalidate: 300, tags: ['posts', 'media'] },
);

function formatMonth(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export default async function NotesIndexPage() {
  const { featured, grid, heroMedia } = await getNotesData();

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

      {/* ===== FILTER + GRID + LOAD MORE (client) ===== */}
      <Suspense fallback={null}>
        <NotesClient posts={grid} tagOptions={TAG_OPTIONS} />
      </Suspense>

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
