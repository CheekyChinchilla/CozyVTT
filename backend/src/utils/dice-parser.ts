/**
 * Dice Roller Parser
 * Dice Roller Parser Specification
 *
 * Supports:
 * - Basic notation: 1d20, 2d6+3, 3d10-2
 * - Multiple dice: 2d6+1d4+3
 * - Keep highest/lowest: 4d6kh3, 2d20kl1
 * - Drop lowest: 4d6dl1
 * - Advantage/Disadvantage: adv, dis
 * - Operators: +, -, *, /, and a sign before any term; multiplication and
 *   division first, then left to right, and a fractional total rounded down
 *
 * Anti-abuse limits:
 * - Max 100 dice per expression
 * - Max die size: d1000
 * - Max modifier: ±9999
 * - Expression max length: 200 chars
 * - Every total it could give fits the dice log's 32-bit integer, and it can
 *   never divide by zero
 *
 * The same file is in backend/src/utils and frontend/src/utils, byte for byte
 * (visionParity.test.ts): the server rolls by it, and so does a paused table
 * in the browser, so the two cannot read an expression differently. It
 * imports nothing, which is what lets both use it.
 */

// Limits
const MAX_DICE = 100;
const MAX_DIE_SIZE = 1000;
const MAX_MODIFIER = 9999;
const MAX_EXPRESSION_LENGTH = 200;
/** The dice log stores a total as a 32-bit integer. */
const MIN_TOTAL = -2147483648;
const MAX_TOTAL = 2147483647;

const OPERATORS = ['+', '-', '*', '/'];

// Interfaces

export interface DiceRoll {
  type: 'dice' | 'modifier';
  notation?: string;
  count?: number;
  sides?: number;
  results?: number[];
  kept?: number[];
  total?: number;
  value?: number; // For modifiers
  modifier?: 'kh' | 'kl' | 'dl'; // Keep highest, keep lowest, drop lowest
  modifierCount?: number;
}

export interface RollResult {
  expression: string;
  rolls: DiceRoll[];
  total: number;
  formula: string;
}

export class DiceParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiceParserError';
  }
}

/** One dice term, read and checked but not yet rolled. */
interface DiceTerm {
  notation: string;
  count: number;
  sides: number;
  modifier?: 'kh' | 'kl' | 'dl';
  modifierCount?: number;
}

/**
 * Roll a single die
 */
function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Read a single dice term like "2d6", "4d6kh3", "2d20kl1", "4d6dl1"
 */
function readDiceTerm(notation: string): DiceTerm {
  // Regex to match: (count)d(sides)(modifier)
  // Examples: 2d6, 4d6kh3, 2d20kl1, 4d6dl1, 1d20
  const regex = /^(\d+)?d(\d+)(kh\d+|kl\d+|dl\d+)?$/i;
  const match = notation.trim().match(regex);

  if (!match) {
    throw new DiceParserError(`Invalid dice notation: ${notation}`);
  }

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const modifierStr = match[3];

  // Validation
  if (count > MAX_DICE) {
    throw new DiceParserError(`Too many dice. Maximum ${MAX_DICE} per roll.`);
  }

  if (sides > MAX_DIE_SIZE) {
    throw new DiceParserError(`Die size too large. Maximum d${MAX_DIE_SIZE}.`);
  }

  if (sides < 1) {
    throw new DiceParserError(`Invalid die size: d${sides}. Must be at least 1.`);
  }

  if (!modifierStr) return { notation, count, sides };
  return {
    notation,
    count,
    sides,
    modifier: modifierStr.substring(0, 2).toLowerCase() as 'kh' | 'kl' | 'dl',
    modifierCount: parseInt(modifierStr.substring(2), 10),
  };
}

/** How many of a term's dice count towards its total. */
function keptCount(term: DiceTerm): number {
  if (term.modifier === undefined || term.modifierCount === undefined) return term.count;
  if (term.modifier === 'dl') return Math.max(term.count - term.modifierCount, 0);
  return Math.min(term.modifierCount, term.count);
}

