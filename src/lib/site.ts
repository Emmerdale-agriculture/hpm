/**
 * Sitewide constants. Pull phone / email through here so a number change
 * is one diff, not a grep-and-replace.
 */

/** Public, formatted phone number — what humans see. */
export const SITE_PHONE = '07825 156062';

/** International form for `tel:` and schema.org. */
export const SITE_PHONE_TEL = '+447825156062';

/** Receiving address for enquiries. */
export const SITE_EMAIL = 'tom@hampshirepaddockmanagement.com';

/**
 * Public profile URLs for schema.org `sameAs` (Google Business Profile,
 * social pages). These tie the website to the business's other web presences
 * and are a strong local-SEO signal — add the GBP "share" URL and any social
 * profiles here. Left empty until the real URLs are supplied; the JSON-LD
 * omits `sameAs` entirely when this is empty.
 */
export const SITE_SOCIAL_LINKS: string[] = [];
