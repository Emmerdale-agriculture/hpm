import Link from 'next/link';
import { Nav } from '@/components/Nav';
import styles from './not-found.module.css';

// Per Phase 9 handover §2 (option A): keep the standard nav for
// orientation, drop the footer to keep the page focused.
//
// This file is rendered for two cases:
//  1. Any (frontend) route that calls notFound() (e.g. unknown service
//     slug or post slug)
//  2. Any URL that doesn't match a route, via the catch-all at
//     [...catchall]/page.tsx which forces notFound()
//
// The (frontend)/layout.tsx provides the html/body chrome.

export const metadata = {
  // `absolute` bypasses the layout's "%s | Hampshire Paddock Management"
  // template — the brand is already in this string.
  title: { absolute: '404 — Hampshire Paddock Management' },
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className={styles.page}>
      <Nav variant="overlay" />
      <div className={styles.content}>
        <div className={styles.inner}>
          <div className={styles.eyebrow}>404</div>
          <h1 className={styles.title}>
            This field is <em>empty</em>
          </h1>
          <p className={styles.body}>
            The page you were looking for has wandered off — or it was never
            here in the first place. Either way, let&rsquo;s get you back on a
            paddock that&rsquo;s actually being managed.
          </p>
          <div className={styles.buttons}>
            <Link href="/" className={styles.btnPrimary}>
              Back to home
            </Link>
            <Link href="/contact" className={styles.btnSecondary}>
              Get a quote
            </Link>
          </div>
          <div className={styles.suggested}>
            <div className={styles.suggestedLabel}>Or try one of these</div>
            <ul className={styles.links}>
              <li><Link href="/services">All services</Link></li>
              <li><Link href="/gallery">Gallery</Link></li>
              <li><Link href="/notes">Notes from the field</Link></li>
              <li><Link href="/about">About</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
