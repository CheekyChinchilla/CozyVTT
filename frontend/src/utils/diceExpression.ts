/**
 * Whether a string looks like a dice expression the server can evaluate.
 *
 * Its own module because both `characterRolls` and `hitDice` need it and the
 * first already imports the second — keeping it here is what stops that
 * becoming a cycle. `characterRolls` re-exports it, so existing imports are
 * unaffected.
 */
export function isValidDiceExpression(expr: string): boolean {
  if (!expr || !expr.trim()) return false;
  return /^[\dd+\-*/khldisavw\s]+$/i.test(expr.trim());
}
