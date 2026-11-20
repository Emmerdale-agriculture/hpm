import Link from 'next/link';
import styles from './SubNav.module.css';

const TABS = [
  { href: '/admin-stats', label: 'Overview' },
  { href: '/admin-stats/trends', label: 'Trends' },
  { href: '/admin-stats/queries', label: 'Queries' },
  { href: '/admin-stats/pages', label: 'Pages' },
  { href: '/admin-stats/segments', label: 'Segments' },
  { href: '/admin-stats/plan', label: 'Plan' },
  { href: '/admin-stats/backlinks', label: 'Backlinks' },
];

export function SubNav({ active }: { active: string }) {
  return (
    <nav className={styles.subnav} aria-label="Search Console sections">
      <ul>
        {TABS.map((tab) => {
          const isActive = active === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={isActive ? styles.activeLink : styles.link}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
        <li className={styles.right}>
          <Link href="/admin" className={styles.back}>
            ← Back to admin
          </Link>
        </li>
      </ul>
    </nav>
  );
}
