import { SITE_PHONE, SITE_PHONE_TEL } from '@/lib/site';
import styles from './PhoneStrip.module.css';

export function PhoneStrip() {
  return (
    <section className={styles.strip}>
      <div className={styles.row}>
        <span className={styles.label}>Call us direct</span>
        <span className={styles.divider} />
        <a href={`tel:${SITE_PHONE_TEL}`} className={styles.number}>
          {SITE_PHONE}
        </a>
        <span className={styles.divider} />
        <span className={styles.label}>Hampshire &amp; surrounding counties</span>
      </div>
      <div className={styles.coverage}>
        Covering Hampshire, Wiltshire, Berkshire, Sussex, Dorset and Surrey
      </div>
    </section>
  );
}