/** Roll a dice term. */
function rollDiceTerm(term: DiceTerm): DiceRoll {
  const results: number[] = [];
  for (let i = 0; i < term.count; i++) {
    results.push(rollDie(term.sides));
  }

  // Keep highest or lowest N, or drop the lowest N
  let kept: number[] = [...results];
  if (term.modifier === 'kh') {
    kept = [...results].sort((a, b) => b - a).slice(0, term.modifierCount);
  } else if (term.modifier === 'kl') {
    kept = [...results].sort((a, b) => a - b).slice(0, term.modifierCount);
  } else if (term.modifier === 'dl') {
    kept = [...results].sort((a, b) => a - b).slice(term.modifierCount);
  }

  return {
    type: 'dice',
    notation: term.notation,
    count: term.count,
    sides: term.sides,
    results,
    kept,
    total: kept.reduce((sum, val) => sum + val, 0),
    modifier: term.modifier,
    modifierCount: term.modifierCount,
  };
}

/**
 * Tokenize expression into dice expressions, operators, and numbers
 *
 * Spaces separate tokens and are otherwise ignored, so `1d20 + 5` reads as
 * `1d20+5`. Two terms with only a space between them are refused: removing
 * the space first turned `1d20 5` into a 205-sided die.
 */
function tokenize(expression: string): string[] {
  // Replace advantage/disadvantage shorthand
  let normalized = expression.toLowerCase();
  normalized = normalized.replace(/\badv\b/g, '2d20kh1');
  normalized = normalized.replace(/\bdis\b/g, '2d20kl1');

  const tokens: string[] = [];
  let currentToken = '';

  const endToken = () => {
    if (!currentToken) return;
    const previous = tokens[tokens.length - 1];
    if (previous !== undefined && !OPERATORS.includes(previous)) {
      throw new DiceParserError(`Missing an operator between "${previous}" and "${currentToken}"`);
    }
    tokens.push(currentToken);
    currentToken = '';
  };

  for (const char of normalized) {
    if (/\s/.test(char)) {
      endToken();
    } else if (OPERATORS.includes(char)) {
      endToken();
      tokens.push(char);
    } else {
      currentToken += char;
    }
  }
  endToken();

  return tokens;
}

/** Arithmetic on whatever the expression is worked out over: numbers, or ranges of them. */
interface Arithmetic<T> {
  add(a: T, b: T): T;
  subtract(a: T, b: T): T;
  multiply(a: T, b: T): T;
  divide(a: T, b: T): T;
  negate(a: T): T;
}

/**
 * Work out tokens in the usual order: a sign before a term first, then
 * multiplication and division, then addition and subtraction, each left to
 * right. `term` gives the value of each dice term or number, by its place
 * among the tokens.
 */
function evaluate<T>(tokens: string[], term: (index: number) => T, maths: Arithmetic<T>): T {
  let position = 0;
  const incomplete = () => new DiceParserError('Failed to evaluate expression');

  const factor = (): T => {
    const token = tokens[position];
    if (token === undefined) throw incomplete();
    position += 1;
    if (token === '-') return maths.negate(factor());
    if (token === '+') return factor();
    if (OPERATORS.includes(token)) throw incomplete();
    return term(position - 1);
  };

  const product = (): T => {
    let value = factor();
    while (tokens[position] === '*' || tokens[position] === '/') {
      const operator = tokens[position];
      position += 1;
      const right = factor();
      value = operator === '*' ? maths.multiply(value, right) : maths.divide(value, right);
    }
    return value;
  };

  const sum = (): T => {
    let value = product();
    while (tokens[position] === '+' || tokens[position] === '-') {
      const operator = tokens[position];
      position += 1;
      const right = product();
      value = operator === '+' ? maths.add(value, right) : maths.subtract(value, right);
    }
    return value;
  };

  const value = sum();
  if (position !== tokens.length) throw incomplete();
  return value;
}

const numbers: Arithmetic<number> = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => a / b,
  negate: (a) => -a,
};

/** The lowest and highest a part of the expression can come to. */
type Range = [number, number];

const spread = (values: number[]): Range => [Math.min(...values), Math.max(...values)];

const ranges: Arithmetic<Range> = {
  add: ([a, b], [c, d]) => [a + c, b + d],
  subtract: ([a, b], [c, d]) => [a - d, b - c],
  multiply: ([a, b], [c, d]) => spread([a * c, a * d, b * c, b * d]),
  divide: ([a, b], [c, d]) => {
    if (c <= 0 && d >= 0) throw new DiceParserError('It could divide by zero');
    return spread([a / c, a / d, b / c, b / d]);
  },
  negate: ([a, b]) => [-b, -a],
};

/**
 * Parse dice expression and calculate result
 * @param expression Dice expression like "2d6+3", "4d6kh3", "2d20kh1+5"
 * @returns RollResult with detailed breakdown
 */
