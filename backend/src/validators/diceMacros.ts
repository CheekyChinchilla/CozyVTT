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
 * So the gate is `rollDice` itself — the macro is rolled once and the result
 * thrown away. `parseDiceExpression` is not enough, and this is not theoretical:
 * it accepts `2d6+`, which `rollDice` then refuses, so a macro validated only by
 * the parser could still be unrollable. Asking the question the button will ask
 * is the only answer that cannot drift from it. The parser's own message is
 * handed back verbatim — it already explains itself ("Too many dice. Maximum 100
 * per roll.").
 */

import { z } from 'zod';
import { rollDice, DiceParserError } from '../utils/dice-parser';

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
 * Rolls it once and discards the result, converting any failure into a Zod issue
 * so it comes back through the same `{ error, message }` shape as every other
 * validation failure rather than as a 500.
 */
const rollableExpression = z
  .string()
  .trim()
  .min(1, 'A macro needs a dice expression')
  .max(MAX_MACRO_EXPRESSION_LENGTH, `Expression too long. Maximum ${MAX_MACRO_EXPRESSION_LENGTH} characters.`)
  .superRefine((expression, ctx) => {
    try {
      rollDice(expression);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          error instanceof DiceParserError
            ? error.message
            : `That is not a dice expression CozyVTT can roll: ${expression}`,
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
