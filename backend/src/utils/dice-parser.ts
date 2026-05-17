/**
 * Dice Roller Parser
 * Per SOW Section 7: Dice Roller Parser Specification
 *
 * Supports:
 * - Basic notation: 1d20, 2d6+3, 3d10-2
 * - Multiple dice: 2d6+1d4+3
 * - Keep highest/lowest: 4d6kh3, 2d20kl1
 * - Drop lowest: 4d6dl1
 * - Advantage/Disadvantage: adv, dis
 * - Operators: +, -, *, /
 *
 * Anti-abuse limits:
 * - Max 100 dice per expression
 * - Max die size: d1000
 * - Max modifier: ±9999
 * - Expression max length: 200 chars
 */

import { evaluate } from 'mathjs';

// Limits
const MAX_DICE = 100;
const MAX_DIE_SIZE = 1000;
const MAX_MODIFIER = 9999;
const MAX_EXPRESSION_LENGTH = 200;

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

/**
 * Roll a single die
 */
function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Parse a single dice expression like "2d6", "4d6kh3", "2d20kl1", "4d6dl1"
 */
function parseSingleDiceExpression(notation: string): DiceRoll {
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

  // Roll the dice
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    results.push(rollDie(sides));
  }

  // Parse modifier (kh, kl, dl)
  let modifier: 'kh' | 'kl' | 'dl' | undefined;
  let modifierCount: number | undefined;
  let kept: number[] = [...results];

  if (modifierStr) {
    const modType = modifierStr.substring(0, 2).toLowerCase();
    const modNum = parseInt(modifierStr.substring(2), 10);

    if (modType === 'kh') {
      // Keep highest N
      modifier = 'kh';
      modifierCount = modNum;
      kept = [...results].sort((a, b) => b - a).slice(0, modNum);
    } else if (modType === 'kl') {
      // Keep lowest N
      modifier = 'kl';
      modifierCount = modNum;
      kept = [...results].sort((a, b) => a - b).slice(0, modNum);
    } else if (modType === 'dl') {
      // Drop lowest N
      modifier = 'dl';
      modifierCount = modNum;
      const sorted = [...results].sort((a, b) => a - b);
      kept = sorted.slice(modNum);
    }
  }

  const total = kept.reduce((sum, val) => sum + val, 0);

  return {
    type: 'dice',
    notation,
    count,
    sides,
    results,
    kept,
    total,
    modifier,
    modifierCount,
  };
}

/**
 * Tokenize expression into dice expressions, operators, and numbers
 */
function tokenize(expression: string): string[] {
  // Replace advantage/disadvantage shorthand
  let normalized = expression.toLowerCase();
  normalized = normalized.replace(/\badv\b/g, '2d20kh1');
  normalized = normalized.replace(/\bdis\b/g, '2d20kl1');

  // Remove all whitespace
  normalized = normalized.replace(/\s+/g, '');

  // Tokenize by splitting on operators while keeping them
  const tokens: string[] = [];
  let currentToken = '';

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (['+', '-', '*', '/'].includes(char)) {
      if (currentToken) {
        tokens.push(currentToken);
      }
      tokens.push(char);
      currentToken = '';
    } else {
      currentToken += char;
    }
  }

  if (currentToken) {
    tokens.push(currentToken);
  }

  return tokens;
}

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

    const rolls: DiceRoll[] = [];
    let formulaParts: string[] = [];
    let totalDiceCount = 0;

    // Process tokens
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Check if token is a dice expression
      if (/d\d+/i.test(token)) {
        const diceRoll = parseSingleDiceExpression(token);
        rolls.push(diceRoll);
        formulaParts.push(diceRoll.total!.toString());
        totalDiceCount += diceRoll.count!;
      }
      // Check if token is an operator
      else if (['+', '-', '*', '/'].includes(token)) {
        formulaParts.push(token);
      }
      // Check if token is a number (modifier)
      else if (/^\d+$/.test(token)) {
        const value = parseInt(token, 10);

        if (value > MAX_MODIFIER) {
          throw new DiceParserError(`Modifier too large. Maximum ±${MAX_MODIFIER}.`);
        }

        rolls.push({
          type: 'modifier',
          value,
        });
        formulaParts.push(value.toString());
      }
      // Invalid token
      else {
        throw new DiceParserError(`Invalid token: ${token}`);
      }
    }

    // Check total dice count
    if (totalDiceCount > MAX_DICE) {
      throw new DiceParserError(`Too many dice. Maximum ${MAX_DICE} per expression.`);
    }

    // Build formula string
    const formula = formulaParts.join(' ');

    // Evaluate the formula using mathjs (safe evaluation)
    let total: number;
    try {
      // mathjs evaluate returns a number for simple expressions
      const result = evaluate(formula);
      total = typeof result === 'number' ? Math.floor(result) : parseInt(result.toString(), 10);
    } catch (error) {
      throw new DiceParserError('Failed to evaluate expression');
    }

    return {
      expression: originalExpression,
      rolls,
      total,
      formula,
    };
  } catch (error) {
    if (error instanceof DiceParserError) {
      throw error;
    }
    throw new DiceParserError(`Failed to parse expression: ${expression}`);
  }
}

/**
 * Parse dice expression without rolling (for validation)
 * @param expression Dice expression
 * @returns true if valid, throws error if invalid
 */
export function parseDiceExpression(expression: string): boolean {
  // Validation
  if (!expression || expression.trim().length === 0) {
    throw new DiceParserError('Empty expression');
  }

  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new DiceParserError(`Expression too long. Maximum ${MAX_EXPRESSION_LENGTH} characters.`);
  }

  try {
    const tokens = tokenize(expression);

    if (tokens.length === 0) {
      throw new DiceParserError('Invalid expression');
    }

    let totalDiceCount = 0;

    // Validate tokens
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Check if token is a dice expression
      if (/d\d+/i.test(token)) {
        const regex = /^(\d+)?d(\d+)(kh\d+|kl\d+|dl\d+)?$/i;
        const match = token.match(regex);

        if (!match) {
          throw new DiceParserError(`Invalid dice notation: ${token}`);
        }

        const count = match[1] ? parseInt(match[1], 10) : 1;
        const sides = parseInt(match[2], 10);

        if (count > MAX_DICE) {
          throw new DiceParserError(`Too many dice. Maximum ${MAX_DICE} per roll.`);
        }

        if (sides > MAX_DIE_SIZE) {
          throw new DiceParserError(`Die size too large. Maximum d${MAX_DIE_SIZE}.`);
        }

        if (sides < 1) {
          throw new DiceParserError(`Invalid die size: d${sides}. Must be at least 1.`);
        }

        totalDiceCount += count;
      }
      // Check if token is an operator
      else if (['+', '-', '*', '/'].includes(token)) {
        // Valid operator
      }
      // Check if token is a number (modifier)
      else if (/^\d+$/.test(token)) {
        const value = parseInt(token, 10);

        if (value > MAX_MODIFIER) {
          throw new DiceParserError(`Modifier too large. Maximum ±${MAX_MODIFIER}.`);
        }
      }
      // Invalid token
      else {
        throw new DiceParserError(`Invalid token: ${token}`);
      }
    }

    // Check total dice count
    if (totalDiceCount > MAX_DICE) {
      throw new DiceParserError(`Too many dice. Maximum ${MAX_DICE} per expression.`);
    }

    return true;
  } catch (error) {
    if (error instanceof DiceParserError) {
      throw error;
    }
    throw new DiceParserError(`Failed to parse expression: ${expression}`);
  }
}
