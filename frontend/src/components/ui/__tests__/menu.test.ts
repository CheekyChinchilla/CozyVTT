/**
 * Where a popover opened at a point stands (flipOntoScreen), the one rule
 * the map's token and door menus, the character menu and the Roll...
 * pickers are placed by. The screen here is 1,000 by 800; the popover 200 by 300.
 */

import { it, expect } from 'vitest';
import { flipOntoScreen } from '../menu';

const size = { width: 200, height: 300 };
const screen = { width: 1000, height: 800 };

it('stands at the point where it fits', () => {
  expect(flipOntoScreen({ x: 100, y: 100 }, size, screen)).toEqual({ x: 100, y: 100 });
});

it('flips to the left of the point near the right edge, and only that way', () => {
  expect(flipOntoScreen({ x: 900, y: 100 }, size, screen)).toEqual({ x: 700, y: 100 });
});

it('flips above the point near the bottom edge, and only that way', () => {
  expect(flipOntoScreen({ x: 100, y: 600 }, size, screen)).toEqual({ x: 100, y: 300 });
});

it('stops at the left and top edges where there is no room on the far side either', () => {
  expect(flipOntoScreen({ x: 150, y: 250 }, { width: 900, height: 700 }, screen)).toEqual({ x: 0, y: 0 });
});
