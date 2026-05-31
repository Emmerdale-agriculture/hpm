import { cache } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';
import { notFound } from 'next/navigation';
import { getPayload } from 'payload';
import config from '@payload-config';

import { Nav } from '@/components/Nav';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Footer } from '@/components/Footer';
import { mediaUrl } from '@/lib/media';
import { renderLexical, collectUploadIds } from '@/lib/lexical';
import { serviceForTag } from '@/lib/tag-service-map';
import { jsonLd } from '@/lib/jsonld';
import styles from './post.module.css';

type Params = { slug: string };

export const revalidate = 3600;

// Wrapped in React cache() so generateMetadata and the page render share a
// single DB query per request instead of fetching the post twice.
const getPostBySlug = cache(async (slug: string) => {
  const payload = await getPayload({ config });
  const res = await payload.find({
    collection: 'posts',
    where: {
      and: [
        { slug: { equals: slug } },
        { _status: { equals: 'published' } },
      ],
    },
    limit: 1,
    depth: 1,
  });
  return res.docs[0] ?? null;
});

export async function generateStaticParams() {
  const payload = await getPayload({ config });
  const res = await payload.find({
    collection: 'posts',
    where: { _status: { equals: 'published' } },
    limit: 500,
    depth: 0,
    select: { slug: true },
  });
  return res.docs.map((d) => ({ slug: String(d.slug) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: { absolute: 'Post not found — Hampshire Paddock Management' } };

  const heroMedia = post.heroImage as Parameters<typeof mediaUrl>[0];
  const ogImage = mediaUrl(heroMedia, 'large') ?? mediaUrl(heroMedia);
  const seo =
    (post.seo as
      | { metaTitle?: string; metaDescription?: string; canonicalUrl?: string; noIndex?: boolean }
      | null
      | undefined) ?? {};
  const description = seo.metaDescription || post.excerpt || 'Notes from Hampshire Paddock Management.';
  const canonical = seo.canonicalUrl?.trim() || `/notes/${post.slug}`;
  // Use the tuned metaTitle verbatim if set; otherwise the post title plus
  // a " — Notes from the field" suffix, and let the layout template add
  // " | Hampshire Paddock Management" once.
  const title: Metadata['title'] = seo.metaTitle
    ? { absolute: seo.metaTitle }
    : `${post.title} — Notes from the field`;

  return {
    title,
    description,
    openGraph: {
      title: post.title,
      description,
      type: 'article',
      publishedTime: post.publishedAt ?? undefined,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    alternates: { canonical },
    robots: seo.noIndex ? { index: false, follow: true } : undefined,
  };
}

function formatMonth(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// Strip HTML and count words for fallback read-time computation.
function wordCountFromContent(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  let words = 0;
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as { text?: unknown; children?: unknown };
    if (typeof n.text === 'string') {
      words += n.text.split(/\s+/).filter(Boolean).length;
    }
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { blockType?: string }).blockType === 'richText') {
      walk((block as { content?: unknown }).content);
    }
  }
  return words;
}

type RelatedCard = {
  id: number;
  slug: string;
  title: string;
  primaryTag: string | null;
  publishedAt: string | null;
  hero: { url: string | null; alt: string } | null;
};

function projectRelated(p: unknown): RelatedCard {
  const post = p as {
    id: number;
    slug: string;
    title: string;
    primaryTag?: string | null;
    publishedAt?: string | null;
    heroImage?: unknown;
  };
  const heroMedia = post.heroImage as Parameters<typeof mediaUrl>[0];
  const heroSrc = mediaUrl(heroMedia, 'large') ?? mediaUrl(heroMedia);
  const heroAlt =
    (typeof heroMedia === 'object' && heroMedia?.alt) || post.title;
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    primaryTag: post.primaryTag ?? null,
    publishedAt: post.publishedAt ?? null,
    hero: heroSrc ? { url: heroSrc, alt: heroAlt } : null,
  };
}

