/**
 * The curated post-tag taxonomy. One source of truth for:
 *  - the /notes filter chips (display order = this order)
 *  - the /notes/tag/[tag] hub pages (label + meta copy)
 *  - the sitemap's hub entries
 *
 * Slugs must match what scripts/clean-post-tags.mjs writes to posts.tags.
 */
export type TagDef = {
  slug: string;
  label: string;
  /** <title> for the hub page (the layout template appends the brand). */
  metaTitle: string;
  /** Meta description + hub-page subheading. */
  description: string;
};

export const CURATED_TAGS: TagDef[] = [
  {
    slug: 'topping',
    label: 'Topping',
    metaTitle: 'Paddock topping notes',
    description:
      'Notes on topping and mowing paddocks — when to cut, what kit does the job, and how to keep grass in shape.',
  },
  {
    slug: 'weeds',
    label: 'Weeds',
    metaTitle: 'Weed control notes',
    description:
      'Dealing with ragwort, docks, thistles and buttercups in paddocks — spraying, timing, and what actually works.',
  },
  {
    slug: 'drainage',
    label: 'Drainage',
    metaTitle: 'Paddock drainage notes',
    description:
      'Fixing waterlogged paddocks and fields — mole ploughing, drainage problems, and keeping ground usable through winter.',
  },
  {
    slug: 'ground-care',
    label: 'Ground care',
    metaTitle: 'Paddock ground care notes',
    description:
      'Harrowing, rolling, overseeding, fertiliser and soil health — practical notes on keeping paddock ground in good order.',
  },
  {
    slug: 'equipment',
    label: 'Equipment',
    metaTitle: 'Paddock machinery & equipment notes',
    description:
      'The machinery behind the work — compact tractors, flail mowers, collectors and attachments, reviewed from real jobs.',
  },
  {
    slug: 'hedges',
    label: 'Hedges',
    metaTitle: 'Hedge cutting & care notes',
    description:
      'Hedge cutting, trimming and hedge health in Hampshire — when to cut, what the law allows, and spotting problems early.',
  },
  {
    slug: 'clearance',
    label: 'Clearance',
    metaTitle: 'Land clearance & wood chipping notes',
    description:
      'Clearing overgrown paddocks and neglected grazing — scrub, brambles and self-seeded trees, what the machinery can take, and turning land back into usable pasture.',
  },
  {
    slug: 'seasonal',
    label: 'Seasonal',
    metaTitle: 'Seasonal paddock care notes',
    description:
      'What paddocks need through the year — winter grass heights, autumn overseeding, and season-by-season jobs.',
  },
  {
    slug: 'advice',
    label: 'Advice',
    metaTitle: 'Paddock care advice',
    description:
      'General paddock care advice — spotting problems early, choosing the right treatment, and knowing when to call someone in.',
  },
];

export function tagDef(slug: string | null | undefined): TagDef | null {
  if (!slug) return null;
  return CURATED_TAGS.find((t) => t.slug === slug) ?? null;
}
