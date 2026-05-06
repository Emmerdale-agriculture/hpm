/**
 * Serialise a JSON-LD object for inline injection inside a <script> tag.
 *
 * Plain JSON.stringify can produce a literal `</script>` if any string
 * value contains it, breaking out of the surrounding script tag (XSS).
 * Escaping `<` to its unicode form is the standard mitigation — the JSON
 * is still valid and parsers handle it transparently.
 */
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
