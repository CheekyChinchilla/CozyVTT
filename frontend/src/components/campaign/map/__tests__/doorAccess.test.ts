/**
 * Which doors the map offers a viewer to open, close or point at.
 *
 * Doors were found by distance alone: a player could open one none of their
 * tokens could see, and a spectator was given the toggle, drawn at once on
 * their page, which the server then refused. The map now offers the DM every
 * door, a player only a door they can see (on a lit map, by the rule the
 * walls layer shows doors by), and a spectator none. The server checks the
 * same.
 */

import { describe, it, expect } from 'vitest';
import { offeredDoorAt } from '../doorAccess';
import type { WallSegment } from '@/types/walls';

const door: WallSegment = { id: 'd1', x1: 100, y1: 100, x2: 150, y2: 100, type: 'door-closed' };
const wall: WallSegment = { id: 'w1', x1: 300, y1: 100, x2: 400, y2: 100, type: 'wall' };
const walls = [door, wall];
const seesNothing = () => false;
const seesAll = () => true;

describe('offeredDoorAt', () => {
  it('offers the DM a door under the pointer, seen or not', () => {
    expect(offeredDoorAt(walls, 125, 102, 12, { role: 'DM', lightingEnabled: true, canSee: seesNothing })).toBe(door);
  });

  it('offers a player a door they can see, and not one they cannot, on a lit map', () => {
    expect(offeredDoorAt(walls, 125, 102, 12, { role: 'PLAYER', lightingEnabled: true, canSee: seesAll })).toBe(door);
    expect(offeredDoorAt(walls, 125, 102, 12, { role: 'PLAYER', lightingEnabled: true, canSee: seesNothing })).toBeUndefined();
  });

  it('asks whether the door\'s middle is seen', () => {
    const asked: Array<[number, number]> = [];
    offeredDoorAt(walls, 125, 102, 12, { role: 'PLAYER', lightingEnabled: true, canSee: (x, y) => { asked.push([x, y]); return true; } });
    expect(asked).toEqual([[125, 100]]);
  });

  it('offers a player any door on a map without dynamic lighting', () => {
    expect(offeredDoorAt(walls, 125, 102, 12, { role: 'PLAYER', lightingEnabled: false, canSee: seesNothing })).toBe(door);
  });

  it('offers a spectator no door at all', () => {
    expect(offeredDoorAt(walls, 125, 102, 12, { role: 'SPECTATOR', lightingEnabled: false, canSee: seesAll })).toBeUndefined();
  });

  it('never offers a plain wall, or a door out of reach of the pointer', () => {
    expect(offeredDoorAt(walls, 350, 102, 12, { role: 'DM', lightingEnabled: false, canSee: seesAll })).toBeUndefined();
    expect(offeredDoorAt(walls, 125, 140, 12, { role: 'DM', lightingEnabled: false, canSee: seesAll })).toBeUndefined();
  });
});
