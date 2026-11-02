/**
 * Damage and healing with temporary hit points (rules/hitPoints.ts), which the
 * server applies to characters and the token editor to creatures.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { applyHitPointChange, grantTemporaryHitPoints } from '../hitPoints';

describe('applyHitPointChange', () => {
  it('takes damage off temporary hit points first', () => {
    expect(applyHitPointChange({ current: 20, max: 30, temp: 8 }, -5)).toEqual({ current: 20, max: 30, temp: 3 });
  });

  it('takes what the temporary hit points cannot absorb off current hit points, and drops them', () => {
    expect(applyHitPointChange({ current: 20, max: 30, temp: 3 }, -5)).toEqual({ current: 18, max: 30, temp: 0 });
  });

  it('heals current hit points only, up to the maximum', () => {
    expect(applyHitPointChange({ current: 28, max: 30, temp: 8 }, 5)).toEqual({ current: 30, max: 30, temp: 8 });
  });

  it('stops current hit points at 0', () => {
    expect(applyHitPointChange({ current: 4, max: 30, temp: 0 }, -10)).toEqual({ current: 0, max: 30, temp: 0 });
  });

  it('reads negative temporary hit points as none', () => {
    expect(applyHitPointChange({ current: 10, max: 30, temp: -2 }, -1)).toEqual({ current: 9, max: 30, temp: 0 });
  });

});

describe('grantTemporaryHitPoints', () => {
  // Checked against the D&D 5e Basic Rules and the Pathfinder 2e Core
  // Rulebook: temporary hit points never add together, and a creature that
  // already has some keeps them or takes the new ones.
  it.each(['DND_5E', 'PATHFINDER_2E'])('in %s offers keeping what a creature has or taking the new ones, never both added', (system) => {
    expect(grantTemporaryHitPoints(10, 12, system)).toEqual({ keep: 10, take: 12 });
    expect(grantTemporaryHitPoints(10, 4, system)).toEqual({ keep: 10, take: 4 });
  });

  it('offers no choice to a creature with none, or with as many as it is granted', () => {
    expect(grantTemporaryHitPoints(0, 12, 'DND_5E')).toEqual({ keep: null, take: 12 });
    expect(grantTemporaryHitPoints(12, 12, 'PATHFINDER_2E')).toEqual({ keep: null, take: 12 });
  });

  it('reads negative temporary hit points as none', () => {
    expect(grantTemporaryHitPoints(-3, 5, 'DND_5E')).toEqual({ keep: null, take: 5 });
  });

  // A Call of Cthulhu sheet keeps no temporary hit points a grant could add
  // to, and a campaign with no game system has no rule to follow.
  it.each(['CALL_OF_CTHULHU_7E', 'SHADOWRUN_6E', null, undefined])('is null in %s, whose sheet keeps none', (system) => {
    expect(grantTemporaryHitPoints(0, 5, system)).toBeNull();
  });
});

describe('the rules file', () => {
  // The roster's buttons and the token editor must not disagree on a hit.
  it('is byte-for-byte identical to frontend/src/utils/rules/hitPoints.ts', () => {
    const backendCopy = readFileSync(path.resolve(__dirname, '../hitPoints.ts'), 'utf8');
    const frontendCopy = readFileSync(path.resolve(__dirname, '../../../../../frontend/src/utils/rules/hitPoints.ts'), 'utf8');
    expect(backendCopy).toBe(frontendCopy);
  });
});
