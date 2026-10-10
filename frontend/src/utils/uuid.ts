/**
 * A random version 4 UUID, on any page.
 *
 * `crypto.randomUUID` exists only in a secure context: a page served over
 * HTTPS or from localhost. CozyVTT is often opened over plain HTTP by its
 * address on a home network, where it is missing, so this builds the same
 * format from `crypto.getRandomValues`, which every page has.
 */
export function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
