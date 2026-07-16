import { unstable_cache } from 'next/cache';
import { getPayload } from 'payload';
import config from '@payload-config';

import { mediaUrl } from '@/lib/media';
import type { NoteCard } from './types';

export const NOTES_HERO_MEDIA_ID = 39; // Burcombe Estate Vinery — wide landscape

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

/**
 * Single cached query behind /notes AND every /notes/tag/[tag] hub — the
 * hubs filter this in memory rather than issuing their own DB queries.
 */
export const getNotesData = unstable_cache(
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

/** Published-post count per curated tag, for chips + sitemap gating. */
export function countByTag(posts: NoteCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of posts) {
    for (const t of p.tags) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return counts;
}
