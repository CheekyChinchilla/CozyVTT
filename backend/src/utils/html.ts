/**
 * Escape a value for interpolation into HTML.
 *
 * The emails are built by string concatenation with no templating engine, so
 * anything a person typed (display names, campaign names and descriptions)
 * has to be escaped before it goes inside a tag or an attribute. Covers the
 * five characters that can break out of text or out of a double- or
 * single-quoted attribute value.
 */
export function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
