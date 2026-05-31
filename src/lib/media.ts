/**
 * Helpers for rendering Payload Media documents on the public frontend.
 *
 * Images are stored in Supabase Storage under the `hpm-media` bucket, prefix
 * `media/`. Payload exposes each record with a `filename` (original) and a
 * `sizes` object containing generated variants.
 */

const SUPABASE_PUBLIC_BASE =
  'https://unakyuksioglmihvipmi.supabase.co/storage/v1/object/public/hpm-media/media/';

export type MediaSize = 'thumbnail' | 'card' | 'feature' | 'hero' | 'large';

type MediaLike = {
  filename?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  sizes?: Partial<Record<MediaSize, { filename?: string | null; width?: number | null; height?: number | null }>> | null;
};

/**
 * Build a public Supabase Storage URL for a Payload Media doc.
 * If a size variant is requested and exists, uses that; otherwise falls back
 * to the full-size upload.
 */
export function mediaUrl(
  media: MediaLike | number | string | null | undefined,
  size?: MediaSize,
): string | null {
  if (!media || typeof media !== 'object') return null;
  if (size && media.sizes?.[size]?.filename) {
    return SUPABASE_PUBLIC_BASE + media.sizes[size].filename;
  }
  if (media.filename) return SUPABASE_PUBLIC_BASE + media.filename;
  return null;
}

/**
 * Best-effort width/height pair for layout. Returns the size variant's
 * dimensions when requested and available, otherwise the original.
 */
export function mediaDimensions(
  media: MediaLike | null | undefined,
  size?: MediaSize,
): { width: number; height: number } | null {
  if (!media) return null;
  const s = size && media.sizes?.[size];
  const w = s?.width ?? media.width;
  const h = s?.height ?? media.height;
  if (!w || !h) return null;
  return { width: w, height: h };
}
