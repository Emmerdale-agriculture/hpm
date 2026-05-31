import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { getPayload } from 'payload';
import config from '@payload-config';

import { Footer } from '@/components/Footer';
import { PricingPageView } from '@/components/pricing/PricingPageView';
import { mediaUrl } from '@/lib/media';
import type { PricingPageData } from '@/lib/pricing-types';

/**
 * /pricing — Hampshire Paddock Management pricing page.
 *
 * Pulls editable content from the `pricing-page` Payload global, and a
 * cover photo + side-rail photos from the Media collection. Photos are
 * the latest non-hidden gallery images, so /gallery's hide flag carries
 * through here automatically.
 */
export const revalidate = 3600;

const PRICING_HERO_ID = 39; // Burcombe Estate Vinery — same default as /gallery

const getPricingPageData = unstable_cache(
  async () => {
    const payload = await getPayload({ config });

    // All three lookups are independent — fan them out in parallel.
    const [data, heroMedia, rail] = await Promise.all([
      payload.findGlobal({ slug: 'pricing-page', depth: 0 }) as Promise<
        unknown
      > as Promise<PricingPageData>,
      payload
        .findByID({ collection: 'media', id: PRICING_HERO_ID, depth: 0 })
        .catch(() => null),
      payload.find({
        collection: 'media',
        where: {
          mimeType: { contains: 'image/' },
          or: [
            { hideFromGallery: { equals: false } },
            { hideFromGallery: { exists: false } },
          ],
        },
        sort: '-createdAt',
        limit: 8,
        depth: 0,
      }),
    ]);

    return {
      data,
      heroMedia: heroMedia as Parameters<typeof mediaUrl>[0],
      railPhotos: rail.docs,
    };
  },
  ['pricing-page-data'],
  { revalidate: 300, tags: ['media', 'pricing-page'] },
);

export async function generateMetadata(): Promise<Metadata> {
  const { data, heroMedia } = await getPricingPageData();
  // Use the pricing hero as the social preview image instead of the generic
  // site default.
  const ogImage = mediaUrl(heroMedia, 'large') ?? mediaUrl(heroMedia);
  return {
    title: data.metaTitle,
    description: data.metaDescription,
    alternates: { canonical: '/pricing' },
    openGraph: {
      title: data.metaTitle,
      description: data.metaDescription,
      type: 'website',
      url: '/pricing',
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  };
}

export default async function PricingPage() {
  const { data, heroMedia, railPhotos } = await getPricingPageData();
  const heroUrl = mediaUrl(heroMedia, 'hero') ?? mediaUrl(heroMedia);
  const heroAlt =
    (typeof heroMedia === 'object' && heroMedia?.alt) || 'Hampshire paddock work';

  const railUrls = railPhotos
    .map((m) => ({
      url: mediaUrl(m, 'card') ?? mediaUrl(m),
      alt: m.alt ?? '',
      id: m.id,
    }))
    .filter((p): p is { url: string; alt: string; id: number } => Boolean(p.url));

  return (
    <>
      <PricingPageView
        data={data}
        heroUrl={heroUrl}
        heroAlt={heroAlt}
        railPhotos={railUrls}
      />
      <Footer />
    </>
  );
}
