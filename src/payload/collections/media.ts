import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload';
import { revalidateTag } from 'next/cache';

// Derive a human-readable alt from the filename when the author leaves it
// blank ("Althorne horse breeders.webp" → "Althorne horse breeders"), so
// bulk uploads save without opening every file's edit form. Authors can
// still write a better one by hand afterwards.
const altFromFilename: CollectionBeforeValidateHook = ({ data, req }) => {
  if (!data) return data;
  if (typeof data.alt === 'string' && data.alt.trim()) return data;
  const source =
    (typeof data.filename === 'string' && data.filename) || req?.file?.name || '';
  const base = source
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return data;
  data.alt = base.charAt(0).toUpperCase() + base.slice(1);
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
 * Alt text is required for accessibility and SEO. Payload enforces this
 * at the field level.
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
    // Generate responsive sizes for <picture>/srcset
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300, position: 'centre' },
      { name: 'card', width: 768, height: 512, position: 'centre' },
      { name: 'feature', width: 1200, height: 800, position: 'centre' },
      { name: 'hero', width: 2000, height: 1200, position: 'centre' },
      // Width-only (no height ⇒ no crop). For places that want the full
      // composition but at a sane bandwidth: hero photos, gallery lightbox.
      { name: 'large', width: 2000 },
    ],
    // Strip EXIF / orientation — matters when owners upload phone photos
    formatOptions: {
      format: 'webp',
      options: { quality: 82 },
    },
    adminThumbnail: 'thumbnail',
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
        description: 'Optional caption shown with the image on the site.',
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
