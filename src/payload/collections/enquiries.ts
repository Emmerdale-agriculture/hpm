import type { CollectionConfig } from 'payload';

/**
 * Enquiries — contact-form submissions.
 *
 * Stored in the DB AND emailed via Resend (on the create hook, configured
 * in the main payload.config.ts afterChange hook or a custom endpoint).
 *
 * Reasoning for storing:
 *  - Email is fire-and-forget; if delivery fails, you still have the lead
 *  - Admin UI lets you review, tag, and mark leads as handled
 *  - Over time, you'll want to analyse which services generate enquiries
 */
export const Enquiries: CollectionConfig = {
  slug: 'enquiries',
  labels: { singular: 'Enquiry', plural: 'Enquiries' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'service', 'status', 'createdAt'],
    description: 'Contact-form submissions.',
    group: 'Admin',
  },
  access: {
    // Only admins see enquiries; public can only create via the API endpoint
    read: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
    create: () => true, // Public form submissions
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'email', type: 'email', required: true },
    { name: 'phone', type: 'text' },
    {
      name: 'service',
      type: 'relationship',
      relationTo: 'services',
      admin: { description: 'Which service they were interested in, if known.' },
    },
    { name: 'acres', type: 'text', admin: { description: 'Free text — "about 3 acres", "2 paddocks", etc.' } },
    { name: 'location', type: 'text' },
    { name: 'message', type: 'textarea', required: true },
    {
      name: 'status',
      type: 'select',
      // Public form submissions (via overrideAccess:false on the REST
      // endpoint) must not be able to set status/internalNotes/meta. Trusted
      // server-side writes use the Local API (overrideAccess:true) and bypass
      // this, so the contact route and quote action can still stamp them.
      access: {
        create: ({ req: { user } }) => Boolean(user),
        update: ({ req: { user } }) => Boolean(user),
      },
      defaultValue: 'new',
      options: [
        { label: 'New', value: 'new' },
        { label: 'Contacted', value: 'contacted' },
        { label: 'Quoted', value: 'quoted' },
        { label: 'Won', value: 'won' },
        { label: 'Lost', value: 'lost' },
        { label: 'Spam', value: 'spam' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'internalNotes',
      type: 'textarea',
      access: {
        create: ({ req: { user } }) => Boolean(user),
        update: ({ req: { user } }) => Boolean(user),
      },
      admin: { description: 'Private notes, never shown publicly.' },
    },
    // Honeypot-adjacent metadata for spam filtering
    {
      name: 'meta',
      type: 'group',
      access: {
        create: ({ req: { user } }) => Boolean(user),
        update: ({ req: { user } }) => Boolean(user),
      },
      admin: { position: 'sidebar', description: 'Submission metadata.' },
      fields: [
        { name: 'ip', type: 'text' },
        { name: 'userAgent', type: 'text' },
        { name: 'referer', type: 'text' },
      ],
    },
  ],
};
