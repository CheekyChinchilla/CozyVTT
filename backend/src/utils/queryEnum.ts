/**
 * Read an optional query parameter that must be one of a fixed set of values.
 *
 * Absent gives `undefined`. A value outside the set, or the parameter sent
 * more than once, is refused with the message to answer 400 with, so a list
 * route never hands Prisma a value its enum column throws on.
 */
export function readEnumQuery<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
): { ok: true; value: T | undefined } | { ok: false; message: string } {
  if (value === undefined || value === '') return { ok: true, value: undefined };
  const match = allowed.find((option) => option === value);
  if (match !== undefined) return { ok: true, value: match };
  return { ok: false, message: `${name} must be one of: ${allowed.join(', ')}` };
}

/**
 * Read optional text query parameters. Absent gives `undefined`. One sent more
 * than once arrives as a list, which is refused with the message to answer
 * 400 with, so a route never hands Prisma a list where it expects text.
 */
export function readStringQueries<K extends string>(
  query: Record<string, unknown>,
  names: readonly K[],
): { ok: true; values: Partial<Record<K, string>> } | { ok: false; message: string } {
  const values: Partial<Record<K, string>> = {};
  for (const name of names) {
    const value = query[name];
    if (value === undefined) continue;
    if (typeof value !== 'string') return { ok: false, message: `Send ${name} once, as text` };
    values[name] = value;
  }
  return { ok: true, values };
}
