import type { GlobalConfig } from 'payload'

/**
 * PricingPage global — all editable copy for /pricing.
 *
 * Edit in the admin panel at /admin/globals/pricing-page.
 * Fetched from the frontend via payload.findGlobal({ slug: 'pricing-page' }).
 */
export const PricingPage: GlobalConfig = {
  slug: 'pricing-page',
  label: 'Pricing page',
  admin: {
    group: 'Pages',
    description: 'Content for the /pricing page.',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Hero & intro',
          fields: [
            {
              name: 'eyebrow',
              type: 'text',
              required: true,
              defaultValue: 'Pricing',
              admin: { description: 'Small label above the hero headline.' },
            },
            {
              name: 'heading',
              type: 'text',
              required: true,
              defaultValue: 'Honest pricing, built around your land',
            },
            {
              name: 'subheading',
              type: 'textarea',
              required: true,
              defaultValue:
                "Every paddock is different. We quote based on what your land actually needs — not a one-size-fits-all rate sheet.",
            },
            {
              name: 'introQuote',
              type: 'textarea',
              required: true,
              admin: {
                description: 'Italic Georgia quote shown below the hero.',
              },
              defaultValue:
                "A two-acre paddock with good access takes less time to top than a five-acre field with steep banks and a narrow gateway. We don't pretend otherwise.",
            },
          ],
        },
        {
          label: 'Pricing models',
          fields: [
            {
              name: 'modelsHeading',
              type: 'text',
              required: true,
              defaultValue: 'How we price',
            },
            {
              name: 'modelsIntro',
              type: 'textarea',
              required: true,
              defaultValue:
                'We use the unit that fits the work. Variable jobs where access and terrain matter most are hourly. Pure ground-coverage work is per acre. Specialist day-long jobs and ongoing programmes are priced separately.',
            },
            {
              name: 'pricingModels',
              type: 'array',
              minRows: 1,
              maxRows: 6,
              required: true,
              labels: { singular: 'Model', plural: 'Models' },
              admin: { description: 'Cards shown after the intro.' },
              fields: [
                {
                  name: 'title',
                  type: 'text',
                  required: true,
                },
                {
                  name: 'description',
                  type: 'textarea',
                  required: true,
                },
                {
                  name: 'tagline',
                  type: 'text',
                  admin: { description: 'Italic line below the description.' },
                },
              ],
              defaultValue: [
                {
                  title: 'Hourly',
                  description:
                    'Topping, rolling, rotavating, hedge cutting, soil aeration, dung sweeping. You only pay for time on the ground.',
                  tagline: 'Fairest for variable jobs',
                },
                {
                  title: 'Per acre',
                  description:
                    'Harrowing and overseeding. Pure ground-coverage work where acreage is the honest unit.',
                  tagline: 'Predictable for big jobs',
                },
                {
                  title: 'Day rate',
                  description:
                    'Fertiliser, spraying, ploughing, mole ploughing and drainage. Specialist jobs that need a full day of setup, application, and cleardown.',
                  tagline: 'Materials priced separately',
                },
                {
                  title: 'Programme',
                  description:
                    'Multi-visit packages — full paddock rejuvenation, year-round care, scheduled fertiliser cycles.',
                  tagline: 'Best value over time',
                },
              ],
            },
          ],
        },
        {
          label: 'Travel',
          fields: [
            {
              name: 'travelHeading',
              type: 'text',
              required: true,
              defaultValue: 'Travel charged at £69 per hour + VAT',
            },
            {
              name: 'travelBody',
              type: 'textarea',
              required: true,
              defaultValue:
                "Calculated hourly from our Hampshire base to your job site and back, at current fuel costs. Always shown as a separate line on your quote so you know exactly what you're paying for. Closer jobs cost less to travel to — simple as that.",
            },
          ],
        },
        {
          label: 'Service table',
          fields: [
            {
              name: 'tableHeading',
              type: 'text',
              required: true,
              defaultValue: 'Pricing by service',
            },
            {
              name: 'serviceRows',
              type: 'array',
              required: true,
              minRows: 1,
              labels: { singular: 'Service', plural: 'Services' },
              fields: [
                {
                  name: 'name',
                  type: 'text',
                  required: true,
                },
                {
                  name: 'pricingType',
                  type: 'select',
                  required: true,
                  options: [
                    { label: 'Hourly', value: 'hourly' },
                    { label: 'Per acre', value: 'perAcre' },
                    { label: 'Day rate', value: 'dayRate' },
                    { label: 'Programme', value: 'programme' },
                  ],
                },
              ],
              defaultValue: [
                { name: 'Paddock topping', pricingType: 'hourly' },
                { name: 'Paddock rolling', pricingType: 'hourly' },
                { name: 'Field rotavating', pricingType: 'hourly' },
                { name: 'Hedge cutting', pricingType: 'hourly' },
                { name: 'Soil aeration', pricingType: 'hourly' },
                { name: 'Dung sweeping', pricingType: 'hourly' },
                { name: 'Field harrowing', pricingType: 'perAcre' },
                { name: 'Overseeding', pricingType: 'perAcre' },
                { name: 'Fertiliser application', pricingType: 'dayRate' },
                {
                  name: 'Weed control (ragwort, docks, thistles)',
                  pricingType: 'dayRate',
                },
                {
                  name: 'Mole ploughing & drainage',
                  pricingType: 'dayRate',
                },
                { name: 'Field ploughing', pricingType: 'dayRate' },
                { name: 'Full paddock rejuvenation', pricingType: 'programme' },
              ],
            },
          ],
        },
        {
          label: 'Quote factors',
          fields: [
            {
              name: 'factorsHeading',
              type: 'text',
              required: true,
              defaultValue: 'What affects your quote',
            },
            {
              name: 'factors',
              type: 'array',
              required: true,
              minRows: 1,
              labels: { singular: 'Factor', plural: 'Factors' },
              fields: [
                { name: 'title', type: 'text', required: true },
                { name: 'body', type: 'textarea', required: true },
              ],
              defaultValue: [
                {
                  title: 'Acreage',
                  body: "Larger fields work out cheaper per acre — setup is the same whether it's two acres or twelve.",
                },
                {
                  title: 'Access',
                  body: 'Wide gateways and good hardstanding save time. Awkward access on a tractor and trailer adds to the day.',
                },
                {
                  title: 'Land condition',
                  body: 'Heavy thistle, ragwort, or first-cut after years of neglect takes longer than routine maintenance.',
                },
                {
                  title: 'Travel distance',
                  body: '£69/hr + VAT from our Hampshire base. We cover Hampshire, Wiltshire, Berkshire, Sussex, Dorset and Surrey.',
                },
                {
                  title: 'Terrain',
                  body: 'Steep banks, wet ground, and obstacles slow things down. Flat, dry, open fields move quickly.',
                },
                {
                  title: 'Frequency',
                  body: 'Booking ongoing maintenance is cheaper per visit than calling us out for one job a year.',
                },
              ],
            },
          ],
        },
        {
          label: 'Quote process',
          fields: [
            {
              name: 'processHeading',
              type: 'text',
              required: true,
              defaultValue: 'How a quote works',
            },
            {
              name: 'processSteps',
              type: 'array',
              required: true,
              minRows: 1,
              maxRows: 6,
              labels: { singular: 'Step', plural: 'Steps' },
              fields: [
                { name: 'title', type: 'text', required: true },
                { name: 'body', type: 'textarea', required: true },
              ],
              defaultValue: [
                {
                  title: 'Tell us about your land',
                  body: "Acreage, location, what you'd like done, any access notes. A rough description is fine — we'll fill in the gaps.",
                },
                {
                  title: 'We come and look (when needed)',
                  body: "For straightforward jobs, satellite imagery and a chat is enough. For larger or more complex work, we'll visit — usually free.",
                },
                {
                  title: 'You get a written quote',
                  body: "Itemised, with what's included, what's not, travel time shown separately, and a clear total. No surprises, no hidden extras.",
                },
                {
                  title: 'We book you in',
                  body: 'Most jobs scheduled within 1–2 weeks. Urgent work (ragwort before flowering, hay cuts) prioritised in season.',
                },
              ],
            },
          ],
        },
        {
          label: 'CTA & trust',
          fields: [
            {
              name: 'ctaHeading',
              type: 'text',
              required: true,
              defaultValue: 'Get a quote',
            },
            {
              name: 'ctaSubheading',
              type: 'text',
              required: true,
              defaultValue:
                'No obligation. Most quotes turned around within 24 hours.',
            },
            {
              name: 'ctaPrimaryLabel',
              type: 'text',
              required: true,
              defaultValue: 'Request a quote',
            },
            {
              name: 'ctaPrimaryHref',
              type: 'text',
              required: true,
              defaultValue: '/contact',
            },
            {
              name: 'ctaPhoneLabel',
              type: 'text',
              required: true,
              defaultValue: 'Call 07825 156 062',
            },
            {
              name: 'ctaPhoneNumber',
              type: 'text',
              required: true,
              defaultValue: '07825156062',
              admin: {
                description:
                  'Digits only, used to build the tel: link (e.g. 07825156062).',
              },
            },
            {
              name: 'trustHeading',
              type: 'text',
              required: true,
              defaultValue:
                'Fully PA1/PA2 certified, insured, and VAT registered',
            },
            {
              name: 'trustBody',
              type: 'text',
              required: true,
              defaultValue:
                'Quotes shown inclusive of VAT for private clients. Trade quotes shown ex-VAT.',
            },
          ],
        },
        {
          label: 'SEO',
          fields: [
            {
              name: 'metaTitle',
              type: 'text',
              required: true,
              defaultValue:
                'Pricing | Hampshire Paddock Management',
            },
            {
              name: 'metaDescription',
              type: 'textarea',
              required: true,
              defaultValue:
                'Transparent paddock and field management pricing across Hampshire, Wiltshire, Berkshire, Dorset, Surrey and Sussex. Hourly, per-acre, day-rate and programme pricing.',
            },
          ],
        },
      ],
    },
  ],
}

export default PricingPage
