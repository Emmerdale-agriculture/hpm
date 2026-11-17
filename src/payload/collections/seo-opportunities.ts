import type { CollectionConfig } from 'payload';

/**
 * SeoOpportunities — drafts produced by the weekly Cheatcode SEO agent.
 *
 * Populated by the cron at /api/cheatcode. The agent never publishes;
 * everything lands here as `pending` for Tom to review and act on.
 *
 * Uniqueness: weekIdentified + query + type — re-running the same
 * week's data must not create duplicates.
 */
export const SeoOpportunities: CollectionConfig = {
  slug: 'seo-opportunities',
  labels: { singular: 'SEO opportunity', plural: 'SEO opportunities' },
  admin: {
    useAsTitle: 'query',
    defaultColumns: ['query', 'type', 'status', 'weekIdentified', 'metrics.impressions', 'metrics.position'],
    group: 'Cheatcode',
    description:
      'Weekly opportunities surfaced by the agent. Review pending rows and apply the suggested changes by hand.',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  defaultSort: '-weekIdentified',
  fields: [
    { name: 'query', type: 'text', required: true, index: true },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Meta rewrite', value: 'meta_rewrite' },
        { label: 'On-page tweak', value: 'on_page_tweak' },
        { label: 'New article', value: 'new_article' },
      ],
    },
    {
      name: 'intent',
      type: 'select',
      options: [
        { label: 'Transactional', value: 'transactional' },
        { label: 'Navigational', value: 'navigational' },
        { label: 'Commercial', value: 'commercial' },
        { label: 'Informational', value: 'informational' },
        { label: 'Local', value: 'local' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending review', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
        { label: 'Completed', value: 'completed' },
        { label: 'Superseded', value: 'superseded' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'weekIdentified',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'ISO week, e.g. 2026-W17.' },
    },
    {
      name: 'metrics',
      type: 'group',
      fields: [
        { name: 'impressions', type: 'number' },
        { name: 'clicks', type: 'number' },
        { name: 'ctr', type: 'number', admin: { description: 'Decimal, e.g. 0.034 = 3.4%.' } },
        { name: 'position', type: 'number' },
        { name: 'expectedCtr', type: 'number', admin: { description: 'Position-expected CTR benchmark.' } },
      ],
    },
    {
      name: 'rationale',
      type: 'textarea',
      admin: { description: 'Why the agent flagged this.' },
    },
    {
      name: 'targetPage',
      type: 'relationship',
      relationTo: ['pages', 'posts', 'services'],
      admin: { description: 'For meta_rewrite and on_page_tweak.' },
    },
    {
      name: 'draftContent',
      type: 'json',
      admin: {
        description:
          'Proposed changes — schema varies by type. meta_rewrite: { alternatives: [{title,meta,rationale}] }. on_page_tweak: { newH2, newH2Body, internalLinksToAdd, faqAdditions }. new_article: { title, metaDescription, slug, bodyMarkdown, suggestedInternalLinks }.',
      },
    },
    {
      name: 'relatedPost',
      type: 'relationship',
      relationTo: 'posts',
      admin: { description: 'For new_article — the draft Post created alongside this opportunity.' },
    },
    {
      name: 'deferred',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'For new_article — true when the row was queued past the per-week generation cap and has no draft yet. Read-only signal for the digest.',
        readOnly: true,
        position: 'sidebar',
      },
    },
    { name: 'notes', type: 'textarea' },
    {
      name: 'decidedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'agentRunId',
      type: 'text',
      admin: { readOnly: true, description: 'Internal — links opportunities back to a single agent run.' },
    },
  ],
  timestamps: true,
};
