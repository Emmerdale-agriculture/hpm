import Image from 'next/image';
import { Nav } from './Nav';
import { Breadcrumb } from './Breadcrumb';
import { mediaUrl } from '@/lib/media';
import { sanitizeInline } from '@/lib/sanitize';
import styles from './ServiceHero.module.css';

type HeroMedia = Parameters<typeof mediaUrl>[0];

type Props = {
  title: string;
  /** HTML-trusted strapline — supports <em> for italic fragments. */
  strapline?: string | null;
  heroImage?: HeroMedia;
};

export function ServiceHero({ title, strapline, heroImage }: Props) {
  // Prefer the 'large' variant (width 2000, no crop) over the original —
  // serving a 6+MP raw file through next/image's optimizer in dev causes
  // timeouts. Older media without the variant falls back to the original.
  const url = mediaUrl(heroImage, 'large') ?? mediaUrl(heroImage);
  const alt =
    (typeof heroImage === 'object' && heroImage?.alt) || title;

  return (
    <section className={styles.hero}>
      <Nav variant="overlay" />

      <div className={styles.photo}>
        {url && (
          <Image
            src={url}
            alt={alt}
            fill
            priority
            sizes="100vw"
            style={{ objectFit: 'cover' }}
          />
        )}
      </div>

      <div className={styles.content}>
        <Breadcrumb
          items={[
            { label: 'Services', href: '/services' },
            { label: title },
          ]}
        />
        <h1 className={styles.title}>{title}.</h1>
        {strapline && (
          <p
            className={styles.strapline}
            /* Admin-authored; only inline emphasis (<em> etc.) is allowed. */
            dangerouslySetInnerHTML={{ __html: sanitizeInline(strapline) }}
          />
        )}
      </div>
    </section>
  );
}
