import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { getPayload } from 'payload';
import config from '@payload-config';
import { SERVICE_CATEGORIES } from '@/lib/services';
import { SITE_EMAIL, SITE_PHONE, SITE_PHONE_TEL } from '@/lib/site';
import styles from './Footer.module.css';

type ServiceLink = { slug: string; title: string; category: string };

// Cache the grouped-services lookup — every page renders the footer, and the
// list rarely changes. Revalidate every 5 minutes; admin saves don't need to
// be reflected in the footer instantly.
const getGroupedServices = unstable_cache(
  async (): Promise<Record<string, ServiceLink[]>> => {
    const payload = await getPayload({ config });
    const res = await payload.find({
      collection: 'services',
      sort: 'orderInMenu',
      limit: 100,
      depth: 0,
      where: { category: { exists: true } },
    });
    const byCat: Record<string, ServiceLink[]> = {};
    for (const s of res.docs) {
      if (!s.category) continue;
      (byCat[s.category] ??= []).push({ slug: s.slug, title: s.title, category: s.category });
    }
    return byCat;
  },
  ['footer-grouped-services'],
  { revalidate: 300, tags: ['services'] },
);

export async function Footer() {
  const year = new Date().getFullYear();
  const byCat = await getGroupedServices();

  return (
    <footer className={styles.footer}>
      <div className={styles.grid}>
        <div className={styles.brandCol}>
          <div className={styles.brand}>Hampshire Paddock Management</div>
          <div className={styles.tag}>Paddocks, put right.</div>
          <p className={styles.blurb}>
            Modern, well-equipped paddock management across Hampshire and
            surrounding counties. Trading as Emmerdale Agriculture Ltd.
          </p>
        </div>

        {/* Footer column titles are nav-group labels, not document headings.
            Using <p> avoids the "headings not in sequential order" flag that
            <h3> still triggers in some auditors when the only preceding
            heading in the same sectioning context is the page <h1>. */}
        {SERVICE_CATEGORIES.map((cat) => (
          <div key={cat.key} className={styles.col}>
            <p className={styles.colTitle}>{cat.label}</p>
            <ul>
              {(byCat[cat.key] ?? []).map((s) => (
                <li key={s.slug}>
                  <Link href={`/services/${s.slug}`}>{s.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className={styles.col}>
          <p className={styles.colTitle}>Products</p>
          <ul>
            <li><Link href="/carbide-mole-plough">Carbide mole plough</Link></li>
          </ul>
        </div>

        <div className={styles.col}>
          <p className={styles.colTitle}>Company</p>
          <ul>
            <li><Link href="/paddock-maintenance">Paddock maintenance</Link></li>
            <li><Link href="/about">About</Link></li>
            <li><Link href="/pricing">Pricing</Link></li>
            <li><Link href="/gallery">Gallery</Link></li>
            <li><Link href="/contact">Contact</Link></li>
            {/* Sister site: overflow jobs passed to vetted contractors. */}
            <li><a href="https://emmerdaleagriculture.com">Contractor network</a></li>
          </ul>
        </div>

        <div className={styles.col}>
          <p className={styles.colTitle}>Contact</p>
          <ul>
            <li><a href={`tel:${SITE_PHONE_TEL}`}>{SITE_PHONE}</a></li>
            <li><a href={`mailto:${SITE_EMAIL}`}>Email us</a></li>
          </ul>
        </div>
      </div>

      <div className={styles.bottom}>
        <span>© {year} Emmerdale Agriculture Ltd · Company No. 14950816</span>
        <nav className={styles.bottomLinks} aria-label="Legal">
          <Link href="/privacy">Privacy policy</Link>
        </nav>
        <span>Made with care in Hampshire</span>
      </div>
    </footer>
  );
}
