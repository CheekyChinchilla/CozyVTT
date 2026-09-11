/**
 * What a saved dice macro may contain.
 *
 * A macro is a name and a dice expression, saved so a roll that is not on a
 * character sheet does not have to be retyped every session.
 *
 * The expression is checked against the **real dice parser**, not a charset
 * pattern. Both of the frontend's helpers — `isValidDiceExpression` and
 * `DiceRoller`'s own `validateExpression` — only look at which characters are
 * present, so they accept `dddd` and `2d6++3`. That is fine for instant feedback
 * on something about to be rolled, because the server rejects it a moment later
 * and the person sees the error while they are still looking at the box.
 *
 * A macro is different: it is stored once and clicked for months. Saving one that
 * cannot be rolled means a button failing every time it is pressed, with the
 * mistake made long ago and nowhere in sight.
 *
 * So the gate is `parseDiceExpression`, which answers by rolling the expression
 * and discarding the result — the same question the button will ask, so the two
 * cannot disagree. It used to validate tokens separately and accepted `2d6+`,
 * which the roller refuses; that is fixed at the source in `dice-parser.ts`
 * rather than worked around here. The parser's own message is handed back
 * through when it is already clear ("Too many dice. Maximum 100 per roll."), and
 * rewritten when it is not — see explainRefusal.
 */

import { z } from 'zod';
import { parseDiceExpression, DiceParserError } from '../utils/dice-parser';

/** Long enough to name a homebrew subsystem, short enough to sit on a button. */
export const MAX_MACRO_NAME_LENGTH = 60;

/**
 * Matches the parser's own ceiling, so the length error comes from one place
 * rather than two that could drift apart.
 */
export const MAX_MACRO_EXPRESSION_LENGTH = 200;

/**
 * Per user, per campaign.
 *
 * Not a UX target — the row of buttons wraps and would be unreadable long before
 * this — but a bound on what one account can write. Note the pre-existing hole
 * recorded in FUTURE_FEATURES: campaign creation is uncapped, so a per-campaign
 * limit is not a true storage ceiling. The same is true of notes; it is not a
 * reason to do anything differently here.
 */
export const MAX_MACROS_PER_CAMPAIGN = 50;

/**
 * A dice expression the server would actually roll.
 *
 * Converts a parser failure into a Zod issue, so a bad expression comes back
 * through the same `{ error, message }` shape as every other validation failure
 * rather than as a 500.
 */
/**
 * Turn a parser complaint into something the person typing can act on.
 *
 * The parser's limit messages are already good — "Too many dice. Maximum 100 per
 * roll." says exactly what to change — so they are passed through untouched. Its
 * syntax messages are not: "Failed to evaluate expression" and "Invalid token:
 * helloworld" are written for whoever is reading a stack trace, and a player
 * naming a button they will press for months deserves better than that.
 *
 * Only the unhelpful shapes are rewritten, so a better message from the parser
 * keeps reaching the surface rather than being flattened into a generic one.
 */
function explainRefusal(message: string, expression: string): string {
  if (/^Failed to (evaluate|parse) expression/i.test(message)) {
    return `CozyVTT could not read "${expression}" as a roll. Check for a stray + or -, or a missing number — try something like 2d6+3.`;
  }

  const token = message.match(/^Invalid token:\s*(.+)$/i);
  if (token) {
    return `CozyVTT could not read "${token[1]}" as dice. Expressions look like 1d20+5, 2d6+3 or 4d6kh3.`;
  }

  if (/^Invalid dice notation/i.test(message)) {
    return `CozyVTT could not read "${expression}" as dice. Expressions look like 1d20+5, 2d6+3 or 4d6kh3.`;
  }

  return message;
}

const rollableExpression = z
  .string()
  .trim()
  .min(1, 'A macro needs a dice expression')
  .max(MAX_MACRO_EXPRESSION_LENGTH, `Expression too long. Maximum ${MAX_MACRO_EXPRESSION_LENGTH} characters.`)
  .superRefine((expression, ctx) => {
    try {
      parseDiceExpression(expression);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          error instanceof DiceParserError
            ? explainRefusal(error.message, expression)
            : `CozyVTT could not read "${expression}" as a roll.`,
      });
    }
  });

const macroName = z
  .string()
  .trim()
  .min(1, 'A macro needs a name')
  .max(MAX_MACRO_NAME_LENGTH, `Name must be ${MAX_MACRO_NAME_LENGTH} characters or fewer`);

export const CreateDiceMacroSchema = z.object({
  name: macroName,
  expression: rollableExpression,
});

/**
 * Either field alone is a valid edit — a macro gets renamed, or its expression
 * corrected — but a body with neither changes nothing and is refused so a
 * mistake is visible rather than silent. Same rule as personal notes.
 */
export const UpdateDiceMacroSchema = z
  .object({
    name: macroName.optional(),
    expression: rollableExpression.optional(),
  })
  .refine((body) => body.name !== undefined || body.expression !== undefined, {
    message: 'Nothing to update: send a name, an expression, or both',
  });

export type CreateDiceMacroInput = z.infer<typeof CreateDiceMacroSchema>;
export type UpdateDiceMacroInput = z.infer<typeof UpdateDiceMacroSchema>;
