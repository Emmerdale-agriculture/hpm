'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPayload } from 'payload';
import config from '@payload-config';

import { runLinkCampaign } from '@/app/api/cheatcode/lib/link-brief';
import { normaliseLinkSettings } from '@/app/api/cheatcode/lib/link-targets';
import { parseCampaignForm } from './params';

/**
 * Create a backlink campaign: re-runs the brief with the chosen volume and
 * DA band, saves each target as a pending `link_target` opportunity, and
 * optionally stores the choice as the monthly default (Cheatcode settings).
 */
export async function createCampaign(formData: FormData): Promise<void> {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });
  if (!user) redirect('/admin/login?redirect=%2Fadmin-stats%2Fbacklinks');

  const settings = normaliseLinkSettings(parseCampaignForm(formData));
  const makeDefault = formData.get('makeDefault') === 'on';

  const result = await runLinkCampaign({
    settings,
    dryRun: false,
    notes: `Backlink campaign created by ${user.email ?? 'admin'}: ${settings.linksPerMonth} link(s), DA ${settings.daMin}–${settings.daMax}.`,
  });

  if (makeDefault) {
    await payload.updateGlobal({
      slug: 'cheatcode-settings',
      data: {
        daMin: settings.daMin,
        daMax: settings.daMax,
        linksPerMonth: settings.linksPerMonth,
        maxLinkPages: settings.maxLinkPages,
      },
    });
  }

  const q = new URLSearchParams({
    saved: String(result.opportunities.length),
    links: String(settings.linksPerMonth),
    daMin: String(settings.daMin),
    daMax: String(settings.daMax),
    pages: String(settings.maxLinkPages),
  });
  if (makeDefault) q.set('defaulted', '1');
  if (result.errors.length) q.set('warn', result.errors.join(' | ').slice(0, 500));
  redirect(`/admin-stats/backlinks?${q.toString()}`);
}
