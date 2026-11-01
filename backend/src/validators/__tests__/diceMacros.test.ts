/**
 * What may be saved as a dice macro.
 *
 * The case that matters is an expression that *looks* like dice but that cannot
 * actually be rolled. A macro is stored once and clicked for months, so saving
 * an unrollable one means a button that fails every time, long after the mistake
 * was made.
 *
 * `2d6+` is the case that set the design: `parseDiceExpression` accepts it and
 * `rollDice` refuses it, so validating with the parser alone was not enough. The
 * validator rolls the expression once instead, and the test below pins that —
 * it fails if anyone swaps the gate back to the parser.
 *
 * Note `2d6++3` is deliberately *accepted*: the parser reads the stray `+` as a
 * no-op and rolls it correctly, so refusing it would be inventing a rule the
 * roller does not have.
 */

import {
  CreateDiceMacroSchema,
  UpdateDiceMacroSchema,
  MAX_MACRO_NAME_LENGTH,
  MAX_MACRO_EXPRESSION_LENGTH,
  MAX_MACRO_CHARACTER_NAME_LENGTH,
  MAX_MACRO_PURPOSE_LENGTH,
} from '../diceMacros';
import { MAX_ROLL_CHARACTER_NAME_LENGTH, MAX_ROLL_PURPOSE_LENGTH } from '../dice';

/** The first issue message, which is what the routes return. */
const refusal = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? null : result.error!.issues[0]?.message ?? '';

