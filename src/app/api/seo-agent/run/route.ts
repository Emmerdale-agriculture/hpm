/**
 * POST /api/seo-agent/run — manual off-cycle trigger.
 *
 * Same auth as the cron: `Authorization: Bearer <CRON_SECRET>`.
 * Useful for re-running a week's data after fixing a bug, or running
 * during the dry-run rollout phase.
 */

import { NextResponse } from 'next/server';
import { runAgent } from '../lib/orchestrate';
import { sendDigest } from '../lib/digest';
import { checkCronAuth } from '../lib/auth';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const unauth = checkCronAuth(req);
  if (unauth) return unauth;

  // Optional flags via query string:
  //   ?dryRun=1    — don't write to Payload, don't send email
  //   ?sendEmail=1 — send digest even when dryRun (to test email render)
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === '1';
  const sendEmail = url.searchParams.get('sendEmail') === '1' || !dryRun;

  try {
    const summary = await runAgent({ dryRun });

    const to = process.env.DIGEST_TO_EMAIL;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://hampshirepaddockmanagement.com';
    if (sendEmail && to) {
      const result = await sendDigest({ summary, to, siteUrl });
      if (!result.ok) summary.errors.push(`Digest send failed: ${result.error}`);
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      runId: summary.runId,
      week: summary.weekIdentified,
      counts: summary.counts,
      errors: summary.errors,
      opportunities: dryRun ? summary.opportunities : undefined,
    });
  } catch (err) {
    console.error('[seo-agent] manual run failed:', err);
    return NextResponse.json({ ok: false, error: 'internal error' }, { status: 500 });
  }
}
