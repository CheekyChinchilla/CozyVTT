import { describe, expect, it } from 'vitest';
import { getModeLabels, systemSupportsAdvantage } from '../rollModes';

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
