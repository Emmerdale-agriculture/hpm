import Link from 'next/link';
import Script from 'next/script';
import { jsonLd as serializeJsonLd } from '@/lib/jsonld';
import styles from './Breadcrumb.module.css';

export type Crumb = {
  /** Display label */
  label: string;
  /** href; omit on the final (current) crumb */
  href?: string;
};

type Props = {
  /**
   * Crumb trail in display order. The last item is treated as the
   * current page (no link, accent colour, aria-current).
   * Don't include "Home" — the component prepends it automatically.
   */
  items: Crumb[];
  /** Skip the "Home" prefix if a particular page wants something different. */
  skipHome?: boolean;
  /**
   * Emit BreadcrumbList JSON-LD. Defaults to true. Pass siteUrl explicitly
   * if you need absolute URLs for the structured data (otherwise relative).
   */
  jsonLd?: boolean;
  siteUrl?: string;
};

export function Breadcrumb({
  items,
  skipHome = false,
  jsonLd = true,
  siteUrl,
}: Props) {
  const trail: Crumb[] = skipHome
    ? items
    : [{ label: 'Home', href: '/' }, ...items];

  const lastIndex = trail.length - 1;
  const base = (siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(
    /\/$/,
    '',
  );

  const itemListElement = trail.map((c, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: c.label,
    ...(c.href ? { item: base ? `${base}${c.href}` : c.href } : {}),
  }));

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement,
  };

  return (
    <>
      <nav className={styles.crumb} aria-label="Breadcrumb">
        {trail.map((c, i) => {
          const isLast = i === lastIndex;
          return (
            <span key={`${c.label}-${i}`}>
              {i > 0 && <span className={styles.sep}>/</span>}
              {isLast || !c.href ? (
                <span
                  className={isLast ? styles.current : undefined}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {c.label}
                </span>
              ) : (
                <Link href={c.href}>{c.label}</Link>
              )}
            </span>
          );
        })}
      </nav>
      {jsonLd && (
        <Script
          id={`breadcrumb-jsonld-${trail.map((c) => c.label).join('-').replace(/\s+/g, '-')}`}
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
        />
      )}
    </>
  );
}
