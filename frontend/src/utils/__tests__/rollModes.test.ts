import { describe, expect, it } from 'vitest';
import { applyRollMode, getModeLabels, systemSupportsAdvantage } from '../rollModes';

describe('the roll-mode selector both roll pickers show', () => {
  it('names Pathfinder 2e modes Fortune and Misfortune', () => {
    expect(getModeLabels('PATHFINDER_2E')).toEqual({ normal: 'Normal', advantage: 'Fortune', disadvantage: 'Misfortune' });
  });

  it.each(['DND_5E', null, 'SHADOWRUN_6E'])('names Advantage and Disadvantage for %s', (system) => {
    expect(getModeLabels(system)).toEqual({ normal: 'Normal', advantage: 'Advantage', disadvantage: 'Disadvantage' });
  });

  it('is shown for the d20 systems only, so a Call of Cthulhu roll is always Normal', () => {
    expect(systemSupportsAdvantage('DND_5E')).toBe(true);
    expect(systemSupportsAdvantage('PATHFINDER_2E')).toBe(true);
    expect(systemSupportsAdvantage('CALL_OF_CTHULHU_7E')).toBe(false);
    expect(systemSupportsAdvantage(null)).toBe(false);
    expect(getModeLabels('CALL_OF_CTHULHU_7E').normal).toBe('Normal');
  });
});

/**
 * A d20 test rolled in a mode. D&D 5e gives advantage or disadvantage on an
 * ability check, a saving throw or an attack roll: a second d20, the higher
 * or the lower kept. Pathfinder 2e's fortune and misfortune effects include
 * rolling twice and using the higher or the lower result. The dice log says
 * which, through the purpose.
 */
describe('applyRollMode', () => {
  it('rolls a D&D 5e test twice keeping the higher for advantage, and says so', () => {
    expect(applyRollMode('1d20+5', 'Stealth Check', 'advantage', 'DND_5E'))
      .toEqual({ expression: '2d20kh1+5', purpose: 'Stealth Check (Advantage)' });
  });

  it('keeps the lower for disadvantage, a negative modifier and a bare d20 included', () => {
    expect(applyRollMode('1d20-1', 'Dexterity Save', 'disadvantage', 'DND_5E'))
      .toEqual({ expression: '2d20kl1-1', purpose: 'Dexterity Save (Disadvantage)' });
    expect(applyRollMode('1d20', 'Luck', 'advantage', 'DND_5E'))
      .toEqual({ expression: '2d20kh1', purpose: 'Luck (Advantage)' });
  });

  it('names Pathfinder 2e\'s Fortune and Misfortune', () => {
    expect(applyRollMode('1d20+7', 'Longsword Strike', 'advantage', 'PATHFINDER_2E'))
      .toEqual({ expression: '2d20kh1+7', purpose: 'Longsword Strike (Fortune)' });
    expect(applyRollMode('1d20+3', 'Will Save', 'disadvantage', 'PATHFINDER_2E'))
      .toEqual({ expression: '2d20kl1+3', purpose: 'Will Save (Misfortune)' });
  });

  it('leaves a Normal roll as it is', () => {
    expect(applyRollMode('1d20+5', 'Stealth Check', 'normal', 'DND_5E'))
      .toEqual({ expression: '1d20+5', purpose: 'Stealth Check' });
  });

  it('leaves alone a system with no such rule: Call of Cthulhu\'s bonus and penalty dice are not a second d100', () => {
    expect(applyRollMode('1d100', 'Spot Hidden', 'advantage', 'CALL_OF_CTHULHU_7E'))
      .toEqual({ expression: '1d100', purpose: 'Spot Hidden' });
    expect(applyRollMode('1d20+2', 'Check', 'advantage', null))
      .toEqual({ expression: '1d20+2', purpose: 'Check' });
  });

  it('rewrites one d20 standing alone: at the end, or before a sign or a space', () => {
    const rolled = (expression: string, mode: 'advantage' | 'disadvantage') => applyRollMode(expression, 'Test', mode, 'DND_5E').expression;
    expect(rolled('1d20+5', 'advantage')).toBe('2d20kh1+5');
    expect(rolled('1d20-1', 'advantage')).toBe('2d20kh1-1');
    expect(rolled('1d20', 'advantage')).toBe('2d20kh1');
    expect(rolled('1d20 + 2', 'advantage')).toBe('2d20kh1 + 2');
    expect(rolled('1d20+5', 'disadvantage')).toBe('2d20kl1+5');
    expect(rolled('1d20-1', 'disadvantage')).toBe('2d20kl1-1');
    expect(rolled('1d20', 'disadvantage')).toBe('2d20kl1');
    expect(rolled('1D20+3', 'advantage')).toBe('2d20kh1+3');
  });

  it('leaves alone, unlabelled, a bigger die that starts the same and a d20 with a keep of its own', () => {
    for (const mode of ['advantage', 'disadvantage'] as const) {
      expect(applyRollMode('1d200+5', 'Big Die', mode, 'DND_5E')).toEqual({ expression: '1d200+5', purpose: 'Big Die' });
      expect(applyRollMode('1d20kh1+3', 'Kept', mode, 'DND_5E')).toEqual({ expression: '1d20kh1+3', purpose: 'Kept' });
      expect(applyRollMode('1d20dl1', 'Dropped', mode, 'PATHFINDER_2E')).toEqual({ expression: '1d20dl1', purpose: 'Dropped' });
    }
  });

  it('leaves alone, unlabelled, a roll that does not begin with one d20', () => {
    expect(applyRollMode('1d8+3', 'Longsword Damage', 'advantage', 'DND_5E'))
      .toEqual({ expression: '1d8+3', purpose: 'Longsword Damage' });
    expect(applyRollMode('2d20kh1+5', 'Stealth Check', 'disadvantage', 'DND_5E'))
      .toEqual({ expression: '2d20kh1+5', purpose: 'Stealth Check' });
  });
});
