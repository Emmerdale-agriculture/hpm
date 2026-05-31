import type { ReactNode } from 'react';
import { sanitizeInline } from '@/lib/sanitize';
import styles from './ServiceBody.module.css';

type Props = {
  /** The lede — rendered as the first bold/serif paragraph before the body. */
  lede?: string | null;
  /** Pre-rendered body content (JSX from the Lexical renderer). */
  body?: ReactNode;
  /** Sidebar content (EquipmentCard, AtAGlanceCard). */
  aside?: ReactNode;
};

/**
 * Two-column layout for the service page body. Left column holds the lede
 * plus the converted richText body; right column is a sticky aside with the
 * equipment and at-a-glance cards.
 */
export function ServiceBody({ lede, body, aside }: Props) {
  return (
    <div className={styles.wrap}>
      <main className={styles.main}>
        {lede && (
          <p
            className={styles.lede}
            /* Admin-authored; only inline emphasis (<em> etc.) is allowed. */
            dangerouslySetInnerHTML={{ __html: sanitizeInline(lede) }}
          />
        )}
        <div className={styles.body}>{body}</div>
      </main>
      <aside className={styles.aside}>{aside}</aside>
    </div>
  );
}
