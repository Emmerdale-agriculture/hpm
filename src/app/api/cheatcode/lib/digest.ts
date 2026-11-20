/**
 * Digest email — sent after each monthly cron run, even when no
 * opportunities exist. Silence makes the system feel broken (brief §9).
 */

import { Resend } from 'resend';
import type { AgentRunSummary, LinkTargetOpportunity, OutcomeCheck, PageAnalytics } from './types';

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
    'HPM Cheatcode <onboarding@resend.dev>';
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
  const links = summary.counts.linkTargets ?? 0;
  const total =
    summary.counts.metaRewrites + summary.counts.onPageTweaks + summary.counts.newArticles + links;

  const subject =
    total === 0
      ? `HPM SEO — quiet month, no new opportunities`
      : `HPM SEO — ${total} opportunit${total === 1 ? 'y' : 'ies'} (${summary.weekIdentified})`;

  const adminUrl = `${siteUrl.replace(/\/$/, '')}/admin/collections/seo-opportunities?where[status][equals]=pending`;
  const errorsLine = summary.errors.length ? ` (errors: ${summary.errors.length})` : '';

  const summaryLine =
    total === 0
      ? `The agent ran clean but found no new opportunities${errorsLine}. Queries raised in the last 120 days are held back while their changes get recrawled, so quiet months are expected.`
      : `This run the agent found ${summary.counts.metaRewrites} meta rewrite${summary.counts.metaRewrites === 1 ? '' : 's'}, ${summary.counts.onPageTweaks} on-page tweak${summary.counts.onPageTweaks === 1 ? '' : 's'}, ${summary.counts.newArticles} new article draft${summary.counts.newArticles === 1 ? '' : 's'}, and ${links} backlink target${links === 1 ? '' : 's'}${errorsLine}.`;

  const sections = [
    sectionFor('Meta rewrites', summary, 'meta_rewrite'),
    sectionFor('On-page tweaks', summary, 'on_page_tweak'),
    sectionFor('New article drafts', summary, 'new_article'),
    linkSection(summary),
  ]
    .filter(Boolean)
    .join('\n\n');

  const errorsBlock = summary.errors.length
    ? `\n\nErrors during run:\n${summary.errors.map((e) => `- ${e}`).join('\n')}`
    : '';

  const outcomesText = outcomesSection(summary.outcomes ?? []);
  const fixFirst = summary.linkBrief?.fixFirst ?? [];
  const fixFirstLine = fixFirst.length
    ? `Not sent to the link agency — GA4 shows visitors leaving these pages (under 35% engaged), so improve the page before buying links to it: ${fixFirst
        .map((p) => `${p.path} (${Math.round(p.engagementRate * 100)}% of ${p.sessions} sessions)`)
        .join(', ')}.`
    : '';
  const held = summary.heldBack ?? [];
  const heldLine = held.length
    ? `Held back (raised or resolved in the last 120 days, no new draft): ${held.map((h) => `${h.query} (#${h.priorId})`).join(', ')}.`
    : '';
  const text = `${summaryLine}\n\n${sections}${fixFirstLine ? `\n\n${fixFirstLine}` : ''}${heldLine ? `\n\n${heldLine}` : ''}${outcomesText}${errorsBlock}\n\nReview pending opportunities: ${adminUrl}\n\nAgent run at ${summary.finishedAt}, week ${summary.weekIdentified}, GSC data covers ${summary.gscRange.start} to ${summary.gscRange.end}.`;

  const html = renderHtml({
    subject,
    summaryLine,
    sections: [
      tableFor('Meta rewrites', summary, 'meta_rewrite'),
      tableFor('On-page tweaks', summary, 'on_page_tweak'),
      tableFor('New article drafts', summary, 'new_article'),
      linkTable(summary),
      fixFirstLine ? `<p style="margin:12px 0 0;color:#a35b00;font-size:13px;">${escapeHtml(fixFirstLine)}</p>` : null,
      heldLine ? `<p style="margin:24px 0 0;color:#666;font-size:13px;">${escapeHtml(heldLine)}</p>` : null,
      outcomesTable(summary.outcomes ?? []),
    ].filter(Boolean) as string[],
    errors: summary.errors,
    adminUrl,
    runFooter: `Agent run at ${summary.finishedAt}, week ${summary.weekIdentified}, GSC${summary.ga4Joined ? ' and GA4' : ''} data covers ${summary.gscRange.start} to ${summary.gscRange.end}.`,
  });

  return { subject, html, text };
}

