import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Nav } from '@/components/Nav';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Footer } from '@/components/Footer';
import { mediaUrl } from '@/lib/media';
import { jsonLd } from '@/lib/jsonld';
import { CURATED_TAGS, tagDef } from '@/lib/tags';
import { getNotesData, countByTag } from '../../data';
import { PostCard } from '../../PostCard';
import { FilterBar } from '../../FilterBar';
import styles from '../../notes.module.css';

type Params = { tag: string };

export const revalidate = 3600;

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://hampshirepaddockmanagement.com'
).replace(/\/$/, '');

export function generateStaticParams() {
  return CURATED_TAGS.map((t) => ({ tag: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { tag } = await params;
  const def = tagDef(tag);
  if (!def) return { title: 'Not found' };
  return {
    // Bare title — the layout template appends " | Hampshire Paddock Management".
    title: def.metaTitle,
    description: def.description,
    alternates: { canonical: `/notes/tag/${def.slug}` },
  };
}

export default async function TagHubPage({ params }: { params: Promise<Params> }) {
  const { tag } = await params;
  const def = tagDef(tag);
  if (!def) notFound();

  const { featured, grid, heroMedia } = await getNotesData();
  const all = [...(featured ? [featured] : []), ...grid];
  const counts = countByTag(all);
  const posts = all.filter((p) => p.tags.includes(def.slug));
  // An empty hub is a soft-404 magnet — 404 properly until posts exist.
  if (posts.length === 0) notFound();

  const heroUrl =
    mediaUrl(heroMedia as Parameters<typeof mediaUrl>[0], 'large') ??
    mediaUrl(heroMedia as Parameters<typeof mediaUrl>[0]);

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: def.metaTitle,
    description: def.description,
    url: `${SITE_URL}/notes/tag/${def.slug}`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: posts.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: p.title,
        url: `${SITE_URL}/notes/${p.slug}`,
      })),
    },
  };

  return (
    <>
      {/* ===== HERO ===== */}
      <section className={styles.hero}>
        <Nav variant="overlay" />
        {heroUrl && (
          <div className={styles.heroPhoto}>
            <Image
              src={heroUrl}
              alt={`${def.label} — Hampshire paddock work`}
              fill
              priority
              sizes="100vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
        )}
        <div className={styles.heroInner}>
          <Breadcrumb
            items={[{ label: 'Notes', href: '/notes' }, { label: def.label }]}
          />
          <div className={styles.eyebrowLight}>Notes from the field</div>
          <h1 className={styles.heroTitle}>
            {def.label} <em>notes</em>
          </h1>
          <p className={styles.heroSub}>{def.description}</p>
        </div>
      </section>

      {/* ===== TOPIC LINKS + GRID (fully server-rendered — hubs are small
           enough to skip pagination, so every card is in the HTML) ===== */}
      <FilterBar counts={counts} active={def.slug} shownCount={posts.length} />
      <section className={styles.postsWrap}>
        <div className={styles.postsGrid}>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
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
      {/* Server-rendered JSON-LD so crawlers see it in the initial HTML. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLd(itemListSchema) }}
      />
    </>
  );
}
