import type { CollectionConfig } from 'payload';

/**
 * Tenders — council / public-sector contract opportunities.
 *
 * Populated daily by the cron at /api/tender-watch, which scans
 * Contracts Finder + Find a Tender and upserts three kinds of row:
 *   - open:      live tender, actionBy = submission deadline
 *   - pipeline:  early-warning / pre-market notice (soft market test, PIN)
 *   - renewal:   awarded contract still running — actionBy = end date
 *                minus RENEWAL_LEAD_MONTHS, so you approach the buyer
 *                before it's re-tendered
 * plus hand-entered `lead` rows (e.g. framework holders to subcontract to).
 *
 * The watcher only ever creates rows or refreshes factual fields
 * (deadline, values, incumbent…). status / fit / notes are yours —
 * it never overwrites them.
 */
export const Tenders: CollectionConfig = {
  slug: 'tenders',
  labels: { singular: 'Tender', plural: 'Tenders' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'buyer', 'kind', 'status', 'actionBy', 'valueHigh', 'incumbent'],
    group: 'Tenders',
    listSearchableFields: ['title', 'buyer', 'incumbent', 'postcode'],
    description:
      'Council & public-sector opportunities found by the daily tender watch. Sorted by action-by date: deadline for open tenders, ~4 months before contract end for renewals.',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  defaultSort: 'actionBy',
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'buyer', type: 'text', index: true },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'open',
      options: [
        { label: 'Open tender', value: 'open' },
        { label: 'Pipeline / early notice', value: 'pipeline' },
        { label: 'Renewal (awarded, running)', value: 'renewal' },
        { label: 'Lead (manual / subcontract)', value: 'lead' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      index: true,
      options: [
        { label: 'New', value: 'new' },
        { label: 'Watching', value: 'watching' },
        { label: 'Reviewing', value: 'reviewing' },
        { label: 'Bidding', value: 'bidding' },
        { label: 'Submitted', value: 'submitted' },
        { label: 'Won', value: 'won' },
        { label: 'Lost', value: 'lost' },
        { label: 'No bid', value: 'no_bid' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'fit',
      type: 'select',
      options: [
        { label: 'Rural (verge/hedge/ditch/scrub/meadow)', value: 'rural' },
        { label: 'Grounds maintenance (parish/amenity)', value: 'grounds' },
        { label: 'Subcontract', value: 'subcontract' },
        { label: 'Unsure', value: 'unsure' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'actionBy',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' },
        description: 'Open: submission deadline. Renewal: when to approach the buyer.',
      },
    },
    {
      type: 'row',
      fields: [
        { name: 'deadline', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'contractStart', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
        { name: 'contractEnd', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'valueLow', type: 'number', admin: { description: '£' } },
        { name: 'valueHigh', type: 'number', admin: { description: '£' } },
        { name: 'incumbent', type: 'text', admin: { description: 'Current / awarded supplier' } },
      ],
    },
    { name: 'url', type: 'text', admin: { description: 'Notice link — tender documents are usually on the buyer’s portal linked from here.' } },
    { name: 'description', type: 'textarea' },
    { name: 'notes', type: 'textarea', admin: { description: 'Your notes — bid/no-bid reasoning, contacts, clarification questions.' } },
    {
      type: 'collapsible',
      label: 'Source details',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'source',
          type: 'select',
          defaultValue: 'manual',
          options: [
            { label: 'Contracts Finder', value: 'contracts_finder' },
            { label: 'Find a Tender', value: 'find_a_tender' },
            { label: 'Manual', value: 'manual' },
          ],
        },
        {
          name: 'sourceKey',
          type: 'text',
          unique: true,
          index: true,
          admin: { description: 'Dedup key used by the watcher. Leave blank for manual rows.' },
        },
        { name: 'postcode', type: 'text' },
        { name: 'distanceMiles', type: 'number' },
        { name: 'cpv', type: 'text', admin: { description: 'CPV category codes' } },
        { name: 'matched', type: 'text', admin: { description: 'Keywords / codes that triggered the match' } },
        { name: 'score', type: 'number', admin: { description: 'Relevance score (higher = closer fit)' } },
        { name: 'publishedAt', type: 'date' },
        { name: 'lastSeenAt', type: 'date', admin: { readOnly: true } },
      ],
    },
  ],
  timestamps: true,
};
