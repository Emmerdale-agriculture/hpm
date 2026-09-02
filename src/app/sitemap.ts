import type { MetadataRoute } from 'next';
import { getPayload } from 'payload';
import config from '@payload-config';
import { CURATED_TAGS } from '@/lib/tags';

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://hampshirepaddockmanagement.com'
).replace(/\/$/, '');

// Without this, Next.js generates the sitemap at build time only, so
// posts/services published after deploy don't appear until the next push.
// 1h ISR matches the rest of the public pages.
export const revalidate = 3600;

// Static routes: the date the page's copy or template last materially
// changed. BUMP THE DATE when you edit one of these pages. This used to be
// `new Date()` on every hourly regeneration, which told Google all ten
// pages changed every hour; Google stops trusting lastmod once it sees
// that, and on a crawl-starved domain that discards a real signal.
// Index pages (/, /services, /notes) take the newest content date instead.
const STATIC_LASTMOD: Record<string, string> = {
  '/paddock-maintenance': '2026-09-01',
  '/carbide-mole-plough': '2026-08-13',
  '/pricing': '2026-07-14',
  '/gallery': '2026-06-10',
  '/about': '2026-06-10',
  '/contact': '2026-06-10',
  '/privacy': '2026-06-03',
};

const newest = (docs: Array<{ updatedAt?: string | null }>, fallback: Date): Date =>
  docs.reduce((max, d) => {
    const t = d.updatedAt ? new Date(d.updatedAt) : null;
    return t && t > max ? t : max;
  }, fallback);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  // Only used when the DB is unreachable (see the try/catch below).
  const staticFallback = new Date('2026-09-01');

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/paddock-maintenance`, lastModified: new Date(STATIC_LASTMOD['/paddock-maintenance']), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/carbide-mole-plough`, lastModified: new Date(STATIC_LASTMOD['/carbide-mole-plough']), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/pricing`,  lastModified: new Date(STATIC_LASTMOD['/pricing']), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/gallery`,  lastModified: new Date(STATIC_LASTMOD['/gallery']), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/about`,    lastModified: new Date(STATIC_LASTMOD['/about']), changeFrequency: 'yearly',  priority: 0.6 },
    { url: `${SITE_URL}/contact`,  lastModified: new Date(STATIC_LASTMOD['/contact']), changeFrequency: 'yearly',  priority: 0.9 },
    { url: `${SITE_URL}/privacy`,  lastModified: new Date(STATIC_LASTMOD['/privacy']), changeFrequency: 'yearly',  priority: 0.3 },
  ];

  // Index pages default to the fallback; overwritten below from real data.
  let homeLastMod = staticFallback;
  let servicesLastMod = staticFallback;
  let notesLastMod = staticFallback;

  // A transient DB error here must NOT fail the whole deploy — Next prerenders
  // the sitemap at build time, so a build-time connection blip would otherwise
  // abort the build. Degrade to the static routes on failure; ISR (revalidate)
  // backfills the dynamic entries on the next successful regeneration.
  let dynamicPages: MetadataRoute.Sitemap = [];
  try {
    const payload = await getPayload({ config });

    const [services, posts] = await Promise.all([
      payload.find({
        collection: 'services',
        where: {
          category: { exists: true }, // skip orphan / non-canonical entries
          // noIndex pages must not be advertised — conflicting signals.
          'seo.noIndex': { not_equals: true },
        },
        limit: 500,
        depth: 0,
        select: { slug: true, updatedAt: true },
      }),
      payload.find({
        collection: 'posts',
        where: {
          _status: { equals: 'published' },
          'seo.noIndex': { not_equals: true },
        },
        limit: 1000,
        depth: 0,
        select: { slug: true, updatedAt: true, tags: true },
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

    // Tag hubs (/notes/tag/*): only advertise hubs with enough posts to be
    // a real landing page — thin 1-2 post hubs stay reachable via the chip
    // links but aren't put in front of the crawler.
    const tagLastMod = new Map<string, Date>();
    const tagCount = new Map<string, number>();
    for (const p of posts.docs) {
      const tags = (p.tags ?? []) as Array<{ tag?: string | null }>;
      const updated = p.updatedAt ? new Date(p.updatedAt) : now;
      for (const t of tags) {
        if (!t.tag) continue;
        tagCount.set(t.tag, (tagCount.get(t.tag) ?? 0) + 1);
        const prev = tagLastMod.get(t.tag);
        if (!prev || updated > prev) tagLastMod.set(t.tag, updated);
      }
    }
    const tagHubPages: MetadataRoute.Sitemap = CURATED_TAGS
      .filter((t) => (tagCount.get(t.slug) ?? 0) >= 3)
      .map((t) => ({
        url: `${SITE_URL}/notes/tag/${t.slug}`,
        lastModified: tagLastMod.get(t.slug) ?? now,
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      }));

    dynamicPages = [...servicePages, ...postPages, ...tagHubPages];

    servicesLastMod = newest(services.docs, new Date(STATIC_LASTMOD['/paddock-maintenance']));
    notesLastMod = newest(posts.docs, staticFallback);
    homeLastMod = servicesLastMod > notesLastMod ? servicesLastMod : notesLastMod;
  } catch (err) {
    console.error('[sitemap] DB query failed — serving static routes only:', err);
  }

  const indexPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`,         lastModified: homeLastMod,     changeFrequency: 'monthly', priority: 1.0 },
    { url: `${SITE_URL}/services`, lastModified: servicesLastMod, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/notes`,    lastModified: notesLastMod,    changeFrequency: 'weekly',  priority: 0.8 },
  ];

  return [...indexPages, ...staticPages, ...dynamicPages];
}
