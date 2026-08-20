import type { Block } from 'payload';

/**
 * Content blocks used inside Pages and Posts.
 *
 * Philosophy:
 *  - Keep blocks small and compositional. Don't build a block for every
 *    visual pattern — most things are just RichText with good styling.
 *  - Media blocks capture intent (hero, caption, gallery) so the frontend
 *    can render appropriately.
 *  - We intentionally do NOT replicate WordPress page-builder madness.
 *    If we need a new block, we add it deliberately.
 */

export const RichTextBlock: Block = {
  slug: 'richText',
  labels: { singular: 'Text', plural: 'Text blocks' },
  fields: [
    {
      name: 'content',
      type: 'richText',
      required: true,
    },
  ],
};

export const HeroBlock: Block = {
  slug: 'hero',
  labels: { singular: 'Hero', plural: 'Heros' },
  fields: [
    { name: 'heading', type: 'text', required: true },
    { name: 'subheading', type: 'text' },
    { name: 'image', type: 'upload', relationTo: 'media' },
    {
      name: 'cta',
      type: 'group',
      fields: [
        { name: 'label', type: 'text' },
        { name: 'href', type: 'text' },
      ],
    },
  ],
};

export const ImageBlock: Block = {
  slug: 'image',
  labels: { singular: 'Image', plural: 'Images' },
  fields: [
    { name: 'image', type: 'upload', relationTo: 'media', required: true },
    { name: 'caption', type: 'text' },
    {
      name: 'size',
      type: 'select',
      defaultValue: 'full',
      options: [
        { label: 'Full width', value: 'full' },
        { label: 'Content width', value: 'content' },
        { label: 'Narrow', value: 'narrow' },
      ],
    },
  ],
};

export const GalleryBlock: Block = {
  slug: 'gallery',
  labels: { singular: 'Gallery', plural: 'Galleries' },
  fields: [
    {
      name: 'images',
      type: 'array',
      minRows: 2,
      fields: [
        { name: 'image', type: 'upload', relationTo: 'media', required: true },
        { name: 'caption', type: 'text' },
      ],
    },
  ],
};

export const VideoBlock: Block = {
  slug: 'video',
  labels: { singular: 'Video', plural: 'Videos' },
  fields: [
    {
      name: 'provider',
      type: 'select',
      defaultValue: 'youtube',
      options: [
        { label: 'YouTube', value: 'youtube' },
        { label: 'Vimeo', value: 'vimeo' },
        { label: 'TikTok', value: 'tiktok' },
        { label: 'Self-hosted (upload)', value: 'self' },
      ],
    },
    {
      name: 'url',
      type: 'text',
      admin: {
        condition: (_, siblingData) => siblingData?.provider !== 'self',
        description:
          'Paste the video URL. TikTok links look like https://www.tiktok.com/@handle/video/1234567890.',
      },
    },
    {
      name: 'file',
      type: 'upload',
      relationTo: 'media',
      admin: {
        condition: (_, siblingData) => siblingData?.provider === 'self',
      },
    },
    { name: 'caption', type: 'text' },
  ],
};

export const CalloutBlock: Block = {
  slug: 'callout',
  labels: { singular: 'Callout', plural: 'Callouts' },
  fields: [
    {
      name: 'variant',
      type: 'select',
      defaultValue: 'info',
      options: [
        { label: 'Info', value: 'info' },
        { label: 'Highlight', value: 'highlight' },
        { label: 'Warning', value: 'warning' },
      ],
    },
    { name: 'heading', type: 'text' },
    { name: 'body', type: 'richText' },
  ],
};

export const CtaBlock: Block = {
  slug: 'cta',
  labels: { singular: 'Call to action', plural: 'Calls to action' },
  fields: [
    { name: 'heading', type: 'text', required: true },
    { name: 'body', type: 'textarea' },
    {
      name: 'primary',
      type: 'group',
      fields: [
        { name: 'label', type: 'text' },
        { name: 'href', type: 'text' },
      ],
    },
    {
      name: 'secondary',
      type: 'group',
      fields: [
        { name: 'label', type: 'text' },
        { name: 'href', type: 'text' },
      ],
    },
  ],
};

export const allContentBlocks = [
  RichTextBlock,
  HeroBlock,
  ImageBlock,
  GalleryBlock,
  VideoBlock,
  CalloutBlock,
  CtaBlock,
];
