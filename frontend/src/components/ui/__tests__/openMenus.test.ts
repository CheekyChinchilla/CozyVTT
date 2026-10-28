/**
 * A menu opened elsewhere closes the map's: `menuOpened` tells whatever
 * `whenMenuOpens` has subscribed, until it is stopped. And whether a menu is
 * on the screen: `menuShown` until what it returns is called.
 */

import { it, expect, vi } from 'vitest';
import { anyMenuShown, menuOpened, menuShown, whenMenuOpens } from '../openMenus';

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

// The map asks, so the tap that closes a menu is not the first of a double
// tap to ping.
it('counts a menu on the screen until it says it has gone', () => {
  expect(anyMenuShown()).toBe(false);
  const firstGone = menuShown();
  const secondGone = menuShown();
  expect(anyMenuShown()).toBe(true);
  firstGone();
  expect(anyMenuShown()).toBe(true);
  secondGone();
  expect(anyMenuShown()).toBe(false);
});

it('counts a menu gone once, however often it says so', () => {
  const gone = menuShown();
  const otherGone = menuShown();
  gone();
  gone();
  expect(anyMenuShown()).toBe(true);
  otherGone();
  expect(anyMenuShown()).toBe(false);
});
