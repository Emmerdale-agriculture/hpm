import Link from 'next/link';
import styles from './RelatedNotes.module.css';

export type RelatedNote = {
  id: string | number;
  title: string;
  slug: string;
  excerpt?: string | null;
  publishedAt?: string | null;
};

type Props = {
  notes: RelatedNote[];
  /** Slug of the tag hub to link the "all notes" CTA to, if one fits. */
  hubTag?: string | null;
  hubLabel?: string | null;
};

function formatMonth(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/**
 * "From the field notes" — links a service page to relevant posts, so the
 * service ↔ notes graph is bidirectional (posts already CTA back to
 * services via the tag→service map).
 */
export function RelatedNotes({ notes, hubTag, hubLabel }: Props) {
  if (!notes.length) return null;
  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.eyebrow}>From the field notes</div>
        <h2 className={styles.title}>Worth reading first.</h2>
      </div>
      <ul className={styles.list}>
        {notes.map((n) => (
          <li key={n.id} className={styles.item}>
            <Link href={`/notes/${n.slug}`} className={styles.link}>
              <span className={styles.itemTitle}>{n.title}</span>
              {n.publishedAt && (
                <span className={styles.date}>{formatMonth(n.publishedAt)}</span>
              )}
              {n.excerpt && <span className={styles.excerpt}>{n.excerpt}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {hubTag && (
        <Link href={`/notes/tag/${hubTag}`} className={styles.more}>
          All {hubLabel ? hubLabel.toLowerCase() : 'related'} notes →
        </Link>
      )}
    </section>
  );
}