function sectionFor(label: string, summary: AgentRunSummary, type: string): string {
  const items = summary.opportunities.filter((o) => o.type === type);
  if (items.length === 0) return '';
  const lines = items.map(
    (o) =>
      `  • ${o.query}  (pos ${o.metrics.position.toFixed(1)}, CTR ${(o.metrics.ctr * 100).toFixed(1)}%, ${o.metrics.impressions} imp${o.analytics ? `; GA4 ${fmtGa(o.analytics)}` : ''})` +
      (o.relatedQueries?.length ? `\n      + ${o.relatedQueries.map((r) => r.query).join(', ')}` : '') +
      (o.competingPages?.length ? `\n      ⚠ split with ${o.competingPages.map((p) => shortPath(p.page)).join(', ')}` : ''),
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
          <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(o.query)}${
            o.relatedQueries?.length
              ? `<div style="color:#666;font-size:12px;">+ ${escapeHtml(o.relatedQueries.map((r) => r.query).join(', '))}</div>`
              : ''
          }${
            o.competingPages?.length
              ? `<div style="color:#a35b00;font-size:12px;">⚠ split with ${escapeHtml(o.competingPages.map((p) => shortPath(p.page)).join(', '))}</div>`
              : ''
          }</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${o.metrics.position.toFixed(1)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${(o.metrics.ctr * 100).toFixed(1)}%</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${o.metrics.impressions}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;color:${o.analytics && lowEngagement(o.analytics) ? '#a35b00' : '#222'};">${o.analytics ? escapeHtml(fmtGa(o.analytics)) : '—'}</td>
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
          <th style="padding:8px;border-bottom:1px solid #ddd;text-align:right;font-weight:600;" title="GA4 sessions · % engaged">GA4</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** "123 sess · 54% eng" (+ key events when GA4 has any configured). */
function fmtGa(a: PageAnalytics): string {
  return `${a.sessions} sess · ${Math.round(a.engagementRate * 100)}% eng${a.keyEvents ? ` · ${a.keyEvents} key` : ''}`;
}

function lowEngagement(a: PageAnalytics): boolean {
  return a.sessions >= 10 && a.engagementRate < 0.35;
}

function linkItems(summary: AgentRunSummary): LinkTargetOpportunity[] {
  return summary.opportunities.filter((o): o is LinkTargetOpportunity => o.type === 'link_target');
}

function linkHeadline(summary: AgentRunSummary, items: LinkTargetOpportunity[]): string {
  const b = summary.linkBrief;
  const total = items.reduce((s, o) => s + o.draftContent.linksRequested, 0);
  const avg = b?.averageTargetDa ?? null;
  return `${total} link${total === 1 ? '' : 's'} across ${items.length} page${items.length === 1 ? '' : 's'}${
    avg !== null ? `, average targeted DA ${avg}` : ''
  }${b ? ` (band ${b.daBand.min}–${b.daBand.max})` : ''}`;
}

function anchorLine(o: LinkTargetOpportunity): string {
  const plan = o.draftContent.anchorPlan;
  if (plan?.length) return plan.map((t) => `"${t}"`).join(', ');
  return o.draftContent.anchors.map((a) => `"${a.text}" ${a.share}%`).join(', ');
}

/** Plain-text brief, written so it can be forwarded to the agency as-is. */
function linkSection(summary: AgentRunSummary): string {
  const items = linkItems(summary);
  if (items.length === 0) return '';
  const lines = items.map((o) => {
    const d = o.draftContent;
    const lead = d.queries[0];
    return (
      `  • ${d.pageUrl}\n` +
      `      ${d.linksRequested} link${d.linksRequested === 1 ? '' : 's'} at DA ~${d.targetDa}; lead query "${d.leadQuery}"` +
      (lead ? ` (pos ${lead.position.toFixed(1)}, ${lead.impressions} imp)` : '') +
      (o.analytics ? `; GA4 ${fmtGa(o.analytics)}` : '') +
      `\n      Anchors: ${anchorLine(o)}`
    );
  });
  return `Backlink targets for the agency — ${linkHeadline(summary, items)}:\n${lines.join('\n')}`;
}

function linkTable(summary: AgentRunSummary): string | null {
  const items = linkItems(summary);
  if (items.length === 0) return null;
  const td = 'padding:8px;border-bottom:1px solid #eee;';
  const rows = items
    .map((o) => {
      const d = o.draftContent;
      const lead = d.queries[0];
      return `
        <tr>
          <td style="${td}"><a href="${escapeHtml(d.pageUrl)}" style="color:#111;">${escapeHtml(shortPath(d.pageUrl))}</a>
            <div style="color:#666;font-size:12px;">"${escapeHtml(d.leadQuery)}"${lead ? ` · pos ${lead.position.toFixed(1)} · ${lead.impressions} imp` : ''}${d.queries.length > 1 ? ` · +${d.queries.length - 1} more` : ''}</div>
            <div style="color:#888;font-size:12px;">Anchors: ${escapeHtml(anchorLine(o))}</div></td>
          <td style="${td}text-align:right;">${d.linksRequested}</td>
          <td style="${td}text-align:right;font-weight:600;">${d.targetDa}</td>
          <td style="${td}text-align:right;white-space:nowrap;">${o.analytics ? escapeHtml(fmtGa(o.analytics)) : '—'}</td>
        </tr>`;
    })
    .join('');
  return `
    <h3 style="margin:24px 0 4px;font-size:15px;">Backlink targets for the agency (${items.length})</h3>
    <p style="margin:0 0 8px;color:#666;font-size:12px;">${escapeHtml(linkHeadline(summary, items))}. Pages already ranking 4–20 where authority, not copy, is the gap. Change the DA band in Admin → Cheatcode settings.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="text-align:left;color:#666;">
          <th style="padding:8px;border-bottom:1px solid #ddd;font-weight:600;">Page</th>
          <th style="padding:8px;border-bottom:1px solid #ddd;text-align:right;font-weight:600;">Links</th>
          <th style="padding:8px;border-bottom:1px solid #ddd;text-align:right;font-weight:600;">Target DA</th>
          <th style="padding:8px;border-bottom:1px solid #ddd;text-align:right;font-weight:600;">GA4</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

const VERDICT_LABEL: Record<OutcomeCheck['verdict'], string> = {
  improved: '▲ improved',
  flat: '– flat',
  worse: '▼ worse',
  gone: '∅ no impressions',
};

const OUTCOME_CAVEAT =
  'Compared with the metrics when each was raised, 6–26 weeks ago. Position is the fair signal; clicks and impressions also move with the season.';

function fmtOutcome(o: OutcomeCheck): { before: string; now: string } {
  const before = `pos ${o.before.position.toFixed(1)} · ${o.before.clicks}c/${o.before.impressions}i`;
  const now = o.now ? `pos ${o.now.position.toFixed(1)} · ${o.now.clicks}c/${o.now.impressions}i` : '—';
  return { before, now };
}

function outcomesSection(outcomes: OutcomeCheck[]): string {
  if (outcomes.length === 0) return '';
  const lines = outcomes.map((o) => {
    const f = fmtOutcome(o);
    return `  ${VERDICT_LABEL[o.verdict]}  ${o.query}  (${f.before} → ${f.now})`;
  });
  return `\n\nDid past changes work? (${outcomes.length})\n${OUTCOME_CAVEAT}\n${lines.join('\n')}`;
}

function outcomesTable(outcomes: OutcomeCheck[]): string | null {
  if (outcomes.length === 0) return null;
  const color = { improved: '#1d6b2f', flat: '#666', worse: '#a31f1f', gone: '#a35b00' } as const;
  const rows = outcomes
    .map((o) => {
      const f = fmtOutcome(o);
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(o.query)}<div style="color:#888;font-size:12px;">#${o.id} · ${escapeHtml(o.type.replace(/_/g, ' '))}</div></td>
          <td style="padding:8px;border-bottom:1px solid #eee;color:#666;">${escapeHtml(f.before)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(f.now)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;color:${color[o.verdict]};white-space:nowrap;">${escapeHtml(VERDICT_LABEL[o.verdict])}</td>
        </tr>`;
    })
    .join('');
  return `
    <h3 style="margin:24px 0 4px;font-size:15px;">Did past changes work? (${outcomes.length})</h3>
    <p style="margin:0 0 8px;color:#666;font-size:12px;">${escapeHtml(OUTCOME_CAVEAT)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="text-align:left;color:#666;">
          <th style="padding:8px;border-bottom:1px solid #ddd;font-weight:600;">Query</th>
          <th style="padding:8px;border-bottom:1px solid #ddd;font-weight:600;">When raised</th>
          <th style="padding:8px;border-bottom:1px solid #ddd;font-weight:600;">Now</th>
          <th style="padding:8px;border-bottom:1px solid #ddd;font-weight:600;"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function shortPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
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
      <a href="${escapeHtml(args.adminUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;font-weight:600;">Review pending opportunities</a>
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
