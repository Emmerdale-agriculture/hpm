import type { GlobalConfig } from 'payload';

/**
 * Site settings — singleton configuration.
 *
 * Edit once, referenced everywhere. Business info is also used to
 * generate LocalBusiness schema.org JSON-LD automatically, which is
 * critical for local search rankings.
 */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site settings',
  access: { read: () => true },
  fields: [
    {
      name: 'business',
      type: 'group',
      label: 'Business information',
      admin: { description: 'Used across the site AND for Google schema.' },
      fields: [
        { name: 'legalName', type: 'text', required: true, defaultValue: 'Emmerdale Agriculture Limited' },
        { name: 'tradingName', type: 'text', required: true, defaultValue: 'Hampshire Paddock Management' },
        { name: 'companyNumber', type: 'text', defaultValue: '14950816' },
        { name: 'phone', type: 'text', required: true, defaultValue: '07825156062' },
        { name: 'email', type: 'email', required: true, defaultValue: 'tom@hampshirepaddockmanagement.com' },
        {
          name: 'address',
          type: 'group',
          fields: [
            { name: 'street', type: 'text' },
            { name: 'city', type: 'text' },
            { name: 'region', type: 'text', defaultValue: 'Hampshire' },
            { name: 'postcode', type: 'text' },
            { name: 'country', type: 'text', defaultValue: 'United Kingdom' },
          ],
        },
        {
          name: 'serviceAreas',
          type: 'array',
          admin: {
            description:
              'Counties and regions served. Each appears in the schema as an areaServed entry.',
          },
          fields: [{ name: 'name', type: 'text', required: true }],
          defaultValue: [
            { name: 'Hampshire' },
            { name: 'Wiltshire' },
            { name: 'Berkshire' },
            { name: 'Surrey' },
            { name: 'Dorset' },
            { name: 'Sussex' },
          ],
        },
      ],
    },
    {
      name: 'branding',
      type: 'group',
      fields: [
        { name: 'logo', type: 'upload', relationTo: 'media' },
        { name: 'logoDark', type: 'upload', relationTo: 'media', admin: { description: 'Optional dark-mode logo.' } },
        { name: 'favicon', type: 'upload', relationTo: 'media' },
        { name: 'ogDefault', type: 'upload', relationTo: 'media', admin: { description: 'Fallback social sharing image.' } },
      ],
    },
    {
      name: 'navigation',
      type: 'group',
      fields: [
        {
          name: 'header',
          type: 'array',
          fields: [
            { name: 'label', type: 'text', required: true },
            { name: 'href', type: 'text', required: true },
          ],
          defaultValue: [
            { label: 'Services', href: '/services' },
            { label: 'Costs', href: '/costs' },
            { label: 'Gallery', href: '/gallery' },
            { label: 'Videos', href: '/videos' },
            { label: 'Blog', href: '/blog' },
            { label: 'About', href: '/about' },
            { label: 'Contact', href: '/contact' },
          ],
        },
        {
          name: 'footerColumns',
          type: 'array',
          fields: [
            { name: 'heading', type: 'text' },
            {
              name: 'links',
              type: 'array',
              fields: [
                { name: 'label', type: 'text', required: true },
                { name: 'href', type: 'text', required: true },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'social',
      type: 'group',
      fields: [
        { name: 'facebook', type: 'text' },
        { name: 'instagram', type: 'text' },
        { name: 'youtube', type: 'text' },
        { name: 'x', type: 'text', label: 'X / Twitter' },
      ],
    },
    {
      name: 'seo',
      type: 'group',
      fields: [
        { name: 'defaultTitle', type: 'text' },
        { name: 'titleTemplate', type: 'text', defaultValue: '%s | Hampshire Paddock Management' },
        { name: 'defaultDescription', type: 'textarea' },
      ],
    },
  ],
};