export default async function NotePostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const payload = await getPayload({ config });

  // Hero
  const heroMedia = post.heroImage as Parameters<typeof mediaUrl>[0];
  const heroUrl = mediaUrl(heroMedia, 'large') ?? mediaUrl(heroMedia);
  const heroAlt =
    (typeof heroMedia === 'object' && heroMedia?.alt) || post.title;

  // Inline image hydration for the body
  const content = post.content as unknown[] | null | undefined;
  const uploadIds: number[] = [];
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === 'object' && (block as { blockType?: string }).blockType === 'richText') {
        uploadIds.push(...collectUploadIds((block as { content?: unknown }).content));
      }
    }
  }
  const mediaById = new Map<number, unknown>();
  if (uploadIds.length > 0) {
    const mediaRes = await payload.find({
      collection: 'media',
      where: { id: { in: uploadIds } },
      limit: 500,
      depth: 0,
    });
    for (const m of mediaRes.docs) {
      if (typeof m.id === 'number') mediaById.set(m.id, m);
    }
  }

  // Read time — prefer stored, else compute (~220 wpm)
  const storedRead =
    typeof post.readTime === 'number' && post.readTime > 0 ? post.readTime : null;
  const computedRead = Math.max(1, Math.round(wordCountFromContent(content) / 220));
  const readMinutes = storedRead ?? computedRead;

  // Tags / primary tag for chip + breadcrumb / service CTA
  const tagSlugs = ((post.tags as Array<{ tag?: string | null }> | null) ?? [])
    .map((t) => t.tag)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);
  const primaryTag = post.primaryTag ?? tagSlugs[0] ?? null;
  const cta = serviceForTag(primaryTag);

  // ----- Related posts -----
  // 1. Tagged-overlap candidates, 2. rank by overlap then recency,
  // 3. fill with most-recent if short.
  // The 100-most-recent window is enough to find any reasonable tag
  // overlap (current corpus is ~50 posts) and bounds the query as the
  // blog grows. depth: 1 hydrates heroImage on the candidates we keep.
  const all = await payload.find({
    collection: 'posts',
    where: {
      and: [
        { id: { not_equals: post.id } },
        { _status: { equals: 'published' } },
      ],
    },
    sort: '-publishedAt',
    limit: 100,
    depth: 1,
    // Only the card fields are needed for ranking/rendering — exclude the
    // heavy `content` blocks across all 100 candidate rows. heroImage still
    // hydrates at depth:1.
    select: { slug: true, title: true, primaryTag: true, publishedAt: true, tags: true, heroImage: true },
  });

  const tagSet = new Set(tagSlugs);
  let related: RelatedCard[];
  if (tagSet.size === 0) {
    related = (all.docs as unknown[]).slice(0, 3).map(projectRelated);
  } else {
    const ranked = (all.docs as Array<{ id: number; tags?: Array<{ tag?: string | null }> | null; publishedAt?: string | null }>)
      .map((p) => {
        const others = (p.tags ?? [])
          .map((t) => t.tag)
          .filter((t): t is string => typeof t === 'string');
        const overlap = others.filter((t) => tagSet.has(t)).length;
        return { post: p, overlap };
      })
      .filter((r) => r.overlap > 0)
      .sort((a, b) => {
        if (b.overlap !== a.overlap) return b.overlap - a.overlap;
        const ad = a.post.publishedAt ? new Date(a.post.publishedAt).getTime() : 0;
        const bd = b.post.publishedAt ? new Date(b.post.publishedAt).getTime() : 0;
        return bd - ad;
      })
      .slice(0, 3);

    related = ranked.map((r) => projectRelated(r.post));

    if (related.length < 3) {
      const have = new Set(related.map((r) => r.id));
      const fillers = (all.docs as Array<{ id: number }>)
        .filter((p) => !have.has(p.id))
        .slice(0, 3 - related.length);
      related.push(...fillers.map(projectRelated));
    }
  }

  // SEO JSON-LD. Authors can override via seo.structuredDataOverride in
  // Payload — the override replaces the auto-generated schema entirely.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || 'https://hampshirepaddockmanagement.com';
  const seoBlock = post.seo as { structuredDataOverride?: unknown } | null | undefined;
  const articleSchema = seoBlock?.structuredDataOverride ?? {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    image: heroUrl ? [heroUrl] : undefined,
    datePublished: post.publishedAt ?? undefined,
    author: { '@type': 'Person', name: 'Tom Oswald' },
    publisher: {
      '@type': 'Organization',
      name: 'Hampshire Paddock Management',
    },
    mainEntityOfPage: `${siteUrl.replace(/\/$/, '')}/notes/${post.slug}`,
  };

  const breadcrumbHref = primaryTag ? `/notes?tag=${primaryTag}` : '/notes';
  const breadcrumbLabel = primaryTag
    ? primaryTag.replace(/-/g, ' ').replace(/^\w/, (c: string) => c.toUpperCase())
    : 'Notes from the field';

  return (
    <>
      <Script
        id="post-schema"
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLd(articleSchema) }}
      />

      {/* ===== POST HERO ===== */}
      <section className={styles.postHero}>
        <Nav variant="overlay" />
        {heroUrl && (
          <div className={styles.postHeroPhoto}>
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
        <div className={styles.postHeroInner}>
          {/* Title appears in the h1 below, so it isn't repeated as a
              terminal crumb — the trail just gets the user back to the
              filtered index for the same tag. */}
          <Breadcrumb
            items={[
              { label: 'Notes', href: '/notes' },
              { label: breadcrumbLabel, href: primaryTag ? breadcrumbHref : undefined },
            ]}
          />
          <h1 className={styles.postTitle}>{post.title}</h1>
          <div className={styles.postHeroMeta}>
            {primaryTag && <span className={styles.postHeroTag}>{primaryTag}</span>}
            {post.publishedAt && <span>{formatMonth(post.publishedAt)}</span>}
            <span>{readMinutes} min read</span>
          </div>
        </div>
      </section>

      {/* ===== ARTICLE BODY ===== */}
      <article className={styles.article}>
        {Array.isArray(content) &&
          content.map((block, i) => {
            if (block && typeof block === 'object' && (block as { blockType?: string }).blockType === 'richText') {
              return (
                <div key={i}>
                  {renderLexical(
                    (block as { content?: unknown }).content as never,
                    { mediaById: mediaById as never },
                  )}
                </div>
              );
            }
            return null;
          })}
      </article>

      {/* ===== SERVICE CTA — only when primary tag has a service mapping ===== */}
      {cta && (
        <section className={styles.serviceCta}>
          <div className={styles.serviceCtaInner}>
            <div>
              <div className={styles.serviceCtaEyebrow}>Want this done for you?</div>
              <h3 className={styles.serviceCtaTitle}>
                I {cta.verb} across <em>Hampshire and surrounding counties</em>
              </h3>
              <p className={styles.serviceCtaSub}>
                Most jobs quoted over the phone. No site visit fee.
              </p>
            </div>
            <Link href={`/services/${cta.slug}`} className={styles.serviceCtaBtn}>
              See {cta.label.toLowerCase()} →
            </Link>
          </div>
        </section>
      )}

      {/* ===== SIGN-OFF ===== */}
      <div className={styles.signoff}>
        <div className={styles.signoffPhoto} aria-hidden="true" />
        <div className={styles.signoffText}>
          <strong>Tom Oswald</strong>
          Owner-operator at Hampshire Paddock Management. Writes from the seat
          of a tractor.
        </div>
      </div>

      {/* ===== RELATED POSTS ===== */}
      {related.length > 0 && (
        <section className={styles.related}>
          <div className={styles.relatedInner}>
            <div className={styles.relatedEyebrow}>Related</div>
            <h3 className={styles.relatedTitle}>
              Keep <em>reading</em>
            </h3>
            <div className={styles.relatedGrid}>
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/notes/${r.slug}`}
                  className={styles.relatedCard}
                >
                  {r.hero?.url && (
                    <div className={styles.relatedPhoto}>
                      <Image
                        src={r.hero.url}
                        alt={r.hero.alt}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1100px) 50vw, 33vw"
                        style={{ objectFit: 'cover' }}
                      />
                    </div>
                  )}
                  <div className={styles.relatedBody}>
                    <div className={styles.relatedMeta}>
                      {r.primaryTag && (
                        <span className={styles.relatedTag}>{r.primaryTag}</span>
                      )}
                      {r.publishedAt && <span>{formatMonth(r.publishedAt)}</span>}
                    </div>
                    <div className={styles.relatedHeading}>{r.title}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </>
  );
}
