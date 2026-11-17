import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time bearer-token check for the cron + manual /run routes.
 *
 * Returns `null` if authorised, or a Response (401/500) to return
 * straight from the handler. Same secret guards both routes.
 */
export function checkCronAuth(req: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return new Response(JSON.stringify({ ok: false, error: 'CRON_SECRET not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
  const authHeader = req.headers.get('authorization') ?? '';
  const expectedHeader = `Bearer ${expected}`;
  const got = Buffer.from(authHeader);
  const want = Buffer.from(expectedHeader);
  // The length guard is required: timingSafeEqual throws RangeError on
  // mismatched buffer lengths. The remaining length-oracle leak is
  // non-actionable here — CRON_SECRET is server-configured and never
  // changes per request.
  const ok = got.length === want.length && timingSafeEqual(got, want);
  if (!ok) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorised' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  return null;
}
