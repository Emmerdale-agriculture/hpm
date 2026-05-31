import Image from 'next/image';
import Link from 'next/link';
import { mediaUrl } from '@/lib/media';
import styles from './HomepageGallery.module.css';

type MediaDoc = Parameters<typeof mediaUrl>[0];

type Props = {
  images: MediaDoc[];
};

export function HomepageGallery({ images }: Props) {
  return (
    <section className={styles.gallery}>
      <div className={styles.head}>
        <div className={styles.eyebrow}>Our company</div>
        <h2 className={styles.title}>Hampshire Paddock Management in pictures.</h2>
        <Link href="/gallery" className={styles.link}>
          Full gallery →
        </Link>
      </div>

      <div className={styles.grid}>
        {images.map((media, i) => {
          const url = mediaUrl(media, 'card') ?? mediaUrl(media);
          const alt =
            (typeof media === 'object' && media?.alt) ||
            'Hampshire Paddock Management at work';
          const key =
            (typeof media === 'object' && media && 'id' in media
              ? (media as { id?: string | number }).id
              : undefined) ?? i;
          return (
            <div key={key} className={styles.tile}>
              {url && (
                <Image
                  src={url}
                  alt={alt}
                  fill
                  // 2-col grid on mobile (~320px slot), 4-col on desktop
                  // (~280px). Cap at 320px on mobile so next/image doesn't
                  // upscale to the 1080w deviceSize bucket.
                  sizes="(max-width: 768px) 320px, (max-width: 1100px) 33vw, 25vw"
                  style={{ objectFit: 'cover' }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.foot}>
        <Link href="/gallery">See the full gallery →</Link>
      </div>
    </section>
  );
}
