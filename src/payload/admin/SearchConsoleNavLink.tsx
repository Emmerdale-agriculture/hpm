import Link from 'next/link';
import type { CSSProperties } from 'react';

/**
 * Custom button-styled nav entries in Payload's admin sidebar:
 *  - Analytics dashboard → /admin-stats (bespoke dashboard outside the
 *    `/admin` route group because it isn't a Payload collection or global)
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

export function SearchConsoleNavLink() {
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
