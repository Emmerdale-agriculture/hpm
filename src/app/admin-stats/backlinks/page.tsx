import type { Metadata } from 'next';
import Link from 'next/link';
import { getPayload } from 'payload';
import config from '@payload-config';

import { adminStatsGuard } from '@/components/admin-stats/guard';
import { SubNav } from '@/components/admin-stats/SubNav';
import { agencyBriefText, runLinkCampaign } from '@/app/api/cheatcode/lib/link-brief';
import { normaliseLinkSettings, type LinkSettings } from '@/app/api/cheatcode/lib/link-targets';
import type { LinkTargetDraft } from '@/app/api/cheatcode/lib/types';
import styles from '../admin-stats.module.css';
import { createCampaign } from './actions';
import { parseCampaignForm } from './params';

export const metadata: Metadata = {
  title: 'Backlink campaign — HPM Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * /admin-stats/backlinks — pick a link volume and DA band, preview which
 * pages Cheatcode would send the agency's links to, then create the
 * campaign (pending `link_target` opportunities) and copy the brief.
 *
 * Preview is a plain GET (no writes); Create is a server action.
 */
export default async function BacklinksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { block } = await adminStatsGuard('/admin-stats/backlinks');
  if (block) return block;

  const sp = await searchParams;
  const payload = await getPayload({ config });

  let defaults: LinkSettings = normaliseLinkSettings(null);
  try {
    defaults = normaliseLinkSettings(
      (await payload.findGlobal({ slug: 'cheatcode-settings', depth: 0 })) as unknown as Record<string, unknown>,
    );
  } catch {
    /* defaults */
  }
  const chosenRaw = parseCampaignForm(sp);
  const chosen = normaliseLinkSettings({
    daMin: chosenRaw.daMin ?? defaults.daMin,
    daMax: chosenRaw.daMax ?? defaults.daMax,
    linksPerMonth: chosenRaw.linksPerMonth ?? defaults.linksPerMonth,
    maxLinkPages: chosenRaw.maxLinkPages ?? defaults.maxLinkPages,
  });
  const wantPreview = sp.preview === '1';
  const saved = typeof sp.saved === 'string' ? Number(sp.saved) : null;

  let preview: Awaited<ReturnType<typeof runLinkCampaign>> | null = null;
  let previewErr: string | null = null;
  if (wantPreview) {
    try {
      preview = await runLinkCampaign({ settings: chosen, dryRun: true });
    } catch (err) {
      previewErr = err instanceof Error ? err.message : String(err);
    }
  }

  const recent = await payload
    .find({
      collection: 'seo-opportunities',
      where: { type: { equals: 'link_target' } },
      sort: '-createdAt',
      limit: 12,
      depth: 0,
    })
    .then((r) => r.docs)
    .catch(() => []);

  const field = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 } as const;
  const input = { padding: '6px 8px', width: 90, fontSize: 14 } as const;
  const button = {
    padding: '8px 14px',
    background: '#367c2b',
    color: '#fff',
    border: 0,
    borderRadius: 6,
    fontWeight: 600,
    cursor: 'pointer',
  } as const;

  return (
    <main className={styles.page}>
      <SubNav active="/admin-stats/backlinks" />
      <header className={styles.head}>
        <div>
          <h1>Backlink campaign</h1>
          <p className={styles.range}>
            Choose how many links and what DA band, preview the pages Cheatcode would target, then create the campaign
            and send the brief to the agency.
          </p>
        </div>
      </header>

      {saved !== null && (
        <section className={styles.successBanner}>
          Campaign created: {saved} target page{saved === 1 ? '' : 's'} saved as pending{' '}
          <Link href="/admin/collections/seo-opportunities?where[type][equals]=link_target">backlink opportunities</Link>.
          {sp.defaulted === '1' ? ' These numbers are now the monthly default.' : ''}
          {saved === 0 ? ' No page qualified (or every candidate was briefed in the last 120 days).' : ''}
          {typeof sp.warn === 'string' ? <div className={styles.muted}>Notes: {sp.warn}</div> : null}
        </section>
      )}

      <section className={styles.tableSection}>
        <form method="get" style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <input type="hidden" name="preview" value="1" />
          <label style={field}>
            Links
            <input style={input} type="number" name="links" min={1} max={100} defaultValue={chosen.linksPerMonth} />
          </label>
          <label style={field}>
            DA from
            <input style={input} type="number" name="daMin" min={0} max={100} defaultValue={chosen.daMin} />
          </label>
          <label style={field}>
            DA to
            <input style={input} type="number" name="daMax" min={0} max={100} defaultValue={chosen.daMax} />
          </label>
          <label style={field}>
            Max pages
            <input style={input} type="number" name="pages" min={1} max={10} defaultValue={chosen.maxLinkPages} />
          </label>
          <button type="submit" style={button}>
            Preview brief
          </button>
        </form>
        <p className={styles.tableNote}>
          Monthly default (used by the 1st-of-month run): {defaults.linksPerMonth} link
          {defaults.linksPerMonth === 1 ? '' : 's'}, DA {defaults.daMin}–{defaults.daMax}, up to {defaults.maxLinkPages}{' '}
          page{defaults.maxLinkPages === 1 ? '' : 's'}.
        </p>
      </section>

      {previewErr && (
        <section className={styles.error}>
          <h2>Couldn&apos;t build the brief</h2>
          <pre>{previewErr}</pre>
        </section>
      )}

      {preview && (
        <section className={styles.tableSection}>
          <h2>
            Preview — {preview.linkBrief.linksTotal} link{preview.linkBrief.linksTotal === 1 ? '' : 's'}
            {preview.linkBrief.averageTargetDa !== null ? `, average target DA ${preview.linkBrief.averageTargetDa}` : ''}
          </h2>
          <p className={styles.tableNote}>
            Search Console{preview.ga4Joined ? ' + GA4' : ''} data {preview.gscRange.start} → {preview.gscRange.end}.
            Nothing is saved until you create the campaign.
          </p>
          {preview.opportunities.length === 0 ? (
            <p className={styles.muted}>
              No page qualifies right now (pages ranking 4–20 for real searches, not briefed in the last 120 days).
            </p>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Links</th>
                    <th>Target DA</th>
                    <th>Anchor text</th>
                    <th>Lead query</th>
                    <th>GA4</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.opportunities.map((o) => {
                    const d: LinkTargetDraft = o.draftContent;
                    const lead = d.queries[0];
                    return (
                      <tr key={d.pageUrl}>
                        <td>
                          <a href={d.pageUrl} target="_blank" rel="noopener">
                            {new URL(d.pageUrl).pathname}
                          </a>
                        </td>
                        <td>{d.linksRequested}</td>
                        <td>
                          <strong>{d.targetDa}</strong>
                        </td>
                        <td>{(d.anchorPlan ?? []).map((t) => `“${t}”`).join(', ')}</td>
                        <td>
                          {d.leadQuery}
                          {lead ? (
                            <span className={styles.muted}>
                              {' '}
                              · pos {lead.position.toFixed(1)} · {lead.impressions} imp
                            </span>
                          ) : null}
                        </td>
                        <td>
                          {o.analytics
                            ? `${o.analytics.sessions} sess · ${Math.round(o.analytics.engagementRate * 100)}% eng`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {preview.linkBrief.fixFirst.length > 0 && (
            <p className={styles.tableNote}>
              Not offered to the agency (GA4 shows visitors leaving, so fix the page first):{' '}
              {preview.linkBrief.fixFirst
                .map((p) => `${p.path} (${Math.round(p.engagementRate * 100)}% of ${p.sessions} sessions)`)
                .join(', ')}
            </p>
          )}
          {preview.heldBack.length > 0 && (
            <p className={styles.tableNote}>
              Skipped, briefed in the last 120 days:{' '}
              {preview.heldBack.map((h) => h.query.replace(/^links → /, '')).join(', ')}
            </p>
          )}
          {preview.errors.length > 0 && <p className={styles.errorInline}>{preview.errors.join(' | ')}</p>}

          {preview.opportunities.length > 0 && (
            <>
              <h3 style={{ marginTop: 20 }}>Brief for the agency</h3>
              <textarea
                readOnly
                rows={Math.min(18, 4 + preview.opportunities.length * 5)}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, padding: 10 }}
                defaultValue={agencyBriefText(preview.opportunities, preview.linkBrief)}
              />
              <form action={createCampaign} style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 12 }}>
                <input type="hidden" name="links" value={chosen.linksPerMonth} />
                <input type="hidden" name="daMin" value={chosen.daMin} />
                <input type="hidden" name="daMax" value={chosen.daMax} />
                <input type="hidden" name="pages" value={chosen.maxLinkPages} />
                <button type="submit" style={button}>
                  Create campaign
                </button>
                <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" name="makeDefault" /> Also make these the monthly default
                </label>
              </form>
            </>
          )}
        </section>
      )}

      <section className={styles.tableSection}>
        <h2>Recent backlink targets</h2>
        {recent.length === 0 ? (
          <p className={styles.muted}>None yet.</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Week</th>
                  <th>Links</th>
                  <th>Target DA</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => {
                  const d = (r.draftContent ?? {}) as Partial<LinkTargetDraft>;
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/admin/collections/seo-opportunities/${r.id}`}>
                          {String(r.query).replace(/^links → /, '')}
                        </Link>
                      </td>
                      <td>{r.weekIdentified}</td>
                      <td>{d.linksRequested ?? '—'}</td>
                      <td>{d.targetDa ?? '—'}</td>
                      <td>{r.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.tableNote}>
          Mark a target <em>completed</em> once the agency&apos;s link is live; the monthly digest then re-measures that
          page 6–26 weeks later. A campaign created here covers the month: the 1st-of-month run won&apos;t add a second
          brief within 25 days of it.
        </p>
      </section>
    </main>
  );
}
