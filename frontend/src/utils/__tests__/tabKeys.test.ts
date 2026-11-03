/**
 * The keys of a row of tabs: the arrows move to the tab before or after,
 * round the ends, and Home and End to the first and the last, as a
 * screen reader tells its user a tab row does.
 */
import { describe, it, expect } from 'vitest';
import { tabKeyTarget } from '../tabKeys';

describe('a key on a row of five tabs', () => {
  it('moves the arrows to the tab beside, round the ends', () => {
    expect(tabKeyTarget('ArrowRight', 1, 5)).toBe(2);
    expect(tabKeyTarget('ArrowLeft', 1, 5)).toBe(0);
    expect(tabKeyTarget('ArrowRight', 4, 5)).toBe(0);
    expect(tabKeyTarget('ArrowLeft', 0, 5)).toBe(4);
  });

  it('takes Home and End to the first and the last', () => {
    expect(tabKeyTarget('Home', 3, 5)).toBe(0);
    expect(tabKeyTarget('End', 1, 5)).toBe(4);
  });

  it('leaves every other key alone', () => {
    for (const key of ['Enter', ' ', 'ArrowUp', 'ArrowDown', 'Tab', 'a']) expect(tabKeyTarget(key, 2, 5)).toBeNull();
  });
});
