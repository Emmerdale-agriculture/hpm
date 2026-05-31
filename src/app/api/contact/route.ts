import { Resend } from 'resend';
import { getPayload } from 'payload';
import config from '@payload-config';
import { SITE_EMAIL } from '@/lib/site';

/**
 * POST /api/contact — receives the contact form and emails Tom via Resend.
 *
 * Validation:
 *   - name, phone, location required (server-side, never trust client)
 *   - honeypot field 'website' must be empty
 *   - message capped at 5000 chars
 *
 * Rate-limit:
 *   In-process token bucket per IP (10 req / hour). Sufficient for a
 *   single Vercel instance; if/when this scales horizontally, swap for
 *   Upstash Redis or similar shared store.
 */

const RATE_LIMIT_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

// Cap on distinct IPs tracked at once; prevents the Map from growing
// unbounded on a long-lived instance (slow memory leak otherwise).
const MAX_BUCKETS = 10_000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    // Opportunistically prune expired entries when the Map gets large so
    // it can't grow without bound across many unique IPs.
    if (buckets.size >= MAX_BUCKETS) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt < now) buckets.delete(key);
      }
    }
    buckets.set(ip, { count: 1, resetAt: now + HOUR_MS });
    return false;
  }
  b.count++;
  return b.count > RATE_LIMIT_PER_HOUR;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function formatBody(d: {
  name: string;
  phone: string;
  email: string;
  location: string;
  service: string;
  message: string;
}): string {
  return [
    `New enquiry from the website:`,
    ``,
    `Name:     ${d.name}`,
    `Phone:    ${d.phone}`,
    `Email:    ${d.email || '(not given)'}`,
    `Location: ${d.location}`,
    `Service:  ${d.service || '(not specified)'}`,
    ``,
    `Message:`,
    d.message || '(none)',
  ].join('\n');
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const name = String(b.name ?? '').trim();
  const phone = String(b.phone ?? '').trim();
  const emailRaw = String(b.email ?? '').trim();
  const email = emailRaw && isEmail(emailRaw) ? emailRaw : '';
  const location = String(b.location ?? '').trim();
  const service = String(b.service ?? '').trim();
  const message = String(b.message ?? '').trim();
  // Forwarded from a `?subject=…` URL param. Currently only `contract`
  // is recognised — flagged in the email subject so contract-pipeline
  // enquiries are distinguishable in Tom's inbox.
  const enquirySubject = String(b.enquirySubject ?? '').trim();
  // Honeypot — if any value, bot. 200 to keep them quiet.
  const trap = String(b.website ?? '').trim();

  if (trap) {
    return Response.json({ ok: true });
  }
  if (!name || !phone || !location) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (message.length > 5000) {
    return Response.json({ error: 'Message too long' }, { status: 400 });
  }

  // Persist the lead first so nothing is lost if the email send fails.
  // Non-fatal: a DB hiccup should not block the (more important) email.
  try {
    const payload = await getPayload({ config });
    await payload.create({
      collection: 'enquiries',
      data: {
        name,
        // Enquiries.email is required; fall back to a syntactically valid
        // `.invalid` placeholder when the enquirer left it blank.
        email: email || `no-email-${Date.now()}@placeholder.invalid`,
        phone,
        location,
        message: service ? `[Service: ${service}]\n\n${message || '(none)'}` : message || '(none)',
        status: 'new',
        meta: {
          ip,
          userAgent: req.headers.get('user-agent') ?? undefined,
          referer: req.headers.get('referer') ?? undefined,
        },
      },
    });
  } catch (err) {
    console.warn('[contact] payload persist failed:', (err as Error).message);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY missing');
    return Response.json({ error: 'Email service unavailable' }, { status: 503 });
  }

  const resend = new Resend(apiKey);
  const from =
    process.env.EMAIL_FROM ||
    process.env.CONTACT_FORM_FROM ||
    'HPM website <noreply@hampshirepaddockmanagement.com>';

  try {
    const { error } = await resend.emails.send({
      from,
      to: [SITE_EMAIL],
      replyTo: email || undefined,
      subject:
        enquirySubject === 'contract'
          ? `Contract maintenance enquiry from ${name}`
          : `New enquiry from ${name}${service ? ` — ${service}` : ''}`,
      text: formatBody({ name, phone, email, location, service, message }),
    });
    if (error) {
      console.error('[contact] resend error', error);
      return Response.json({ error: 'Email send failed' }, { status: 502 });
    }
  } catch (err) {
    console.error('[contact] resend threw', err);
    return Response.json({ error: 'Email send failed' }, { status: 502 });
  }

  return Response.json({ ok: true });
}
