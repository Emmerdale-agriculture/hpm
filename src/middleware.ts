import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware: consults the Payload `redirects` collection for the
 * current URL, and 301/302/410s accordingly. Results are cached in-process
 * for 60s to avoid hammering the DB on every request.
 *
 * The Payload API is used over direct DB access so middleware can stay
 * env-agnostic (runs on the edge; no pg driver).
 */

type CachedRedirect = {
  to: string | null;
  statusCode: 301 | 302 | 410;
  active: boolean;
};

type CacheEntry = {
  value: CachedRedirect | null;
  expires: number;
};

const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 500;

function evictExpiredAndTrim(now: number): void {
  // Drop expired entries on every write; if still over cap, drop the oldest
  // (insertion-order iteration on Map).
  for (const [k, v] of cache) {
    if (v.expires <= now) cache.delete(k);
  }
  while (cache.size > MAX_CACHE_ENTRIES) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

async function fetchOne(from: string, origin: string): Promise<CachedRedirect | null> {
  try {
    const url = new URL('/api/redirects', origin);
    url.searchParams.set('where[from][equals]', from);
    url.searchParams.set('where[active][equals]', 'true');
    url.searchParams.set('limit', '1');
    url.searchParams.set('depth', '0');
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      docs?: Array<{ to?: string | null; statusCode?: string; active?: boolean }>;
    };
    const doc = body.docs?.[0];
    if (!doc) return null;
    return {
      to: doc.to ?? null,
      statusCode: (Number(doc.statusCode) as 301 | 302 | 410) || 301,
      active: Boolean(doc.active),
    };
  } catch {
    return null;
  }
}

async function lookup(pathname: string, origin: string): Promise<CachedRedirect | null> {
  const now = Date.now();
  const cached = cache.get(pathname);
  if (cached && cached.expires > now) return cached.value;

  // Try exact match first, then with-trailing-slash fallback. Next strips
  // trailing slashes by default before the request arrives here, but legacy
  // WP URLs in the DB are stored with trailing slashes, so both shapes need
  // to resolve to the same redirect.
  let value = await fetchOne(pathname, origin);
  if (!value && pathname !== '/' && !pathname.endsWith('/')) {
    value = await fetchOne(pathname + '/', origin);
  }
  cache.set(pathname, { value, expires: now + TTL_MS });
  evictExpiredAndTrim(now);
  return value;
}

// Live routes owned by the Next app — never need a DB redirect lookup.
// Anything matching these short-circuits before middleware hits Payload.
// Service detail pages (/services/[slug]) deliberately aren't whitelisted:
// individual slugs may have legacy redirects in the DB.
const LIVE_PATHS = new Set<string>([
  '/',
  '/gallery',
  '/services',
  '/notes',
  '/about',
  '/contact',
  '/quote',
  '/privacy',
]);

// Static asset extensions Next dev/prod might let through to middleware.
const ASSET_EXT = /\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|map|txt|xml|woff2?|ttf|otf|mp4|webm|pdf)$/i;

/**
 * Vercel preview deployments serve identical content to production with the
 * default `index, follow` robots meta — Google indexes them as a separate
 * host, splitting authority signals from production. Tell crawlers to skip
 * any non-production host. The page-level canonical link is preserved.
 */
function isNonCanonicalHost(req: NextRequest): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase();
  return host.endsWith('.vercel.app');
}

function withSeoHeaders(res: NextResponse, req: NextRequest): NextResponse {
  if (isNonCanonicalHost(req)) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip internal and static
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/admin') ||
    pathname === '/favicon.ico' ||
    ASSET_EXT.test(pathname)
  ) {
    return withSeoHeaders(NextResponse.next(), req);
  }

  // Fast path: live app routes have no legacy redirects, so skip the DB hit.
  // Strip a single trailing slash for the match (Next normalises these anyway).
  const normalised = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  if (LIVE_PATHS.has(normalised)) {
    return withSeoHeaders(NextResponse.next(), req);
  }

  const hit = await lookup(pathname, req.nextUrl.origin);
  if (!hit || !hit.active) return withSeoHeaders(NextResponse.next(), req);

  if (hit.statusCode === 410) {
    return withSeoHeaders(new NextResponse('Gone', { status: 410 }), req);
  }
  if (hit.to) {
    const dest = hit.to.startsWith('http')
      ? hit.to
      : new URL(hit.to, req.nextUrl.origin).toString();
    return withSeoHeaders(NextResponse.redirect(dest, hit.statusCode), req);
  }
  return withSeoHeaders(NextResponse.next(), req);
}

export const config = {
  matcher: ['/((?!_next/|api/|admin|favicon.ico).*)'],
};
