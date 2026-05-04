import type { CollectionConfig } from 'payload';
import { revalidateTag } from 'next/cache';
import { seoFields } from '../fields/seo';
import { slugField } from '../fields/slug';
import { allContentBlocks } from '../blocks/content-blocks';
import { autoDerive } from '../hooks/auto-derive';

const revalidatePosts = () => {
  try {
    revalidateTag('posts');
  } catch {
    // revalidateTag throws if called outside a request scope (e.g. seed scripts).
    // Safe to ignore — the cache will refresh on its own TTL.
  }
};

/**
 * Posts — blog posts.
 *
 * URL pattern: /<slug>  (NOT /blog/<slug>, to match the existing WP structure
 * and preserve rankings. The /blog/ route is a listing page, not a prefix.)
 *
 * Category is deliberately a simple enum rather than a relation — we don't
 * need a whole Categories collection for the two groupings that matter.
 * If that changes, upgrade to a relation later.
 */
export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: 'Blog post', plural: 'Blog posts' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', '_status', 'publishedAt'],
    description: 'Blog posts. Each maps to /<slug>.',
  },
  access: {
    read: () => true,
  },
  versions: {
    drafts: {
      autosave: { interval: 2000 },
      schedulePublish: true,
    },
    maxPerDoc: 20,
  },
  hooks: {
    // Auto-fills excerpt from body and tags from the curated taxonomy
    // defined in auto-derive.ts (topping, weeds, seasonal, equipment,
    // ground-care, advice, drainage, kit). Authors can still override
    // either field by hand — auto-derive only fills when they're blank.
    beforeValidate: [autoDerive({ excerpt: true, tags: true })],
    afterChange: [revalidatePosts],
    afterDelete: [revalidatePosts],
  },
  defaultSort: '-publishedAt',
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    slugField('title'),
    {
      name: 'excerpt',
      type: 'textarea',
      maxLength: 300,
      admin: {
        description: 'Short summary shown on the blog index and in link previews.',
      },
    },
    {
      name: 'heroImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      defaultValue: 'paddock',
      options: [
        { label: 'Paddock & Land Management', value: 'paddock' },
        { label: 'Machinery Reviews', value: 'machinery' },
        { label: 'Case Studies', value: 'case-study' },
        { label: 'Commentary (Videscape/Clickasnap)', value: 'commentary' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Controls where the post appears. "Commentary" posts are kept on the blog but not featured on the paddock-focused home/services areas.',
      },
    },
    {
      name: 'tags',
      type: 'array',
      admin: {
        position: 'sidebar',
        description:
          'Curated taxonomy: topping, weeds, seasonal, equipment, ground-care, advice, drainage, kit. Lowercase, hyphenated. Drives the Notes index filter chips.',
      },
      fields: [{ name: 'tag', type: 'text' }],
    },
    {
      name: 'primaryTag',
      type: 'text',
      admin: {
        position: 'sidebar',
        description:
          'Single tag (slug form, e.g. "topping") that drives the auto-generated service CTA panel on the post page. Should match one of the tags above.',
      },
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description:
          'Show this post in the large featured slot at the top of /notes. Flag at most one at a time; the most recent wins if multiple are flagged.',
      },
    },
    {
      name: 'readTime',
      type: 'number',
      admin: {
        position: 'sidebar',
        description:
          'Optional read-time in minutes. Computed from word count if left blank.',
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
      },
      hooks: {
        beforeChange: [
          ({ siblingData, value }) => {
            // Auto-set on first publish
            if (siblingData._status === 'published' && !value) {
              return new Date();
            }
            return value;
          },
        ],
      },
    },
    {
      name: 'content',
      type: 'blocks',
      blocks: allContentBlocks,
    },
    ...seoFields,
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
      name: 'seoSource',
      type: 'select',
      defaultValue: 'manual',
      options: [
        { label: 'Manual', value: 'manual' },
        { label: 'Agent-generated', value: 'agent' },
        { label: 'Imported (WordPress)', value: 'imported' },
      ],
      admin: {
        position: 'sidebar',
        description: 'How this post originated. Agent-generated posts must be reviewed before publishing.',
      },
    },
  ],
};
