import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { getPayload } from 'payload';
import config from '@payload-config';
import { Hero } from '@/components/Hero';
import { PhoneStrip } from '@/components/PhoneStrip';
import { StatBand } from '@/components/StatBand';
import { Intro } from '@/components/Intro';
import { ServicesGrid } from '@/components/ServicesGrid';
import { HomepageGallery } from '@/components/HomepageGallery';
import { FleetSection } from '@/components/FleetSection';
import { CtaBlock } from '@/components/CtaBlock';
import { Footer } from '@/components/Footer';

export const revalidate = 3600;

export const metadata: Metadata = {
  // GSC audit (2026-04-26) showed "paddock maintenance" at 303 imp,
  // pos 19.8 (page 2). Leading the homepage title with the exact
  // phrase to nudge it onto page 1.
  // `absolute` bypasses the layout's "%s | Hampshire Paddock Management"
  // template — the brand is already in this string, so a plain string
  // title would get the brand appended a second time.
  title: { absolute: 'Paddock Maintenance Hampshire — Hampshire Paddock Management' },
  description:
    'Professional paddock maintenance across Hampshire, Wiltshire, Berkshire, Surrey, Dorset and Sussex. Topping, harrowing, rolling, drainage, fertiliser — compact machinery on grass tyres, no ruts. The person you call is the person on the tractor.',
  alternates: { canonical: '/' },
};

const getHomePageData = unstable_cache(
  async () => {
    const payload = await getPayload({ config });

    const [homepage, featured, gallery] = await Promise.all([
      payload.findGlobal({ slug: 'homepage', depth: 1 }),
      payload.find({
        collection: 'services',
        where: { featuredOnHomepage: { equals: true } },
        sort: 'orderInMenu',
        depth: 1,
        limit: 5,
      }),
      payload.find({
        collection: 'media',
        where: {
          showOnHomepageGallery: { equals: true },
          or: [
            { hideFromGallery: { equals: false } },
            { hideFromGallery: { exists: false } },
          ],
        },
        limit: 12,
        depth: 0,
      }),
    ]);

    return { homepage, featured, gallery };
  },
  ['homepage-data'],
  { revalidate: 300, tags: ['media', 'homepage', 'services'] },
);

export default async function HomePage() {
  const { homepage, featured, gallery } = await getHomePageData();

  // Fleet photo — reuse the homepage hero for now; swap when a dedicated
  // fleet shot is available
  const fleetPhoto = homepage.hero?.backgroundImage;

  return (
    <>
      <Hero backgroundImage={homepage.hero?.backgroundImage} />
      <PhoneStrip />
      <StatBand />
      <Intro />
      <ServicesGrid
        services={featured.docs.map((s) => ({
          id: s.id,
          title: s.title,
          slug: s.slug,
          homepageTagline: s.homepageTagline,
          heroImage: s.heroImage,
        }))}
      />
      <HomepageGallery images={gallery.docs} />
      <FleetSection photo={fleetPhoto} />
      <CtaBlock />
      <Footer />
    </>
  );
}
