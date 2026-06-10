import { withPayload } from '@payloadcms/next/withPayload';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // React 19 strict mode — catches accidental side-effects
  reactStrictMode: true,

  // Let middleware handle trailing-slash redirects so legacy WP URLs
  // (/paddock-topping/ → /services/paddock-topping) resolve in a single
  // 301 instead of a 308 → 301 chain.
  skipTrailingSlashRedirect: true,

  // Image optimisation: allow Supabase storage as an approved remote host
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'unakyuksioglmihvipmi.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'unakyuksioglmihvipmi.storage.supabase.co',
        pathname: '/**',
      },
    ],
    // Modern formats — Next will serve AVIF/WebP to browsers that support them
    formats: ['image/avif', 'image/webp'],
    // Trimmed responsive widths — every entry here multiplies how many
    // optimisations next/image queues per page. With ~15 service tiles
    // each fanning out a srcset, the previous 7+8 entries hit 130+
    // concurrent Sharp jobs and saturated the dev optimizer (504s).
    // 828 fills the 640→1080 gap: card slots (~360px CSS) on 2x displays
    // need ~720px files and were jumping to 1080 (≈40% heavier).
    deviceSizes: [640, 828, 1080, 1920],
    // Must not overlap deviceSizes — 640 here duplicated the 640w srcset entry.
    imageSizes: [256, 384],
  },

  // /quote serves the contact page without a redirect — both URLs are
  // first-class CTA targets and we want the URL the user typed to stick.
  async rewrites() {
    return [
      { source: '/quote', destination: '/contact' },
    ];
  },

  // Permanent redirects for legacy WordPress URL patterns.
  // See `audit-slugs-report.md` (regenerate with scripts/audit-slugs.mjs).
  async redirects() {
    return [
      // Canonical host: www serves the site too unless redirected here.
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.hampshirepaddockmanagement.com' }],
        destination: 'https://hampshirepaddockmanagement.com/:path*',
        permanent: true,
      },
      // Services renamed during the rebuild
      { source: '/services/dung-sweeping',       destination: '/services/manure-sweeping',       permanent: true },
      { source: '/services/fertiliser-spraying', destination: '/services/fertiliser-application', permanent: true },
      { source: '/services/field-harrowing',     destination: '/services/harrowing',              permanent: true },
      { source: '/services/field-rotavating',    destination: '/services/rotavating',             permanent: true },
      { source: '/services/paddock-rolling',     destination: '/services/rolling',                permanent: true },
      { source: '/services/ragwort-pulling',     destination: '/services/weed-control',           permanent: true },
      { source: '/services/field-ploughing', destination: '/services/rotavating', permanent: true },
      // /services/hedge-cutting — kept live (Tom's call); no redirect
      // /services/seedsight — kept live; planned product reintroduction
      //   with shop at a later date.

      // Old WP root-level URLs for services we now keep live or remap.
      // (Other root-level WP service URLs are handled by the Payload
      // Redirects collection; these three aren't because their old DB
      // records pointed at /services rather than the right target.)
      { source: '/field-ploughing',  destination: '/services/rotavating',     permanent: true },
      { source: '/field-ploughing/', destination: '/services/rotavating',     permanent: true },
      { source: '/hedge-cutting',    destination: '/services/hedge-cutting',  permanent: true },
      { source: '/hedge-cutting/',   destination: '/services/hedge-cutting',  permanent: true },
      { source: '/seedsight',        destination: '/services/seedsight',      permanent: true },
      { source: '/seedsight/',       destination: '/services/seedsight',      permanent: true },

      // Blog → Notes
      { source: '/blog',       destination: '/notes',        permanent: true },
      { source: '/blog/:slug', destination: '/notes/:slug',  permanent: true },

      // WooCommerce artefacts
      { source: '/shop',              destination: '/', permanent: true },
      { source: '/shop/:path*',       destination: '/', permanent: true },
      { source: '/cart',              destination: '/', permanent: true },
      { source: '/checkout',          destination: '/', permanent: true },
      { source: '/my-account',        destination: '/', permanent: true },
      { source: '/my-account/:path*', destination: '/', permanent: true },
      { source: '/wishlist',          destination: '/', permanent: true },
      { source: '/products-compare',  destination: '/', permanent: true },

      // Other old WP paths
      { source: '/tools',  destination: '/#fleet',   permanent: true },
      { source: '/costs',  destination: '/pricing', permanent: true },
      { source: '/costs/', destination: '/pricing', permanent: true },
      { source: '/videos', destination: '/notes',    permanent: true },

      // /privacy-policy was the WP slug; new site uses /privacy.
      { source: '/privacy-policy', destination: '/privacy', permanent: true },
    ];
  },

  // Security headers applied to every response
  async headers() {
    return [
      {
        // Next's content-hashed build assets are immutable — cache them hard
        // at the browser/CDN so repeat visits don't re-fetch JS/CSS chunks.
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          // Don't allow this site to be iframed except by itself
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // MIME sniffing protection
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Referrer policy — balanced between privacy and analytics
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Opt in to modern permission controls
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // Conservative CSP: hardens clickjacking (frame-ancestors, alongside
          // X-Frame-Options), blocks <object>/<embed> plugins, and pins the
          // <base> URI. A strict script-src is intentionally omitted — Next's
          // inline bootstrap/hydration scripts would need nonce wiring first;
          // that's a worthwhile follow-up. Inline JSON-LD is a data block and
          // is unaffected by these directives.
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
          },
        ],
      },
    ];
  },

  // Payload admin runs on /admin and uses a few experimental Next features
  experimental: {
    // Required for Payload
    reactCompiler: false,
  },
};

export default withBundleAnalyzer(withPayload(nextConfig, { devBundleServerPackages: false }));