export function rollDice(expression: string): RollResult {
  // Validation
  if (!expression || expression.trim().length === 0) {
    throw new DiceParserError('Empty expression');
  }

  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new DiceParserError(`Expression too long. Maximum ${MAX_EXPRESSION_LENGTH} characters.`);
  }

  const originalExpression = expression;

  try {
    // Tokenize
    const tokens = tokenize(expression);

    if (tokens.length === 0) {
      throw new DiceParserError('Invalid expression');
    }

    // Read every term before rolling any: dice by their notation, numbers
    // within the modifier limit.
    const terms = new Map<number, DiceTerm | number>();
    let totalDiceCount = 0;
    tokens.forEach((token, index) => {
      if (OPERATORS.includes(token)) return;
      if (/d\d+/i.test(token)) {
        const dice = readDiceTerm(token);
        terms.set(index, dice);
        totalDiceCount += dice.count;
      } else if (/^\d+$/.test(token)) {
        const value = parseInt(token, 10);
        if (value > MAX_MODIFIER) {
          throw new DiceParserError(`Modifier too large. Maximum ±${MAX_MODIFIER}.`);
        }
        terms.set(index, value);
      } else {
        throw new DiceParserError(`Invalid token: ${token}`);
      }
    });

    // Check total dice count
    if (totalDiceCount > MAX_DICE) {
      throw new DiceParserError(`Too many dice. Maximum ${MAX_DICE} per expression.`);
    }

    // Every total the dice could give, from all of them low to all of them
    // high, must be one the dice log can store. Worked out before rolling,
    // because a check of one roll passes an expression that a higher roll
    // would break.
    const [lowest, highest] = evaluate(tokens, (index): Range => {
      const read = terms.get(index)!;
      if (typeof read === 'number') return [read, read];
      const kept = keptCount(read);
      return [kept, kept * read.sides];
    }, ranges);
    if (Math.floor(lowest) < MIN_TOTAL || Math.floor(highest) > MAX_TOTAL) {
      throw new DiceParserError('The total could be too large');
    }

    // Roll, in the order the terms are written
    const rolls: DiceRoll[] = [];
    const values = new Map<number, number>();
    const formulaParts: string[] = [];
    tokens.forEach((token, index) => {
      const read = terms.get(index);
      if (read === undefined) {
        formulaParts.push(token);
      } else if (typeof read === 'number') {
        rolls.push({ type: 'modifier', value: read });
        values.set(index, read);
        formulaParts.push(read.toString());
      } else {
        const diceRoll = rollDiceTerm(read);
        rolls.push(diceRoll);
        values.set(index, diceRoll.total!);
        formulaParts.push(diceRoll.total!.toString());
      }
    });

    const total = Math.floor(evaluate(tokens, (index) => values.get(index)!, numbers));
    if (!Number.isFinite(total)) {
      throw new DiceParserError('Failed to evaluate expression');
    }

    return {
      expression: originalExpression,
      rolls,
      total,
      formula: formulaParts.join(' '),
    };
  } catch (error) {
    if (error instanceof DiceParserError) {
      throw error;
    }
    throw new DiceParserError(`Failed to parse expression: ${expression}`);
  }
}

/**
 * Would this expression roll?
 *
 * Answers by rolling it and throwing the result away, rather than by
 * re-implementing the rules. It used to have its own copy of the token loop,
 * which checked each token in isolation and never checked that the tokens formed
 * a usable expression — so `2d6+`, `2d6*`, `2d6+-` and `/2d6` all passed
 * validation and then threw the moment they were rolled.
 *
 * Every caller validates and then rolls, so that gap let an expression clear the
 * gate and fail immediately afterwards. It was worse for anything that *stores* a
 * validated expression — a saved dice macro, an initiative fallback — where the
 * failure arrives long after the mistake was made and with nothing to connect
 * the two.
 *
 * Two functions answering one question will drift; this is the cheap fix, and
 * `dice-parser.test.ts` pins the two verdicts together so they cannot part again.
 * The wasted roll costs nothing: the expression is capped at 100 dice. The
 * limits on the total are checked from every roll the dice could make, so one
 * roll is enough to know.
 *
 * @param expression Dice expression
 * @returns true if valid; throws DiceParserError if not
 */
export function parseDiceExpression(expression: string): boolean {
  rollDice(expression);
  return true;
}
