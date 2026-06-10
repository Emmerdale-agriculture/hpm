import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { getPayload } from 'payload';
import config from '@payload-config';

import { Nav } from '@/components/Nav';
import { Breadcrumb } from '@/components/Breadcrumb';
import { PhoneStrip } from '@/components/PhoneStrip';
import { Footer } from '@/components/Footer';
import { CtaBlock } from '@/components/CtaBlock';
import { mediaUrl } from '@/lib/media';
import { SERVICE_CATEGORIES } from '@/lib/services';
import styles from './services.module.css';

export const metadata: Metadata = {
  // Bare title — the layout template appends " | Hampshire Paddock Management".
  title: 'Services',
  description:
    'Cutting, ground care, and treatment & upkeep services for paddocks and smallholdings across Hampshire, Wiltshire, Berkshire, Surrey, Dorset and Sussex.',
  alternates: { canonical: '/services' },
};

export const revalidate = 3600;

type ServiceDoc = {
  id: string | number;
  title: string;
  slug: string;
  shortDescription?: string | null;
  homepageTagline?: string | null;
  category?: string | null;
  heroImage?: Parameters<typeof mediaUrl>[0];
};

// John Deere 6250R — flagship tractor photo used as the /services hero.
const SERVICES_HERO_MEDIA_ID = 174;

// Cache the service list + hero lookup so we don't re-query Payload on every
// request (the homepage does the same). Revalidated via the 'services'/'media'
// tags when content changes in Payload.
const getServicesPageData = unstable_cache(
  async () => {
    const payload = await getPayload({ config });
    const res = await payload.find({
      collection: 'services',
      sort: 'orderInMenu',
      limit: 100,
      depth: 1,
      where: { category: { exists: true } },
    });

    let heroMedia: Parameters<typeof mediaUrl>[0] = null;
    try {
      heroMedia = await payload.findByID({
        collection: 'media',
        id: SERVICES_HERO_MEDIA_ID,
        depth: 0,
      });
    } catch {
      heroMedia = null;
    }
    return { docs: res.docs as unknown as ServiceDoc[], heroMedia };
  },
  ['services-index-data'],
  { revalidate: 300, tags: ['services', 'media'] },
);

export default async function ServicesIndexPage() {
  const { docs, heroMedia } = await getServicesPageData();
  const heroUrl = mediaUrl(heroMedia, 'large') ?? mediaUrl(heroMedia);
  const heroAlt =
    (typeof heroMedia === 'object' && heroMedia?.alt) ||
    'John Deere 6250R — Hampshire Paddock Management';

  const byCategory: Record<string, ServiceDoc[]> = {};
  for (const doc of docs) {
    if (!doc.category) continue;
    (byCategory[doc.category] ??= []).push(doc);
  }

  return (
    <>
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
        <div className={styles.heroContent}>
          <Breadcrumb items={[{ label: 'Services' }]} />
          <h1 className={styles.title}>Services.</h1>
          <p className={styles.strapline}>
            Cutting &amp; mowing, ground care, treatment &amp; upkeep — across
            Hampshire and the surrounding counties.
          </p>
        </div>
      </section>
      <PhoneStrip />

      <div className={styles.sections}>
        {SERVICE_CATEGORIES.map((cat) => {
          const items = byCategory[cat.key] ?? [];
          if (items.length === 0) return null;
          return (
            <section key={cat.key} className={styles.catSection}>
              <div className={styles.catHead}>
                <div className={styles.eyebrow}>— {cat.label}</div>
              </div>
              <div className={styles.grid}>
                {items.map((s) => (
                  <ServiceCard key={s.id} service={s} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <CtaBlock />
      <Footer />
    </>
  );
}

function ServiceCard({ service }: { service: ServiceDoc }) {
  // 'large' variant first, fall back to original; see ServicesGrid.
  const url =
    mediaUrl(service.heroImage, 'large') ?? mediaUrl(service.heroImage);
  const alt =
    (typeof service.heroImage === 'object' && service.heroImage?.alt) ||
    service.title;
  return (
    <Link href={`/services/${service.slug}`} className={styles.tile}>
      <div className={styles.photo}>
        {url && (
          <Image
            src={url}
            alt={alt}
            fill
            sizes="(max-width: 900px) 100vw, 33vw"
            style={{ objectFit: 'cover' }}
          />
        )}
      </div>
      <div className={styles.overlay} />
      <div className={styles.meta}>
        {service.homepageTagline && <div className={styles.tag}>{service.homepageTagline}</div>}
        <div className={styles.name}>{service.title}</div>
        {service.shortDescription && (
          <div className={styles.desc}>{service.shortDescription}</div>
        )}
      </div>
    </Link>
  );
}
