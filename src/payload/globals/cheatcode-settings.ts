import type { GlobalConfig } from 'payload';

/**
 * CheatcodeSettings — knobs for the backlink brief Cheatcode writes for
 * the external link-building agency.
 *
 * The agency owns the links and their Domain Authority; Cheatcode only
 * decides WHICH of our pages they should point links at, how many each,
 * and where in this DA band each page's links should sit (harder queries
 * get the top of the band). Change the band here when the agency's
 * typical range changes; no deploy needed.
 */
export const CheatcodeSettings: GlobalConfig = {
  slug: 'cheatcode-settings',
  label: 'Cheatcode settings',
  access: {
    read: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
  },
  admin: {
    group: 'Cheatcode',
    description:
      'Backlink brief settings. The agency builds the links; Cheatcode picks the pages and the target DA within this band.',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'daMin',
          label: 'Target DA — low end',
          type: 'number',
          defaultValue: 30,
          min: 0,
          max: 100,
          admin: { description: 'Used for the easiest targets (already near page 1, low demand).' },
        },
        {
          name: 'daMax',
          label: 'Target DA — high end',
          type: 'number',
          defaultValue: 40,
          min: 0,
          max: 100,
          admin: { description: 'Used for the hardest targets (deep on page 2, high demand).' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'linksPerMonth',
          label: 'Links per month',
          type: 'number',
          defaultValue: 10,
          min: 0,
          admin: { description: 'Total links the agency builds per month; split across the target pages. 0 turns the brief off.' },
        },
        {
          name: 'maxLinkPages',
          label: 'Max target pages',
          type: 'number',
          defaultValue: 3,
          min: 1,
          max: 10,
          admin: { description: 'How many pages share each month’s links.' },
        },
      ],
    },
  ],
};
