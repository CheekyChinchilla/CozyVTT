/**
 * Dice Parser Unit Tests
 * Tests for SOW Section 7 compliance
 */

import { rollDice, parseDiceExpression, DiceParserError } from './dice-parser';

describe('Dice Parser', () => {
  describe('Basic Rolls', () => {
    test('1d20 - single die roll', () => {
      const result = rollDice('1d20');

      expect(result.expression).toBe('1d20');
      expect(result.rolls).toHaveLength(1);
      expect(result.rolls[0].type).toBe('dice');
      expect(result.rolls[0].count).toBe(1);
      expect(result.rolls[0].sides).toBe(20);
      expect(result.rolls[0].results).toHaveLength(1);
      expect(result.rolls[0].results![0]).toBeGreaterThanOrEqual(1);
      expect(result.rolls[0].results![0]).toBeLessThanOrEqual(20);
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.total).toBeLessThanOrEqual(20);
    });

    test('2d6 - multiple dice', () => {
      const result = rollDice('2d6');

      expect(result.rolls).toHaveLength(1);
      expect(result.rolls[0].count).toBe(2);
      expect(result.rolls[0].sides).toBe(6);
      expect(result.rolls[0].results).toHaveLength(2);
      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.total).toBeLessThanOrEqual(12);
    });

    test('d6 - implicit 1d6', () => {
      const result = rollDice('d6');

      expect(result.rolls[0].count).toBe(1);
      expect(result.rolls[0].sides).toBe(6);
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.total).toBeLessThanOrEqual(6);
    });

    test('3d10 - three dice', () => {
      const result = rollDice('3d10');

      expect(result.rolls[0].count).toBe(3);
      expect(result.rolls[0].sides).toBe(10);
      expect(result.rolls[0].results).toHaveLength(3);
      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(result.total).toBeLessThanOrEqual(30);
    });
  });

  describe('Rolls with Modifiers', () => {
    test('1d20+5 - roll with addition', () => {
      const result = rollDice('1d20+5');

      expect(result.rolls).toHaveLength(2);
      expect(result.rolls[0].type).toBe('dice');
      expect(result.rolls[1].type).toBe('modifier');
      expect(result.rolls[1].value).toBe(5);
      expect(result.total).toBeGreaterThanOrEqual(6);
      expect(result.total).toBeLessThanOrEqual(25);
    });

    test('2d6-2 - roll with subtraction', () => {
      const result = rollDice('2d6-2');

      expect(result.rolls).toHaveLength(2);
      expect(result.rolls[1].value).toBe(2);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(10);
    });

    test('1d8+3 - roll with modifier', () => {
      const result = rollDice('1d8+3');

      expect(result.total).toBeGreaterThanOrEqual(4);
      expect(result.total).toBeLessThanOrEqual(11);
    });

    test('3d10*2 - roll with multiplication', () => {
      const result = rollDice('3d10*2');

      expect(result.total).toBeGreaterThanOrEqual(6);
      expect(result.total).toBeLessThanOrEqual(60);
      expect(result.formula).toContain('*');
    });

    test('4d6/2 - roll with division', () => {
      const result = rollDice('4d6/2');

      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.total).toBeLessThanOrEqual(12);
      expect(result.formula).toContain('/');
    });
  });

  describe('Multiple Dice Types', () => {
    test('2d6+1d4+3 - multiple dice and modifier', () => {
      const result = rollDice('2d6+1d4+3');

      expect(result.rolls).toHaveLength(3);
      expect(result.rolls[0].notation).toBe('2d6');
      expect(result.rolls[1].notation).toBe('1d4');
      expect(result.rolls[2].type).toBe('modifier');
      expect(result.total).toBeGreaterThanOrEqual(6); // 2+1+3 minimum
      expect(result.total).toBeLessThanOrEqual(19); // 12+4+3 maximum
    });

    test('1d20+2d6 - attack roll with damage', () => {
      const result = rollDice('1d20+2d6');

      expect(result.rolls).toHaveLength(2);
      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(result.total).toBeLessThanOrEqual(32);
    });

    test('1d8+1d6+1d4+2 - complex multi-dice', () => {
      const result = rollDice('1d8+1d6+1d4+2');

      expect(result.rolls).toHaveLength(4);
      expect(result.total).toBeGreaterThanOrEqual(5); // 1+1+1+2
      expect(result.total).toBeLessThanOrEqual(20); // 8+6+4+2
    });
  });

  describe('Keep/Drop Modifiers', () => {
    test('4d6kh3 - keep highest 3', () => {
      const result = rollDice('4d6kh3');

      expect(result.rolls[0].count).toBe(4);
      expect(result.rolls[0].results).toHaveLength(4);
      expect(result.rolls[0].kept).toHaveLength(3);
      expect(result.rolls[0].modifier).toBe('kh');
      expect(result.rolls[0].modifierCount).toBe(3);

      // Verify kept are the highest 3
      const sortedResults = [...result.rolls[0].results!].sort((a, b) => b - a);
      const expectedKept = sortedResults.slice(0, 3);
      expect(result.rolls[0].kept!.sort((a, b) => b - a)).toEqual(expectedKept);
    });

    test('2d20kh1 - advantage roll', () => {
      const result = rollDice('2d20kh1');

      expect(result.rolls[0].count).toBe(2);
      expect(result.rolls[0].kept).toHaveLength(1);
      expect(result.rolls[0].modifier).toBe('kh');

      // Verify kept is the highest
      const highest = Math.max(...result.rolls[0].results!);
      expect(result.rolls[0].kept![0]).toBe(highest);
    });

    test('2d20kl1 - disadvantage roll', () => {
      const result = rollDice('2d20kl1');

      expect(result.rolls[0].count).toBe(2);
      expect(result.rolls[0].kept).toHaveLength(1);
      expect(result.rolls[0].modifier).toBe('kl');

      // Verify kept is the lowest
      const lowest = Math.min(...result.rolls[0].results!);
      expect(result.rolls[0].kept![0]).toBe(lowest);
    });

    test('4d6dl1 - drop lowest', () => {
      const result = rollDice('4d6dl1');

      expect(result.rolls[0].count).toBe(4);
      expect(result.rolls[0].results).toHaveLength(4);
      expect(result.rolls[0].kept).toHaveLength(3);
      expect(result.rolls[0].modifier).toBe('dl');

      // Verify lowest is dropped (kept has 3 highest values)
      const sortedResults = [...result.rolls[0].results!].sort((a, b) => a - b);
      const expectedKept = sortedResults.slice(1); // Drop first (lowest)

      expect(result.rolls[0].kept!.sort((a, b) => a - b)).toEqual(expectedKept);
    });

    test('2d20kh1+5 - advantage with modifier', () => {
      const result = rollDice('2d20kh1+5');

      expect(result.rolls).toHaveLength(2);
      expect(result.rolls[0].modifier).toBe('kh');
      expect(result.rolls[1].value).toBe(5);
      expect(result.total).toBeGreaterThanOrEqual(6);
      expect(result.total).toBeLessThanOrEqual(25);
    });
  });

  describe('Shorthand Notation', () => {
    test('adv - advantage shorthand', () => {
      const result = rollDice('adv');

      expect(result.rolls[0].count).toBe(2);
      expect(result.rolls[0].sides).toBe(20);
      expect(result.rolls[0].kept).toHaveLength(1);
      expect(result.rolls[0].modifier).toBe('kh');
    });

    test('dis - disadvantage shorthand', () => {
      const result = rollDice('dis');

      expect(result.rolls[0].count).toBe(2);
      expect(result.rolls[0].sides).toBe(20);
      expect(result.rolls[0].kept).toHaveLength(1);
      expect(result.rolls[0].modifier).toBe('kl');
    });

    test('adv+5 - advantage with modifier', () => {
      const result = rollDice('adv+5');

      expect(result.rolls).toHaveLength(2);
      expect(result.rolls[0].modifier).toBe('kh');
      expect(result.rolls[1].value).toBe(5);
    });
  });

  describe('Whitespace Handling', () => {
    test('1d20 + 5 - with spaces', () => {
      const result = rollDice('1d20 + 5');

      expect(result.rolls).toHaveLength(2);
      expect(result.total).toBeGreaterThanOrEqual(6);
      expect(result.total).toBeLessThanOrEqual(25);
    });

    test('  2d6  +  3  - extra spaces', () => {
      const result = rollDice('  2d6  +  3  ');

      expect(result.rolls).toHaveLength(2);
      expect(result.total).toBeGreaterThanOrEqual(5);
      expect(result.total).toBeLessThanOrEqual(15);
    });
  });

  describe('Edge Cases', () => {
    test('1d1 - minimum die size', () => {
      const result = rollDice('1d1');

      expect(result.total).toBe(1);
      expect(result.rolls[0].results![0]).toBe(1);
    });

    test('d1000 - maximum die size', () => {
      const result = rollDice('d1000');

      expect(result.rolls[0].sides).toBe(1000);
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.total).toBeLessThanOrEqual(1000);
    });

    test('100d1 - maximum dice count', () => {
      const result = rollDice('100d1');

      expect(result.rolls[0].count).toBe(100);
      expect(result.total).toBe(100);
    });

    test('1d20+9999 - maximum modifier', () => {
      const result = rollDice('1d20+9999');

      expect(result.rolls[1].value).toBe(9999);
      expect(result.total).toBeGreaterThanOrEqual(10000);
      expect(result.total).toBeLessThanOrEqual(10019);
    });
  });

  describe('Limit Enforcement', () => {
    test('101d20 - too many dice', () => {
      expect(() => rollDice('101d20')).toThrow(DiceParserError);
      expect(() => rollDice('101d20')).toThrow('Too many dice');
    });

    test('50d6+51d6 - total dice exceeds limit', () => {
      expect(() => rollDice('50d6+51d6')).toThrow(DiceParserError);
      expect(() => rollDice('50d6+51d6')).toThrow('Too many dice');
    });

    test('1d1001 - die size too large', () => {
      expect(() => rollDice('1d1001')).toThrow(DiceParserError);
      expect(() => rollDice('1d1001')).toThrow('Die size too large');
    });

    test('1d20+10000 - modifier too large', () => {
      expect(() => rollDice('1d20+10000')).toThrow(DiceParserError);
      expect(() => rollDice('1d20+10000')).toThrow('Modifier too large');
    });

    test('very long expression - exceeds character limit', () => {
      const longExpression = '1d20+'.repeat(100) + '1';
      expect(() => rollDice(longExpression)).toThrow(DiceParserError);
      expect(() => rollDice(longExpression)).toThrow('Expression too long');
    });
  });

  describe('Invalid Syntax', () => {
    test('empty expression', () => {
      expect(() => rollDice('')).toThrow(DiceParserError);
      expect(() => rollDice('')).toThrow('Empty expression');
    });

    test('whitespace only', () => {
      expect(() => rollDice('   ')).toThrow(DiceParserError);
      expect(() => rollDice('   ')).toThrow('Empty expression');
    });

    test('invalid dice notation - d0', () => {
      expect(() => rollDice('d0')).toThrow(DiceParserError);
      expect(() => rollDice('d0')).toThrow('Invalid die size');
    });

    test('invalid dice notation - 2x6', () => {
      expect(() => rollDice('2x6')).toThrow(DiceParserError);
    });

    test('invalid dice notation - 2d', () => {
      expect(() => rollDice('2d')).toThrow(DiceParserError);
    });

    test('invalid modifier - kh', () => {
      expect(() => rollDice('2d6kh')).toThrow(DiceParserError);
    });

    test('random text', () => {
      expect(() => rollDice('hello world')).toThrow(DiceParserError);
    });

    test('incomplete expression - 1d20+', () => {
      expect(() => rollDice('1d20+')).toThrow(DiceParserError);
    });

    test('double operators - 1d20**5', () => {
      // Note: 1d20++5 is valid (equivalent to 1d20 + (+5))
      // Testing ** which is not a supported operator
      expect(() => rollDice('1d20**5')).toThrow(DiceParserError);
    });
  });

  describe('parseDiceExpression (Validation Only)', () => {
    test('valid expression - 1d20+5', () => {
      expect(parseDiceExpression('1d20+5')).toBe(true);
    });

    test('valid expression - 4d6kh3', () => {
      expect(parseDiceExpression('4d6kh3')).toBe(true);
    });

    test('valid expression - adv', () => {
      expect(parseDiceExpression('adv')).toBe(true);
    });

    test('invalid expression - 101d20', () => {
      expect(() => parseDiceExpression('101d20')).toThrow(DiceParserError);
    });

    test('invalid expression - empty', () => {
      expect(() => parseDiceExpression('')).toThrow(DiceParserError);
    });

    test('invalid expression - random text', () => {
      expect(() => parseDiceExpression('invalid')).toThrow(DiceParserError);
    });
  });

  describe('Formula Generation', () => {
    test('formula shows dice totals', () => {
      const result = rollDice('2d6+3');

      expect(result.formula).toMatch(/^\d+ \+ 3$/);
    });

    test('formula shows multiple dice', () => {
      const result = rollDice('2d6+1d4');

      expect(result.formula).toMatch(/^\d+ \+ \d+$/);
    });

    test('formula shows operations', () => {
      const result = rollDice('2d6*2');

      expect(result.formula).toContain('*');
    });
  });

  describe('Deterministic Tests (Results Validation)', () => {
    test('all results are within valid range', () => {
      for (let i = 0; i < 100; i++) {
        const result = rollDice('5d10');
        expect(result.total).toBeGreaterThanOrEqual(5);
        expect(result.total).toBeLessThanOrEqual(50);

        result.rolls[0].results!.forEach((r) => {
          expect(r).toBeGreaterThanOrEqual(1);
          expect(r).toBeLessThanOrEqual(10);
        });
      }
    });

    test('kept values are correctly filtered', () => {
      for (let i = 0; i < 50; i++) {
        const result = rollDice('4d6kh3');
        const roll = result.rolls[0];

        // Kept should have 3 values
        expect(roll.kept).toHaveLength(3);

        // Kept should be the 3 highest
        const sortedResults = [...roll.results!].sort((a, b) => b - a);
        const expectedKept = sortedResults.slice(0, 3);
        expect(roll.kept!.sort((a, b) => b - a)).toEqual(expectedKept);

        // Total should equal sum of kept
        const keptSum = roll.kept!.reduce((sum, val) => sum + val, 0);
        expect(roll.total).toBe(keptSum);
      }
    });
  });
});
