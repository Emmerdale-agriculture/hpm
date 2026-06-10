import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPayload } from 'payload';
import config from '@payload-config';
import { SITE_EMAIL, SITE_PHONE_TEL } from '@/lib/site';

import { ServiceHero } from '@/components/ServiceHero';
import { ServiceBody } from '@/components/ServiceBody';
import { EquipmentCard, AtAGlanceCard } from '@/components/AsideCards';
import { RelatedServices } from '@/components/RelatedServices';
import { StickyQuoteCta } from '@/components/StickyQuoteCta';
import { CtaBlock } from '@/components/CtaBlock';
import { Footer } from '@/components/Footer';
import { PhoneStrip } from '@/components/PhoneStrip';
import { renderLexical, collectUploadIds } from '@/lib/lexical';
import { mediaUrl } from '@/lib/media';
import { jsonLd } from '@/lib/jsonld';

type Params = { slug: string };

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const svc = await findService(slug);
  if (!svc) return { title: 'Service not found' };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hampshirepaddockmanagement.com';
  const og = mediaUrl(svc.heroImage as Parameters<typeof mediaUrl>[0], 'hero');
  const seo =
    (svc.seo as
      | { metaTitle?: string; metaDescription?: string; canonicalUrl?: string; noIndex?: boolean }
      | null
      | undefined) ?? {};
  const canonical =
    seo.canonicalUrl?.trim() || `${siteUrl.replace(/\/$/, '')}/services/${svc.slug}`;
  const desc = seo.metaDescription || svc.shortDescription || 'Paddock management in Hampshire.';
  // If a tuned metaTitle is set in the SEO tab, use it verbatim (absolute
  // bypasses the layout template). Otherwise fall back to the bare service
  // title and let the template add " | Hampshire Paddock Management".
  const title: Metadata['title'] = seo.metaTitle
    ? { absolute: seo.metaTitle }
    : svc.title;

  return {
    title,
    description: desc,
    alternates: { canonical },
    robots: seo.noIndex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: svc.title,
      description: desc,
      url: canonical,
      type: 'website',
      images: og ? [{ url: og, width: 2000, height: 1200 }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: svc.title,
      description: desc,
      images: og ? [og] : undefined,
    },
  };
}

// Wrapped in React cache() so generateMetadata and the page render share a
// single DB query per request instead of fetching this (depth:2) doc twice.
const findService = cache(async (slug: string) => {
  const payload = await getPayload({ config });
  const res = await payload.find({
    collection: 'services',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 2, // hydrate heroImage + relatedServices + related hero images
  });
  return res.docs[0] ?? null;
});

export async function generateStaticParams() {
  const payload = await getPayload({ config });
  const res = await payload.find({
    collection: 'services',
    limit: 200,
    depth: 0,
    select: { slug: true },
  });
  return res.docs.map((d) => ({ slug: String(d.slug) }));
}

export default async function ServicePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const svc = await findService(slug);
  if (!svc) notFound();

  const payload = await getPayload({ config });

  // Related services: use the explicit relation if set, otherwise fall back
  // to any three other services. Payload returns `number | Service` when a
  // relationship is unpopulated; we drop the numbers (depth=2 populates in
  // practice) and keep the Service objects.
  type RelatedLike = {
    id: string | number;
    title: string;
    slug: string;
    homepageTagline?: string | null;
    heroImage?: Parameters<typeof mediaUrl>[0];
  };

  let related: RelatedLike[] = Array.isArray(svc.relatedServices)
    ? (svc.relatedServices.filter(
        (r): r is NonNullable<typeof r> & object => typeof r === 'object' && r !== null,
      ) as unknown as RelatedLike[])
    : [];

  if (related.length === 0) {
    const fallback = await payload.find({
      collection: 'services',
      where: { slug: { not_equals: svc.slug } },
      limit: 3,
      depth: 1,
      sort: 'orderInMenu',
    });
    related = fallback.docs as unknown as RelatedLike[];
  }

  // Body content — pull image refs so we can render <figure> inside richText
  const content = svc.content as unknown[] | null | undefined;
  const uploadIds: number[] = [];
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === 'object' && (block as { blockType?: string }).blockType === 'richText') {
        uploadIds.push(...collectUploadIds((block as { content?: unknown }).content));
      }
    }
  }
  const mediaById = new Map<number, unknown>();
  if (uploadIds.length) {
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

  // Build the rendered body from all richText blocks, concatenated
  const bodyNodes = Array.isArray(content)
    ? content.map((block, i) => {
        if (block && typeof block === 'object' && (block as { blockType?: string }).blockType === 'richText') {
          return (
            <div key={i}>
              {renderLexical((block as { content?: unknown }).content as never, { mediaById: mediaById as never })}
            </div>
          );
        }
        return null;
      })
    : null;

  // JSON-LD: Service schema. Authors can override via seo.structuredDataOverride
  // in Payload — the override replaces the auto-generated schema entirely.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hampshirepaddockmanagement.com';
  const seoBlock = svc.seo as { structuredDataOverride?: unknown } | null | undefined;
  const serviceSchema = seoBlock?.structuredDataOverride ?? {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: svc.title,
    description:
      (svc.seo as { metaDescription?: string } | null | undefined)?.metaDescription ||
      svc.shortDescription,
    url: `${siteUrl.replace(/\/$/, '')}/services/${svc.slug}`,
    provider: {
      '@type': 'LocalBusiness',
      name: 'Hampshire Paddock Management',
      telephone: SITE_PHONE_TEL,
      email: SITE_EMAIL,
      address: {
        '@type': 'PostalAddress',
        addressRegion: 'Hampshire',
        addressCountry: 'GB',
      },
    },
    areaServed: [
      { '@type': 'AdministrativeArea', name: 'Hampshire' },
      { '@type': 'AdministrativeArea', name: 'Wiltshire' },
      { '@type': 'AdministrativeArea', name: 'Berkshire' },
      { '@type': 'AdministrativeArea', name: 'Surrey' },
      { '@type': 'AdministrativeArea', name: 'Dorset' },
      { '@type': 'AdministrativeArea', name: 'Sussex' },
    ],
  };

  return (
    <>
      <ServiceHero
        title={svc.title}
        strapline={(svc as { strapline?: string | null }).strapline}
        heroImage={svc.heroImage as Parameters<typeof mediaUrl>[0]}
      />
      <PhoneStrip />
      <ServiceBody
        lede={(svc as { lede?: string | null }).lede ?? null}
        body={bodyNodes}
        aside={
          <>
            <EquipmentCard
              items={
                Array.isArray((svc as { equipment?: Array<{ name: string; spec?: string | null }> }).equipment)
                  ? (svc as { equipment?: Array<{ name: string; spec?: string | null }> }).equipment
                  : []
              }
            />
            <AtAGlanceCard
              meta={(svc as { metaHighlights?: Parameters<typeof AtAGlanceCard>[0]['meta'] }).metaHighlights}
            />
          </>
        }
      />
      <RelatedServices
        services={related.slice(0, 3).map((r) => ({
          id: r.id,
          title: r.title,
          slug: r.slug,
          homepageTagline: r.homepageTagline ?? null,
          heroImage: r.heroImage,
        }))}
      />
      <CtaBlock />
      <Footer />
      <StickyQuoteCta serviceSlug={svc.slug} serviceTitle={svc.title} />
      {/* Server-rendered JSON-LD so crawlers see it in the initial HTML
          (a plain <script>, not next/script which injects client-side). */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLd(serviceSchema) }}
      />
    </>
  );
}
