import Image from 'next/image';
import Link from 'next/link';

import { mediaUrl, mediaDimensions } from '@/lib/media';
import { renderLexical, collectUploadIds } from '@/lib/lexical';
import styles from './ContentBlocks.module.css';

/**
 * Renders a Payload `content` blocks array (see payload/blocks/content-blocks.ts).
 *
 * Both the note and service templates previously inlined a loop that handled
 * only `richText` and returned null for everything else — so an Image,
 * Gallery, Callout, CTA or Video block added in the admin saved and published
 * correctly but silently never appeared on the page. One renderer here keeps
 * the two templates from drifting apart again.
 *
 * Typography (paragraphs, headings, links, and the bleed on plain <figure>)
 * comes from the parent article's stylesheet via descendant selectors; this
 * module only styles what's block-specific.
 */

type MediaArg = Parameters<typeof mediaUrl>[0];

/** Upload ids referenced by richText bodies anywhere in the block array. */
export function collectBlockUploadIds(blocks: unknown): number[] {
  if (!Array.isArray(blocks)) return [];
  const ids: number[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const b = block as { blockType?: string; content?: unknown; body?: unknown };
    if (b.blockType === 'richText') ids.push(...collectUploadIds(b.content));
    // Callout bodies are richText too — their inline uploads need hydrating
    // or they render as gaps.
    if (b.blockType === 'callout') ids.push(...collectUploadIds(b.body));
  }
  return ids;
}

function Figure({
  media,
  caption,
  size,
  fallbackAlt,
  sizes = '(max-width: 900px) 100vw, 880px',
}: {
  media: MediaArg;
  caption?: string | null;
  size?: string | null;
  fallbackAlt: string;
  sizes?: string;
}) {
  const url = mediaUrl(media, 'feature') ?? mediaUrl(media);
  if (!url) return null;
  const text = caption?.trim() || null;
  const alt = (typeof media === 'object' && media?.alt) || text || fallbackAlt;
  const dims =
    (typeof media === 'object' ? mediaDimensions(media, 'feature') : null) ?? {
      width: 1200,
      height: 800,
    };
  return (
    <figure
      className={
        size === 'narrow'
          ? styles.figureNarrow
          : size === 'content'
            ? styles.figureContent
            : undefined
      }
    >
      <Image
        src={url}
        alt={alt}
        width={dims.width}
        height={dims.height}
        sizes={sizes}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      />
      {text && <figcaption>{text}</figcaption>}
    </figure>
  );
}

/**
 * YouTube/Vimeo watch URLs can't be framed directly — convert to the embed
 * form. Returns null for anything unrecognised so we render a plain link
 * rather than an iframe that shows "Video unavailable".
 */
function embedUrl(provider: string | null | undefined, raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  if (provider === 'vimeo' || host.endsWith('vimeo.com')) {
    const id = u.pathname.split('/').filter(Boolean)[0];
    return /^\d+$/.test(id ?? '') ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1);
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host.endsWith('youtube.com')) {
    if (u.pathname.startsWith('/embed/')) return u.toString();
    const id = u.searchParams.get('v');
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  return null;
}

