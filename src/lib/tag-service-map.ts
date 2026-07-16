/**
 * Maps a post's primaryTag to a service for the in-article CTA panel.
 *
 * Mapped → render the green-deep CTA pointing at that service.
 * Unmapped (or null) → render no CTA panel. Don't fall back to a generic
 * "Get a quote" — the value of this pattern is its specificity.
 *
 * verb is the conjugated phrase used in the headline:
 *   "I ${verb} across Hampshire and surrounding counties"
 */
export type TagService = {
  slug: string;
  label: string;
  verb: string;
};

export const tagToService: Record<string, TagService | null> = {
  topping:       { slug: 'paddock-topping',     label: 'Paddock topping',  verb: 'top paddocks' },
  weeds:         { slug: 'weed-control',        label: 'Weed control',     verb: 'tackle weeds' },
  drainage:      { slug: 'mole-ploughing',      label: 'Mole ploughing',   verb: 'sort drainage' },
  'ground-care': { slug: 'harrowing',           label: 'Harrowing',        verb: 'look after paddocks' },
  hedges:        { slug: 'hedge-cutting',       label: 'Hedge cutting',    verb: 'cut hedges' },
  // Informational tags — no service CTA.
  equipment:     null,
  seasonal:      null,
  advice:        null,
  kit:           null,
};

export function serviceForTag(tag: string | null | undefined): TagService | null {
  if (!tag) return null;
  return tagToService[tag] ?? null;
}

/**
 * The reverse direction: which post tags are relevant reading for a given
 * service — drives the "Notes on this" section on /services/[slug], linking
 * service pages back into /notes/* (previously services never linked to
 * posts at all). Order matters: posts matching an earlier tag rank first.
 */
export const serviceToTags: Record<string, string[]> = {
  'hedge-cutting':          ['hedges', 'equipment'],
  'paddock-topping':        ['topping', 'ground-care'],
  'flailing':               ['topping', 'equipment'],
  'flail-collecting':       ['topping', 'equipment'],
  'finish-mowing':          ['topping', 'ground-care'],
  'weed-control':           ['weeds'],
  'spraying':               ['weeds'],
  'mole-ploughing':         ['drainage'],
  'land-ditch-clearance':   ['drainage', 'ground-care'],
  'harrowing':              ['ground-care'],
  'rolling':                ['ground-care'],
  'rotavating':             ['ground-care'],
  'overseeding':            ['ground-care', 'seasonal'],
  'fertiliser-application': ['ground-care'],
  'stone-burying':          ['ground-care', 'equipment'],
  'manure-sweeping':        ['ground-care', 'equipment'],
};

export function tagsForService(slug: string | null | undefined): string[] {
  if (!slug) return [];
  return serviceToTags[slug] ?? [];
}
