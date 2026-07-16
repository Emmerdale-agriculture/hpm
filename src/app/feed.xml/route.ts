import { getPayload } from 'payload';
import config from '@payload-config';

/**
 * RSS 2.0 feed of published posts. Discoverable via the <link rel="alternate">
 * in the root layout; regenerated hourly like the rest of the public pages.
 */

export const revalidate = 3600;

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://hampshirepaddockmanagement.com'
).replace(/\/$/, '');

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

type FeedPost = {
  slug?: string | null;
  title?: string | null;
  excerpt?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
};

export async function GET() {
  // A DB blip must not 500 the feed at build time — degrade to an empty
  // channel; ISR backfills items on the next successful regeneration.
  let posts: FeedPost[] = [];
  try {
    const payload = await getPayload({ config });
    const res = await payload.find({
      collection: 'posts',
      where: {
        _status: { equals: 'published' },
        'seo.noIndex': { not_equals: true },
      },
      limit: 50,
      sort: '-publishedAt',
      depth: 0,
      select: { slug: true, title: true, excerpt: true, publishedAt: true, updatedAt: true },
    });
    posts = res.docs as FeedPost[];
  } catch (err) {
    console.error('[feed.xml] DB query failed — serving empty channel:', err);
  }

  const items = posts
    .filter((p) => typeof p.slug === 'string' && p.title)
    .map((p) => {
      const url = `${SITE_URL}/notes/${p.slug}`;
      const pubDate = p.publishedAt ? new Date(p.publishedAt).toUTCString() : null;
      return [
        '    <item>',
        `      <title>${esc(p.title!)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        ...(pubDate ? [`      <pubDate>${pubDate}</pubDate>`] : []),
        ...(p.excerpt ? [`      <description>${esc(p.excerpt)}</description>`] : []),
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const lastBuildDate = posts[0]?.publishedAt
    ? new Date(posts[0].publishedAt!).toUTCString()
    : new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Hampshire Paddock Management — Notes from the field</title>
    <link>${SITE_URL}/notes</link>
    <description>Practical advice on paddocks, weeds, kit, and seasonal jobs — written from the seat of a tractor.</description>
    <language>en-GB</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
}
