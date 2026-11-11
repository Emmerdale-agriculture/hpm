import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { Payload } from 'payload';

/**
 * Custom button-styled nav entries in Payload's admin sidebar:
 *  - Analytics dashboard → /admin-stats (bespoke dashboard outside the
 *    `/admin` route group because it isn't a Payload collection or global)
 *  - Tenders → the tenders collection, with a count of rows needing
 *    attention (status New, or Watching renewals whose action-by date
 *    has arrived)
 *  - Accounts → external Tally app on Render (opens in a new tab)
 *
 * Rendered via `admin.components.beforeNavLinks` — sits at the very
 * top of the sidebar, above the Collections heading.
 */
const buttonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  padding: '0.625rem 0.875rem',
  background: '#367c2b',
  color: '#fff',
  textDecoration: 'none',
  fontSize: '0.875rem',
  fontWeight: 600,
  borderRadius: '6px',
  border: '1px solid #2a5e22',
  letterSpacing: '0.2px',
};

async function tendersNeedingAttention(payload?: Payload): Promise<number> {
  if (!payload) return 0;
  try {
    const { totalDocs } = await payload.count({
      collection: 'tenders',
      where: {
        or: [
          { status: { equals: 'new' } },
          {
            and: [
              { status: { equals: 'watching' } },
              { actionBy: { less_than_equal: new Date().toISOString() } },
            ],
          },
        ],
      },
    });
    return totalDocs;
  } catch {
    // Never let a badge query break the admin sidebar.
    return 0;
  }
}

const badgeStyle: CSSProperties = {
  background: '#fff',
  color: '#2a5e22',
  borderRadius: '999px',
  padding: '0 0.5rem',
  fontSize: '0.75rem',
  lineHeight: '1.25rem',
  fontWeight: 700,
};

export async function SearchConsoleNavLink({ payload }: { payload?: Payload }) {
  const tenderCount = await tendersNeedingAttention(payload);
  return (
    <div
      style={{
        padding: '0 0.75rem',
        marginBottom: '1rem',
        marginTop: '0.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <Link href="/admin-stats" style={buttonStyle}>
        <span>📊 Analytics dashboard</span>
        <span style={{ opacity: 0.85 }}>→</span>
      </Link>
      <Link href="/admin/collections/tenders" style={buttonStyle}>
        <span>📋 Tenders</span>
        {tenderCount > 0 ? (
          <span style={badgeStyle} title="New, or renewals due to approach">
            {tenderCount}
          </span>
        ) : (
          <span style={{ opacity: 0.85 }}>→</span>
        )}
      </Link>
      <a
        href="https://tally-92lo.onrender.com/"
        target="_blank"
        rel="noopener noreferrer"
        style={buttonStyle}
      >
        <span>💷 Accounts</span>
        <span style={{ opacity: 0.85 }}>↗</span>
      </a>
    </div>
  );
}
