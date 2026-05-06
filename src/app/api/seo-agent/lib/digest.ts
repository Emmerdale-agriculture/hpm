/**
 * Digest email — sent every Monday after the cron, even when no
 * opportunities exist. Silence makes the system feel broken (brief §9).
 */

import { Resend } from 'resend';
import type { AgentRunSummary } from './types';

export type DigestArgs = {
  summary: AgentRunSummary;
  to: string;
  /** Public site URL — used to deep-link into Payload admin. */
  siteUrl: string;
};

export async function sendDigest(args: DigestArgs): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };

  // Match the chain used elsewhere: explicit EMAIL_FROM, else CONTACT_FORM_FROM
  // (already verified for the contact route), else Resend's onboarding sandbox.
  const from =
    process.env.EMAIL_FROM ||
    process.env.CONTACT_FORM_FROM ||
    'HPM SEO Agent <onboarding@resend.dev>';
  const { subject, html, text } = composeDigest(args);

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: args.to,
      subject,
      html,
      text,
    });
    if (error) return { ok: false, error: String(error) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function composeDigest(args: DigestArgs): { subject: string; html: string; text: string } {
  const { summary, siteUrl } = args;
  const total =
    summary.counts.metaRewrites + summary.counts.onPageTweaks + summary.counts.newArticles;

  const subject =
    total === 0
      ? `HPM SEO — quiet week, no new opportunities`
      : `HPM SEO — ${total} opportunit${total === 1 ? 'y' : 'ies'} for week ${summary.weekIdentified}`;

  const adminUrl = `${siteUrl.replace(/\/$/, '')}/admin/collections/seo-opportunities?where[status][equals]=pending`;
  const errorsLine = summary.errors.length ? ` (errors: ${summary.errors.length})` : '';

  const summaryLine =
    total === 0
      ? `The agent ran clean but found no opportunities this week${errorsLine}.`
      : `This week the agent found ${summary.counts.metaRewrites} meta rewrite${summary.counts.metaRewrites === 1 ? '' : 's'}, ${summary.counts.onPageTweaks} on-page tweak${summary.counts.onPageTweaks === 1 ? '' : 's'}, and ${summary.counts.newArticles} new article draft${summary.counts.newArticles === 1 ? '' : 's'}${errorsLine}.`;

  const sections = [
    sectionFor('Meta rewrites', summary, 'meta_rewrite'),
    sectionFor('On-page tweaks', summary, 'on_page_tweak'),
    sectionFor('New article drafts', summary, 'new_article'),
  ]
    .filter(Boolean)
    .join('\n\n');

  const errorsBlock = summary.errors.length
    ? `\n\nErrors during run:\n${summary.errors.map((e) => `- ${e}`).join('\n')}`
    : '';

  const text = `${summaryLine}\n\n${sections}${errorsBlock}\n\nReview pending opportunities: ${adminUrl}\n\nAgent run at ${summary.finishedAt}, week ${summary.weekIdentified}, GSC data covers ${summary.gscRange.start} to ${summary.gscRange.end}.`;

  const html = renderHtml({
    subject,
    summaryLine,
    sections: [
      tableFor('Meta rewrites', summary, 'meta_rewrite'),
      tableFor('On-page tweaks', summary, 'on_page_tweak'),
      tableFor('New article drafts', summary, 'new_article'),
    ].filter(Boolean) as string[],
    errors: summary.errors,
    adminUrl,
    runFooter: `Agent run at ${summary.finishedAt}, week ${summary.weekIdentified}, GSC data covers ${summary.gscRange.start} to ${summary.gscRange.end}.`,
  });

  return { subject, html, text };
}

function sectionFor(label: string, summary: AgentRunSummary, type: string): string {
  const items = summary.opportunities.filter((o) => o.type === type);
  if (items.length === 0) return '';
  const lines = items.map(
    (o) =>
      `  • ${o.query}  (pos ${o.metrics.position.toFixed(1)}, CTR ${(o.metrics.ctr * 100).toFixed(1)}%, ${o.metrics.impressions} imp)`,
  );
  return `${label} (${items.length}):\n${lines.join('\n')}`;
}

function tableFor(label: string, summary: AgentRunSummary, type: string): string | null {
  const items = summary.opportunities.filter((o) => o.type === type);
  if (items.length === 0) return null;
  const rows = items
    .map(
      (o) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(o.query)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${o.metrics.position.toFixed(1)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${(o.metrics.ctr * 100).toFixed(1)}%</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${o.metrics.impressions}</td>
        </tr>`,
    )
    .join('');
  return `
    <h3 style="margin:24px 0 8px;font-size:15px;">${escapeHtml(label)} (${items.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="text-align:left;color:#666;">
          <th style="padding:8px;border-bottom:1px solid #ddd;font-weight:600;">Query</th>
          <th style="padding:8px;border-bottom:1px solid #ddd;text-align:right;font-weight:600;">Pos</th>
          <th style="padding:8px;border-bottom:1px solid #ddd;text-align:right;font-weight:600;">CTR</th>
          <th style="padding:8px;border-bottom:1px solid #ddd;text-align:right;font-weight:600;">Imp</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderHtml(args: {
  subject: string;
  summaryLine: string;
  sections: string[];
  errors: string[];
  adminUrl: string;
  runFooter: string;
}): string {
  const errorsBlock = args.errors.length
    ? `<div style="background:#fff4f4;border:1px solid #f3c0c0;padding:12px;border-radius:6px;margin-top:24px;font-size:13px;color:#7a1f1f;">
        <strong>Errors during run:</strong>
        <ul style="margin:8px 0 0 18px;padding:0;">${args.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
      </div>`
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#222;">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:32px;border-radius:8px;">
    <h1 style="margin:0 0 12px;font-size:18px;">${escapeHtml(args.subject)}</h1>
    <p style="margin:0 0 16px;color:#444;font-size:14px;">${escapeHtml(args.summaryLine)}</p>
    ${args.sections.join('\n')}
    ${errorsBlock}
    <p style="margin:32px 0 0;text-align:center;">
      <a href="${escapeHtml(args.adminUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;font-weight:600;">Review this week's opportunities</a>
    </p>
    <p style="margin:24px 0 0;color:#888;font-size:12px;text-align:center;">${escapeHtml(args.runFooter)}</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
