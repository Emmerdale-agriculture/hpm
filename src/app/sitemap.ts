import type { MetadataRoute } from 'next';
import { getPayload } from 'payload';
import config from '@payload-config';

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://hampshirepaddockmanagement.com'
).replace(/\/$/, '');

// Without this, Next.js generates the sitemap at build time only, so
// posts/services published after deploy don't appear until the next push.
// 1h ISR matches the rest of the public pages.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await getPayload({ config });

  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`,         lastModified: now, changeFrequency: 'monthly', priority: 1.0 },
    { url: `${SITE_URL}/services`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/paddock-maintenance`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/gallery`,  lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/notes`,    lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${SITE_URL}/about`,    lastModified: now, changeFrequency: 'yearly',  priority: 0.6 },
    { url: `${SITE_URL}/contact`,  lastModified: now, changeFrequency: 'yearly',  priority: 0.9 },
    { url: `${SITE_URL}/privacy`,  lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ];

  const [services, posts] = await Promise.all([
    payload.find({
      collection: 'services',
      where: { category: { exists: true } }, // skip orphan / non-canonical entries
      limit: 500,
      depth: 0,
      select: { slug: true, updatedAt: true },
    }),
    payload.find({
      collection: 'posts',
      where: { _status: { equals: 'published' } },
      limit: 1000,
      depth: 0,
      select: { slug: true, updatedAt: true },
    }),
  ]);

  const servicePages: MetadataRoute.Sitemap = services.docs
    .filter((s) => typeof s.slug === 'string')
    .map((s) => ({
      url: `${SITE_URL}/services/${s.slug}`,
      lastModified: s.updatedAt ? new Date(s.updatedAt) : now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));

  const postPages: MetadataRoute.Sitemap = posts.docs
    .filter((p) => typeof p.slug === 'string')
    .map((p) => ({
      url: `${SITE_URL}/notes/${p.slug}`,
      lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
      // 'monthly' (not 'yearly') — posts get edited/refreshed and the /notes
      // index is 'weekly'; aligning signals that posts can change.
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));

  return [...staticPages, ...servicePages, ...postPages];
}
