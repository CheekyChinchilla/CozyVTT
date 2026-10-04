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
