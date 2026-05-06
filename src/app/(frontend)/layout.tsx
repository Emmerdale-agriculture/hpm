import type { Metadata } from 'next';
import Script from 'next/script';
import { Tenor_Sans, DM_Sans } from 'next/font/google';
import './globals.css';
import { SITE_EMAIL, SITE_PHONE_TEL } from '@/lib/site';
import { jsonLd } from '@/lib/jsonld';

// Hampshire Green typography stack.
// Tenor Sans = display headings (gentle, editorial)
// DM Sans    = body (clean, reads well at small sizes)
// `display: 'optional'` on Tenor (the hero h1 font) prevents the
// FOUT-driven CLS that pushed homepage CLS to 0.121. The browser waits
// up to 100ms for the custom font, then permanently uses the fallback —
// no swap, no shift. `adjustFontFallback` is the default in Next 15.x
// but stated explicitly so future rotations don't lose the size-adjust
// metrics.
const tenor = Tenor_Sans({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'optional',
  adjustFontFallback: true,
});

// Body font stays on `swap` — DM Sans's metrics are close enough to the
// system fallback that the swap doesn't cause a measurable shift.
const dm = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
  adjustFontFallback: true,
});

// Default metadata — individual pages override as needed.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: {
    // GSC audit (2026-04-26) showed "paddock maintenance" at 303 impressions
    // with avg position 19.8 — page 2. Including the exact phrase in the
    // homepage title nudges it onto page 1 over time.
    default: 'Paddock Maintenance Hampshire — Hampshire Paddock Management',
    template: '%s | Hampshire Paddock Management',
  },
  description:
    'Professional paddock maintenance across Hampshire, Wiltshire, Berkshire, Surrey, Dorset and East Sussex. Topping, harrowing, rolling, drainage, fertiliser — compact machinery on grass tyres, no ruts.',
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    siteName: 'Hampshire Paddock Management',
    images: [{ url: '/og-default.jpg', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Google Analytics 4 measurement ID. Override via env if a separate
// property is ever wired up (e.g. for staging).
const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-B56TGXHP73';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Plausible: cookieless, no PII, no consent banner needed (privacy
  // policy commits to this). Only loaded in production so dev hits
  // don't pollute the live dashboard.
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const enablePlausible =
    process.env.NODE_ENV === 'production' && plausibleDomain;

  // GA4 alongside Plausible — production-only so dev navigation doesn't
  // pollute the live dashboard.
  const enableGA = process.env.NODE_ENV === 'production' && GA_MEASUREMENT_ID;

  // Sitewide LocalBusiness JSON-LD. Anchored with a stable @id so per-page
  // schema (Service blocks on /paddock-maintenance and /services/*) can
  // reference it via { "provider": { "@id": "..." } } in future, and Google
  // treats the business as a single entity rather than re-deriving it per page.
  // Drives "near me" intent — no street address yet (sole trader, no public
  // forecourt) but addressRegion + areaServed give Google a geographic anchor.
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || 'https://hampshirepaddockmanagement.com'
  ).replace(/\/$/, '');
  const localBusinessJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${siteUrl}/#business`,
    name: 'Hampshire Paddock Management',
    legalName: 'Emmerdale Agriculture Limited',
    url: siteUrl,
    telephone: SITE_PHONE_TEL,
    email: SITE_EMAIL,
    image: `${siteUrl}/og-default.jpg`,
    priceRange: '££',
    address: {
      '@type': 'PostalAddress',
      addressRegion: 'Hampshire',
      addressCountry: 'GB',
    },
    areaServed: [
      { '@type': 'AdministrativeArea', name: 'Hampshire' },
      { '@type': 'AdministrativeArea', name: 'Wiltshire' },
      { '@type': 'AdministrativeArea', name: 'Berkshire' },
      { '@type': 'AdministrativeArea', name: 'Surrey' },
      { '@type': 'AdministrativeArea', name: 'Dorset' },
      { '@type': 'AdministrativeArea', name: 'West Sussex' },
      { '@type': 'AdministrativeArea', name: 'East Sussex' },
    ],
    serviceType: 'Paddock maintenance',
  };

  return (
    <html lang="en-GB" className={`${tenor.variable} ${dm.variable}`}>
      <body>{children}</body>
      {/* JSON-LD must render in the initial HTML — use a plain <script>,
          not next/script (which is lazy / client-side only). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(localBusinessJsonLd) }}
      />
      {enablePlausible && (
        <Script
          defer
          data-domain={plausibleDomain}
          src="https://plausible.io/js/script.js"
          strategy="afterInteractive"
        />
      )}
      {enableGA && (
        <>
          {/* `lazyOnload` defers GA until after the page is idle, so the
              ~170 KiB / ~150 ms it costs doesn't sit on the critical path
              or contribute to TBT. The pageview still fires reliably. */}
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="lazyOnload"
          />
          <Script id="ga4-init" strategy="lazyOnload">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}');
            `}
          </Script>
        </>
      )}
    </html>
  );
}