describe('CreateDiceMacroSchema', () => {
  describe('expressions people actually save', () => {
    it.each([
      ['2d6+3', 'a table rule'],
      ['4d6kh3', 'stat generation — the example from the issue'],
      ['1d20+5', 'an attack the sheet does not model'],
      ['2d20kh1', 'advantage, which the expression says on its own'],
      ['1d100', 'a wild magic surge'],
      ['3d8', 'plain damage'],
    ])('accepts %s (%s)', (expression) => {
      const result = CreateDiceMacroSchema.safeParse({ name: 'Test', expression });
      expect(result.success).toBe(true);
    });

    it('trims surrounding whitespace rather than refusing it', () => {
      const result = CreateDiceMacroSchema.safeParse({ name: '  Fireball  ', expression: '  8d6  ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Fireball');
        expect(result.data.expression).toBe('8d6');
      }
    });
  });

  describe('things a weaker check would wave through', () => {
    it('refuses an expression of only dice letters', () => {
      const result = CreateDiceMacroSchema.safeParse({ name: 'Nonsense', expression: 'dddd' });
      expect(result.success).toBe(false);
      expect(refusal(result)).toBeTruthy();
    });

    it('refuses a word that is not dice at all', () => {
      const result = CreateDiceMacroSchema.safeParse({ name: 'Words', expression: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('refuses a trailing operator, which the parser alone would accept', () => {
      // The whole reason the gate rolls the expression instead of parsing it:
      // parseDiceExpression('2d6+') succeeds, rollDice('2d6+') throws. Saved on
      // the parser's word, this would be a button that never works.
      const result = CreateDiceMacroSchema.safeParse({ name: 'Half typed', expression: '2d6+' });
      expect(result.success).toBe(false);
    });

    it('allows a stray operator the roller handles, rather than inventing a rule', () => {
      // `2d6++3` rolls as 2d6 + 3. Refusing it would be stricter than the thing
      // that does the rolling, which is its own kind of wrong.
      const result = CreateDiceMacroSchema.safeParse({ name: 'Stray plus', expression: '2d6++3' });
      expect(result.success).toBe(true);
    });
  });

  describe('the parser\'s own limits are the ones reported', () => {
    it('refuses more than 100 dice, using the parser\'s wording', () => {
      const result = CreateDiceMacroSchema.safeParse({ name: 'Too many', expression: '101d20' });
      expect(result.success).toBe(false);
      expect(refusal(result)).toMatch(/maximum 100/i);
    });

    it('refuses a die larger than d1000', () => {
      const result = CreateDiceMacroSchema.safeParse({ name: 'Huge', expression: '1d1001' });
      expect(result.success).toBe(false);
      expect(refusal(result)).toMatch(/die size/i);
    });
  });

  describe('names', () => {
    it('refuses an empty name', () => {
      const result = CreateDiceMacroSchema.safeParse({ name: '   ', expression: '1d20' });
      expect(result.success).toBe(false);
      expect(refusal(result)).toMatch(/needs a name/i);
    });

    it(`refuses a name over ${MAX_MACRO_NAME_LENGTH} characters`, () => {
      const result = CreateDiceMacroSchema.safeParse({
        name: 'x'.repeat(MAX_MACRO_NAME_LENGTH + 1),
        expression: '1d20',
      });
      expect(result.success).toBe(false);
    });

    it(`accepts a name of exactly ${MAX_MACRO_NAME_LENGTH}`, () => {
      const result = CreateDiceMacroSchema.safeParse({
        name: 'x'.repeat(MAX_MACRO_NAME_LENGTH),
        expression: '1d20',
      });
      expect(result.success).toBe(true);
    });
  });

  it('refuses an empty expression', () => {
    const result = CreateDiceMacroSchema.safeParse({ name: 'Blank', expression: '   ' });
    expect(result.success).toBe(false);
    expect(refusal(result)).toMatch(/needs a dice expression/i);
  });

  it(`refuses an expression over ${MAX_MACRO_EXPRESSION_LENGTH} characters`, () => {
    const result = CreateDiceMacroSchema.safeParse({
      name: 'Long',
      expression: '1d6' + '+1'.repeat(MAX_MACRO_EXPRESSION_LENGTH),
    });
    expect(result.success).toBe(false);
  });

  // The length is the only thing said about an over-long expression: the
  // parser never sees it.
  it('refuses a 1 MB expression on its length alone, within 50 ms', () => {
    const started = performance.now();
    const result = CreateDiceMacroSchema.safeParse({ name: 'Long', expression: '1d6+' + '1'.repeat(1_000_000) });
    expect(performance.now() - started).toBeLessThan(50);
    expect(result.error?.issues.map((issue) => issue.code)).toEqual(['too_big']);
  });
});

describe('what the person typing is told', () => {
  /**
   * The parser explains limits well and syntax badly. A player naming a button
   * they will press for months should not be handed "Invalid token: helloworld".
   */
  const messageFor = (expression: string) => {
    const result = CreateDiceMacroSchema.safeParse({ name: 'T', expression });
    return result.success ? null : result.error.issues[0]?.message ?? '';
  };

  it('keeps the limit messages, which already say what to change', () => {
    expect(messageFor('101d20')).toMatch(/maximum 100/i);
    expect(messageFor('1d1001')).toMatch(/maximum d1000/i);
  });

  it('rewrites "Failed to evaluate expression" into something actionable', () => {
    const message = messageFor('2d6+');
    expect(message).not.toMatch(/failed to evaluate/i);
    expect(message).toMatch(/2d6\+/);
    expect(message).toMatch(/stray \+ or -|missing number/i);
  });

  it('rewrites "Invalid token" without repeating the jargon', () => {
    const message = messageFor('helloworld');
    expect(message).not.toMatch(/invalid token/i);
    expect(message).toMatch(/could not read/i);
    // Shows an example of the thing being asked for.
    expect(message).toMatch(/1d20\+5|2d6\+3|4d6kh3/);
  });

  it('never leaks the word "token" to someone saving a button', () => {
    for (const expression of ['dddd', 'invalid', 'hello world', '2d6*', '2d6+']) {
      expect(messageFor(expression) ?? '').not.toMatch(/token/i);
    }
  });
});

describe('UpdateDiceMacroSchema', () => {
  it('accepts a rename on its own', () => {
    expect(UpdateDiceMacroSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
  });

  it('accepts a new expression on its own', () => {
    expect(UpdateDiceMacroSchema.safeParse({ expression: '2d6+3' }).success).toBe(true);
  });

  it('still refuses an unrollable expression on an edit', () => {
    // The gate cannot only apply at creation, or a good macro could be edited
    // into a broken one.
    expect(UpdateDiceMacroSchema.safeParse({ expression: 'dddd' }).success).toBe(false);
  });

  it('refuses a body that changes nothing', () => {
    const result = UpdateDiceMacroSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(refusal(result)).toMatch(/nothing to update/i);
  });
});

/**
 * The character a saved roll is made as when the Character box is empty, and
 * what it is for. Both are optional free text, trimmed, and stored as null
 * when empty, as a roll's own character name and purpose are.
 */
describe('a saved roll\'s character and purpose', () => {
  const create = (fields: Record<string, unknown>) =>
    CreateDiceMacroSchema.safeParse({ name: 'Scimitar', expression: '1d20+4', ...fields });

  it('may be left out, and then are not set', () => {
    const result = create({});
    expect(result.success).toBe(true);
    expect(result.data?.characterName ?? null).toBeNull();
    expect(result.data?.purpose ?? null).toBeNull();
  });

  it('are trimmed', () => {
    const result = create({ characterName: '  Goblin boss  ', purpose: '  Scimitar attack ' });
    expect(result.data).toMatchObject({ characterName: 'Goblin boss', purpose: 'Scimitar attack' });
  });

  it.each([[''], ['   '], [null]])('are null when given %j', (value) => {
    const result = create({ characterName: value, purpose: value });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ characterName: null, purpose: null });
  });

  it(`take a character of exactly ${MAX_MACRO_CHARACTER_NAME_LENGTH} characters, counted after trimming`, () => {
    const result = create({ characterName: ` ${'x'.repeat(MAX_MACRO_CHARACTER_NAME_LENGTH)} ` });
    expect(result.success).toBe(true);
  });

  it(`refuse a character over ${MAX_MACRO_CHARACTER_NAME_LENGTH} characters`, () => {
    const result = create({ characterName: 'x'.repeat(MAX_MACRO_CHARACTER_NAME_LENGTH + 1) });
    expect(refusal(result)).toBe(`Character name must be ${MAX_MACRO_CHARACTER_NAME_LENGTH} characters or fewer`);
  });

  it(`take a purpose of exactly ${MAX_MACRO_PURPOSE_LENGTH} characters, and refuse one longer`, () => {
    expect(create({ purpose: 'x'.repeat(MAX_MACRO_PURPOSE_LENGTH) }).success).toBe(true);
    expect(refusal(create({ purpose: 'x'.repeat(MAX_MACRO_PURPOSE_LENGTH + 1) }))).toBe(
      `Purpose must be ${MAX_MACRO_PURPOSE_LENGTH} characters or fewer`
    );
  });

  it('refuse anything but text', () => {
    expect(refusal(create({ characterName: 7 }))).toBe('Character name must be text');
    expect(refusal(create({ purpose: ['Attack'] }))).toBe('Purpose must be text');
  });

  it('are at most 200 characters each, and always fit in a roll made from them', () => {
    expect(MAX_MACRO_CHARACTER_NAME_LENGTH).toBe(200);
    expect(MAX_MACRO_PURPOSE_LENGTH).toBe(200);
    expect(MAX_MACRO_CHARACTER_NAME_LENGTH).toBeLessThanOrEqual(MAX_ROLL_CHARACTER_NAME_LENGTH);
    expect(MAX_MACRO_PURPOSE_LENGTH).toBeLessThanOrEqual(MAX_ROLL_PURPOSE_LENGTH);
  });

  describe('on an edit', () => {
    it('are each a valid edit on their own', () => {
      expect(UpdateDiceMacroSchema.safeParse({ characterName: 'Grik' }).success).toBe(true);
      expect(UpdateDiceMacroSchema.safeParse({ purpose: 'Initiative' }).success).toBe(true);
    });

    it('are cleared by an empty string or null, which is a valid edit too', () => {
      expect(UpdateDiceMacroSchema.safeParse({ characterName: '' }).data).toEqual({ characterName: null });
      expect(UpdateDiceMacroSchema.safeParse({ purpose: null }).data).toEqual({ purpose: null });
    });

    it('are left alone when absent', () => {
      const result = UpdateDiceMacroSchema.safeParse({ name: 'Renamed' });
      expect(result.data).toEqual({ name: 'Renamed' });
    });

    it('are held to the same limits', () => {
      expect(refusal(UpdateDiceMacroSchema.safeParse({ characterName: 'x'.repeat(MAX_MACRO_CHARACTER_NAME_LENGTH + 1) }))).toMatch(/200 characters or fewer/);
      expect(refusal(UpdateDiceMacroSchema.safeParse({ purpose: 'x'.repeat(MAX_MACRO_PURPOSE_LENGTH + 1) }))).toMatch(/200 characters or fewer/);
    });
  });
});
