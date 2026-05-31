/**
 * GET /api/seo-agent — weekly cron entrypoint.
 *
 * Authenticated by the `Authorization: Bearer <CRON_SECRET>` header
 * Vercel sends to scheduled invocations. Same path is used for the
 * manual trigger via /api/seo-agent/run (POST).
 *
 * Schedule is defined in vercel.json: Mondays 07:00 UTC.
 */

import { NextResponse } from 'next/server';
import { runAgent } from './lib/orchestrate';
import { sendDigest } from './lib/digest';
import { checkCronAuth } from './lib/auth';

// Brief: GSC pull + classification + 3 article generations can take 90–180s.
// Vercel cron is bounded by the function's maxDuration, not the cron config.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const unauth = checkCronAuth(req);
  if (unauth) return unauth;

  try {
    const summary = await runAgent({ dryRun: false });

    // Always send the digest — even quiet weeks. Brief §9.
    const to = process.env.DIGEST_TO_EMAIL;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://hampshirepaddockmanagement.com';
    if (to) {
      const result = await sendDigest({ summary, to, siteUrl });
      if (!result.ok) {
        summary.errors.push(`Digest send failed: ${result.error}`);
      }
    } else {
      summary.errors.push('DIGEST_TO_EMAIL not set — digest skipped');
    }

    return NextResponse.json({
      ok: true,
      runId: summary.runId,
      week: summary.weekIdentified,
      counts: summary.counts,
      errors: summary.errors,
    });
  } catch (err) {
    // Never let an unexpected throw leak a stack trace to the caller, and
    // make the cron failure visible in logs rather than a silent 500.
    console.error('[seo-agent] run failed:', err);
    return NextResponse.json({ ok: false, error: 'internal error' }, { status: 500 });
  }
}
