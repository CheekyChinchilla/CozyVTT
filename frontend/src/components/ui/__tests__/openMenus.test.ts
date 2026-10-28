/**
 * A menu opened elsewhere closes the map's: `menuOpened` tells whatever
 * `whenMenuOpens` has subscribed, until it is stopped.
 */

import { it, expect, vi } from 'vitest';
import { menuOpened, whenMenuOpens } from '../openMenus';

it('tells a subscriber each time a menu opens', () => {
  const told = vi.fn();
  const stop = whenMenuOpens(told);
  menuOpened();
  menuOpened();
  stop();
  expect(told).toHaveBeenCalledTimes(2);
});

it('tells a subscriber nothing once it is stopped', () => {
  const told = vi.fn();
  whenMenuOpens(told)();
  menuOpened();
  expect(told).not.toHaveBeenCalled();
});

// The map's menus stop listening as they close, which can happen while
// they are being told.
it('tells the next subscriber when one stops itself while being told', () => {
  const next = vi.fn();
  const stopFirst = whenMenuOpens(() => stopFirst());
  const stopNext = whenMenuOpens(next);
  menuOpened();
  stopNext();
  expect(next).toHaveBeenCalledTimes(1);
});
