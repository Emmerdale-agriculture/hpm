/**
 * Minimal allowlist sanitizer for short, admin-authored inline strings
 * (service strapline / lede) that are injected via dangerouslySetInnerHTML.
 *
 * Only a handful of inline emphasis tags are permitted; every other tag is
 * dropped (its text content is kept) and ALL attributes are stripped. This
 * neutralises event-handler attributes (`<img onerror>`), `<iframe>`, `<svg>`,
 * `<script>`/`<style>`, and any other injection vector while still rendering
 * the `<em>`/`<strong>` emphasis the CMS editors rely on.
 *
 * Scope note: this is deliberately tiny and intended ONLY for trusted-ish,
 * short inline fragments — not for sanitising arbitrary rich text.
 */
const ALLOWED_TAGS = new Set(['em', 'strong', 'i', 'b', 'br']);

export function sanitizeInline(html: string | null | undefined): string {
  if (!html) return '';
  // Remove <script>/<style> blocks including their contents first.
  let out = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  // Re-emit only allowlisted tags, stripped of every attribute; drop the rest
  // (keeping their inner text). Unmatched stray '<' is left for the browser.
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?>/g, (match, tag: string) => {
    const name = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return '';
    if (name === 'br') return '<br/>';
    return match.startsWith('</') ? `</${name}>` : `<${name}>`;
  });
  return out;
}
