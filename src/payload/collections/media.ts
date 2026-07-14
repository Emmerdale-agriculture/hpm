import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload';
import { revalidateTag } from 'next/cache';

// Camera/device names (IMG_1234, DSC0001, PXL_2026…, Screenshot 2026-…,
// long digit/hex runs) make useless alt text — leave those blank so the
// frontend's contextual fallbacks (post title etc.) apply instead.
// Public bucket URL for a stored media file. Must stay in step with the
// s3Storage generateFileURL in payload.config.ts and SUPABASE_PUBLIC_BASE
// in src/lib/media.ts.
export const publicMediaFileURL = (filename: string): string =>
  `https://unakyuksioglmihvipmi.supabase.co/storage/v1/object/public/hpm-media/media/${encodeURIComponent(filename)}`;

const looksLikeCameraFilename = (base: string): boolean => {
  const compact = base.replace(/\s+/g, '');
  if (/^(img|dsc|dscn|pxl|gopr|image|photo|screenshot|untitled)?[\s_-]*[0-9a-f-]{4,}$/i.test(compact)) return true;
  const letters = (base.match(/[a-z]/gi) ?? []).length;
  return letters < base.length * 0.4;
};

// Derive human-readable alt AND caption from the filename on first upload
// when left blank ("Althorne horse breeders.webp" → "Althorne horse
// breeders"), so bulk uploads save without opening every file's edit form.
// Create-only: clearing either field later must stick, not silently re-fill.
// Captions render publicly under photos, hence the camera-name guard.
const altFromFilename: CollectionBeforeValidateHook = ({ data, operation, req }) => {
  if (!data || operation !== 'create') return data;
  const source =
    (typeof data.filename === 'string' && data.filename) || req?.file?.name || '';
  const base = source
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base || looksLikeCameraFilename(base)) return data;
  const derived = base.charAt(0).toUpperCase() + base.slice(1);
  if (!(typeof data.alt === 'string' && data.alt.trim())) data.alt = derived;
  if (!(typeof data.caption === 'string' && data.caption.trim())) data.caption = derived;
  return data;
};

// unstable_cache tag used by gallery/page.tsx so toggles in the admin
// reflect on the public site immediately rather than after the 5-min TTL.
const revalidateMedia = () => {
  try {
    revalidateTag('media');
  } catch {
    // revalidateTag throws if called outside a request scope (e.g. seed scripts).
    // Safe to ignore — the cache will refresh on its own TTL.
  }
};

/**
 * Media — every image, video, or file upload.
 *
 * Alt text is auto-derived from descriptive filenames on upload (create
 * only); camera-style names are skipped so frontend fallbacks apply.
 *
 * Storage: in production, this collection will be configured to store
 * files in Supabase Storage via @payloadcms/storage-s3. In development,
 * files are stored locally under /media/.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Media', plural: 'Media' },
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'alt', 'hideFromGallery', 'showOnHomepageGallery', 'updatedAt'],
  },
  access: {
    // Public read — the frontend renders these images on every page.
    read: () => true,
  },
  hooks: {
    beforeValidate: [altFromFilename],
    afterChange: [revalidateMedia],
    afterDelete: [revalidateMedia],
  },
  upload: {
    // Generate responsive sizes for <picture>/srcset. Each variant converts
    // to webp; the ORIGINAL file must keep its uploaded format — with
    // clientUploads the browser has already PUT the original to storage, and
    // a main-file format conversion would rename the doc to a .webp object
    // that never gets uploaded (every non-webp upload would 404).
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300, position: 'centre', formatOptions: { format: 'webp', options: { quality: 82 } } },
      { name: 'card', width: 768, height: 512, position: 'centre', formatOptions: { format: 'webp', options: { quality: 82 } } },
      { name: 'feature', width: 1200, height: 800, position: 'centre', formatOptions: { format: 'webp', options: { quality: 82 } } },
      { name: 'hero', width: 2000, height: 1200, position: 'centre', formatOptions: { format: 'webp', options: { quality: 82 } } },
      // Width-only (no height ⇒ no crop). For places that want the full
      // composition but at a sane bandwidth: hero photos, gallery lightbox.
      { name: 'large', width: 2000, formatOptions: { format: 'webp', options: { quality: 82 } } },
    ],
    // A function, not the size name: the string form builds thumbnailURL
    // from the /api/media/file/* proxy route, which disablePayloadAccessControl
    // removed — the admin list rendered no thumbnails at all. Point straight
    // at the public bucket instead.
    adminThumbnail: ({ doc }) => {
      const sizes = doc?.sizes as
        | Record<string, { filename?: string | null }>
        | null
        | undefined;
      const filename = sizes?.thumbnail?.filename ?? (doc?.filename as string | undefined);
      return typeof filename === 'string' && filename ? publicMediaFileURL(filename) : null;
    },
    mimeTypes: ['image/*', 'video/mp4', 'application/pdf'],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      admin: {
        description:
          'Describe the image in one short sentence for screen readers and SEO. Auto-filled from the filename if left blank.',
      },
    },
    {
      name: 'caption',
      type: 'text',
      admin: {
        description:
          'Optional caption shown with the image on the site. Auto-filled from a descriptive filename if left blank.',
      },
    },
    {
      name: 'credit',
      type: 'text',
      admin: {
        description: 'Optional photo credit.',
      },
    },
    {
      name: 'showOnHomepageGallery',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        position: 'sidebar',
        description:
          'Include this image in the 12-image homepage gallery grid (newest first). On by default for new uploads — untick to keep an image off the homepage.',
        components: {
          Cell: '@/payload/admin/BoolToggleCell#BoolToggleCell',
        },
      },
    },
    {
      name: 'hideFromGallery',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Exclude this image from the public /gallery page (and the homepage gallery).',
        components: {
          Cell: '@/payload/admin/BoolToggleCell#BoolToggleCell',
        },
      },
    },
    {
      name: 'wpId',
      type: 'number',
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'WordPress post/page ID — for migration tracking. Do not edit.',
      },
    },
    {
      name: 'wpUrl',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Original WordPress URL at time of import. Do not edit.',
      },
    },
  ],
};
