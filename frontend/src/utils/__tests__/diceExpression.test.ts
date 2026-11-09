/**
 * Whether a value on a sheet is offered as a roll.
 *
 * The check looked only at which characters a value held, so it offered
 * values the dice parser refuses, such as `2d6+`, `dddd` and a Pathfinder 2e
 * strike's `1d8+4 S`, and the roll failed once it reached the server. It now
 * asks the parser, the one the server and a paused table roll by, so the two
 * verdicts cannot part.
 */

import { describe, it, expect } from 'vitest';
import { isValidDiceExpression } from '../diceExpression';
import { parseDiceExpression } from '../dice-parser';

const parserAccepts = (expression: string) => {
  try {
    return parseDiceExpression(expression);
  } catch {
    return false;
  }
};

describe('isValidDiceExpression', () => {
  it.each(['1d20', '2d6+3', 'd10', '1D10+1D4', '4d6kh3', '2d20kl1', '4d6dl1', 'adv', 'dis+2', '1d6 + 2', ' 2d6 ', '2d6++3', '8d6/2', '0d6'])(
    'offers %j, which the parser rolls',
    (expression) => {
      expect(isValidDiceExpression(expression)).toBe(true);
    },
  );

  it.each(['2d6+', 'dddd', '1d8+4 S', '1d20 5', '2d6*', '/2d6', 'd', '+', 'kh', 'said', '1d0', '200d6', '1d2000', '1d6+10000', `1d6${'+1'.repeat(100)}`, '', '   '])(
    'does not offer %j, which the parser refuses',
    (expression) => {
      expect(isValidDiceExpression(expression)).toBe(false);
    },
  );

  it('gives the verdict the parser gives', () => {
    const values = ['1d20', '2d6+', 'dddd', '1d8+4 S', 'adv', '200d6', '1d6 + 2', 'not dice', '1d4+half DB'];
    expect(values.map(isValidDiceExpression)).toEqual(values.map(parserAccepts));
  });
});