export function ContentBlocks({
  blocks,
  mediaById,
  fallbackAlt,
}: {
  blocks: unknown;
  mediaById: Map<number, unknown>;
  fallbackAlt: string;
}) {
  if (!Array.isArray(blocks)) return null;

  return (
    <>
      {blocks.map((block, i) => {
        if (!block || typeof block !== 'object') return null;
        const b = block as Record<string, unknown>;
        const key = i;

        switch (b.blockType) {
          case 'richText':
            return (
              <div key={key}>
                {renderLexical(b.content as never, { mediaById: mediaById as never })}
              </div>
            );

          case 'image':
            return (
              <Figure
                key={key}
                media={b.image as MediaArg}
                caption={b.caption as string | null}
                size={b.size as string | null}
                fallbackAlt={fallbackAlt}
              />
            );

          case 'hero': {
            // Body-level hero: the page template already renders the doc's own
            // hero, so this is a mid-article banner.
            const heading = (b.heading as string | null)?.trim();
            const sub = (b.subheading as string | null)?.trim();
            const cta = b.cta as { label?: string | null; href?: string | null } | null;
            return (
              <section key={key} className={styles.hero}>
                <Figure
                  media={b.image as MediaArg}
                  fallbackAlt={heading || fallbackAlt}
                  size="content"
                />
                {heading && <h2 className={styles.heroHeading}>{heading}</h2>}
                {sub && <p className={styles.heroSub}>{sub}</p>}
                {cta?.href && cta.label && (
                  <Link href={cta.href} className={styles.ctaBtn}>
                    {cta.label}
                  </Link>
                )}
              </section>
            );
          }

          case 'gallery': {
            const images = (b.images as Array<{ image?: unknown; caption?: string | null }> | null) ?? [];
            const shown = images.filter((row) => row?.image);
            if (shown.length === 0) return null;
            return (
              <div key={key} className={styles.gallery}>
                {shown.map((row, j) => {
                  const media = row.image as MediaArg;
                  const url = mediaUrl(media, 'card') ?? mediaUrl(media);
                  if (!url) return null;
                  const text = row.caption?.trim() || null;
                  const alt = (typeof media === 'object' && media?.alt) || text || fallbackAlt;
                  return (
                    <figure key={j} className={styles.galleryItem}>
                      <Image
                        src={url}
                        alt={alt}
                        fill
                        sizes="(max-width: 700px) 100vw, 50vw"
                        style={{ objectFit: 'cover' }}
                      />
                      {text && <figcaption>{text}</figcaption>}
                    </figure>
                  );
                })}
              </div>
            );
          }

          case 'video': {
            const caption = (b.caption as string | null)?.trim() || null;
            const provider = b.provider as string | null;

            if (provider === 'self') {
              const url = mediaUrl(b.file as MediaArg);
              if (!url) return null;
              return (
                <figure key={key} className={styles.video}>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video src={url} controls preload="metadata" className={styles.videoEl} />
                  {caption && <figcaption>{caption}</figcaption>}
                </figure>
              );
            }

            const raw = typeof b.url === 'string' ? b.url : '';
            if (!raw) return null;
            const embed = embedUrl(provider, raw);
            if (!embed) {
              return (
                <p key={key}>
                  <a href={raw} target="_blank" rel="noopener noreferrer">
                    {caption || 'Watch the video'}
                  </a>
                </p>
              );
            }
            return (
              <figure key={key} className={styles.video}>
                <div className={styles.videoFrame}>
                  <iframe
                    src={embed}
                    title={caption || 'Video'}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                {caption && <figcaption>{caption}</figcaption>}
              </figure>
            );
          }

          case 'callout': {
            const variant = b.variant === 'highlight' || b.variant === 'warning' ? b.variant : 'info';
            const heading = (b.heading as string | null)?.trim();
            return (
              <aside
                key={key}
                className={`${styles.callout} ${
                  variant === 'highlight'
                    ? styles.calloutHighlight
                    : variant === 'warning'
                      ? styles.calloutWarning
                      : styles.calloutInfo
                }`}
              >
                {heading && <p className={styles.calloutHeading}>{heading}</p>}
                <div className={styles.calloutBody}>
                  {renderLexical(b.body as never, { mediaById: mediaById as never })}
                </div>
              </aside>
            );
          }

          case 'cta': {
            const heading = (b.heading as string | null)?.trim();
            const body = (b.body as string | null)?.trim();
            const primary = b.primary as { label?: string | null; href?: string | null } | null;
            const secondary = b.secondary as { label?: string | null; href?: string | null } | null;
            return (
              <section key={key} className={styles.cta}>
                {heading && <h3 className={styles.ctaHeading}>{heading}</h3>}
                {body && <p className={styles.ctaBody}>{body}</p>}
                <div className={styles.ctaActions}>
                  {primary?.href && primary.label && (
                    <Link href={primary.href} className={styles.ctaBtn}>
                      {primary.label}
                    </Link>
                  )}
                  {secondary?.href && secondary.label && (
                    <Link href={secondary.href} className={styles.ctaBtnGhost}>
                      {secondary.label}
                    </Link>
                  )}
                </div>
              </section>
            );
          }

          default:
            return null;
        }
      })}
    </>
  );
}
