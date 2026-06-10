import Image from 'next/image';
import Link from 'next/link';
import { mediaUrl } from '@/lib/media';
import styles from './RelatedServices.module.css';

type Service = {
  id: string | number;
  title: string;
  slug: string;
  homepageTagline?: string | null;
  heroImage?: Parameters<typeof mediaUrl>[0];
};

type Props = {
  services: Service[];
};

export function RelatedServices({ services }: Props) {
  if (!services.length) return null;
  return (
    <section className={styles.related}>
      <div className={styles.head}>
        <div className={styles.eyebrow}>You might also want</div>
        <h2 className={styles.title}>Related services.</h2>
      </div>
      <div className={styles.grid}>
        {services.slice(0, 3).map((s) => {
          // 'large' variant first, fall back to original; see ServicesGrid.
          const url = mediaUrl(s.heroImage, 'large') ?? mediaUrl(s.heroImage);
          const alt =
            (typeof s.heroImage === 'object' && s.heroImage?.alt) || s.title;
          return (
            <Link key={s.id} className={styles.tile} href={`/services/${s.slug}`}>
              <div className={styles.photo}>
                {url && (
                  <Image
                    src={url}
                    alt={alt}
                    fill
                    sizes="(max-width: 900px) 100vw, 30vw"
                    quality={60}
                    style={{ objectFit: 'contain' }}
                  />
                )}
              </div>
              <div className={styles.overlay} />
              <div className={styles.meta}>
                {s.homepageTagline && <div className={styles.tag}>{s.homepageTagline}</div>}
                <div className={styles.name}>{s.title}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
