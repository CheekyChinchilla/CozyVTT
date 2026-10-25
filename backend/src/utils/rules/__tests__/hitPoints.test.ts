/**
 * Damage and healing with temporary hit points (rules/hitPoints.ts), which the
 * server applies to characters and the token editor to creatures.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { applyHitPointChange } from '../hitPoints';

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

  // The roster's buttons and the token editor must not disagree on a hit.
  it('is byte-for-byte identical to frontend/src/utils/rules/hitPoints.ts', () => {
    const backendCopy = readFileSync(path.resolve(__dirname, '../hitPoints.ts'), 'utf8');
    const frontendCopy = readFileSync(path.resolve(__dirname, '../../../../../frontend/src/utils/rules/hitPoints.ts'), 'utf8');
    expect(backendCopy).toBe(frontendCopy);
  });
});
