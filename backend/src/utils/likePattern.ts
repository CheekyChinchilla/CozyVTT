/**
 * Text a user typed, made safe to hand to a Prisma string filter.
 *
 * On PostgreSQL, Prisma sends `contains`, `startsWith`, `endsWith`, and
 * `equals` with `mode: 'insensitive'`, as a LIKE pattern without escaping it,
 * so a `%` or `_` in the text matches any characters. This escapes those two
 * and the backslash, PostgreSQL's LIKE escape character, so the text matches
 * only itself.
 */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}
