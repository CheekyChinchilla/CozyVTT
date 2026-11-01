import { parseDiceExpression, DiceParserError } from './dice-parser';

/**
 * Why the dice parser refuses this expression, in its words, or null when it
 * rolls. The server and a paused table roll by the same parser, so a value
 * offered as a roll is one that rolls. Ask it about the expression that will
 * be sent, such as a hit die with Constitution added.
 *
 * Its own module because both `characterRolls` and `hitDice` need it and the
 * first already imports the second — keeping it here is what stops that
 * becoming a cycle. `characterRolls` re-exports `isValidDiceExpression`, so
 * existing imports are unaffected.
 */
export function diceExpressionProblem(expr: string): string | null {
  try {
    parseDiceExpression(expr);
    return null;
  } catch (err) {
    return err instanceof DiceParserError ? `Invalid dice expression: ${err.message}` : 'Invalid dice expression';
  }
}

/** Whether the dice parser rolls this expression. */
export function isValidDiceExpression(expr: string): boolean {
  return diceExpressionProblem(expr) === null;
}
