/**
 * What a light reaches is kept from one read of the map to the next.
 *
 * Every token move on a lit map reads the map again and works out each
 * player's sight from that read. The walls and lights are the same from one
 * move to the next, and each light's reach used to be raycast again every
 * time. It is kept now, by what the walls and the light are, so a changed
 * wall or a moved light is worked out afresh and never answered from before.
 */

import * as raycasting from '../raycasting';
import { filterTokensByLighting } from '../spirit-layer';
import type { Token } from '../../websocket/shared';
import type { WallSegment, LightSource } from '../../types/walls';

const GRID = 100;
const SIZE = 20;

/** A token at grid (x, y), y counted from the bottom row. */
function token(id: string, x: number, y: number, controlledBy: string | null = null): Token {
  return {
    id, name: id, imageUrl: '', position: { x, y }, size: { width: 1, height: 1 }, layer: 'token',
    visible: true, controlledBy, rotation: 0, conditions: [], metadata: {}, sightRadius: 0,
  } as unknown as Token;
}

// The player's token at the left, an NPC in the dark at the right, both on
// the row whose centre is 950 px down; nothing stands between them.
const tokens = [token('me', 2, 10, 'p1'), token('npc', 14, 10)];

function light(id: string, x: number): LightSource {
  return { id, x, y: 950, brightRadius: 2, dimRadius: 4, color: '#ffaa55', enabled: true } as LightSource;
}

/** A wall standing across the row at x, between the NPC and a light to its right. */
function wallAt(x: number, type: WallSegment['type'] = 'wall'): WallSegment {
  return { id: 'w1', x1: x, y1: 800, x2: x, y2: 1100, type };
}

/** Which tokens the player is sent from one read of the map: fresh arrays every time, as a read gives. */
function sent(walls: WallSegment[], lights: LightSource[]): string[] {
  const read = JSON.parse(JSON.stringify({ walls, lights })) as { walls: unknown; lights: unknown };
  return filterTokensByLighting(tokens, 'p1', read.walls, SIZE, SIZE, GRID, true, read.lights, false).map((t) => t.id).sort();
}

let reaches: jest.SpyInstance;
beforeEach(() => {
  reaches = jest.spyOn(raycasting, 'computeVisibility');
});
afterEach(() => {
  reaches.mockRestore();
});

/** How many lights' reach was raycast, as opposed to a token's sight, which has no radius. */
const lightsRaycast = () => reaches.mock.calls.filter((call) => (call[4] ?? 0) > 0).length;

describe('a light\'s reach across reads of the map', () => {
  it('is raycast once while the walls and the lights stay as they are', () => {
    const lights = [light('torch', 1750), light('lamp', 300)];
    const walls = [wallAt(1600), { id: 'w2', x1: 0, y1: 0, x2: 50, y2: 0, type: 'window' as const }];
    sent(walls, lights);
    const first = lightsRaycast();
    sent(walls, lights);
    sent(walls, lights);
    expect(lightsRaycast()).toBe(first);
  });

  it('is raycast again for the one light that moved', () => {
    const walls = [wallAt(1600)];
    sent(walls, [light('torch', 1750), light('lamp', 300)]);
    const before = lightsRaycast();
    sent(walls, [light('torch', 1760), light('lamp', 300)]);
    expect(lightsRaycast()).toBe(before + 1);
  });

  it('is raycast again for every light when a wall changes', () => {
    const lights = [light('torch', 1750), light('lamp', 300)];
    sent([wallAt(1600)], lights);
    const before = lightsRaycast();
    sent([wallAt(1600, 'door-open')], lights);
    expect(lightsRaycast()).toBe(before + 2);
  });

  it('never answers from before a change: what is seen follows the walls and the light', () => {
    // The torch lights the NPC; then a wall between them puts it in the
    // dark; the torch moved to the NPC's side of the wall lights it again;
    // back where it was, the wall opened as a door lets the light through,
    // and closed it does not.
    expect(sent([], [light('torch', 1750)])).toEqual(['me', 'npc']);
    expect(sent([wallAt(1600)], [light('torch', 1750)])).toEqual(['me']);
    expect(sent([wallAt(1600)], [light('torch', 1300)])).toEqual(['me', 'npc']);
    expect(sent([wallAt(1600, 'door-open')], [light('torch', 1750)])).toEqual(['me', 'npc']);
    expect(sent([wallAt(1600, 'door-closed')], [light('torch', 1750)])).toEqual(['me']);
    expect(sent([], [light('torch', 1750)])).toEqual(['me', 'npc']);
  });

  it('follows the light\'s radius and the map\'s size', () => {
    const walls = [wallAt(1600)];
    sent(walls, [light('torch', 1300)]);
    const before = lightsRaycast();
    sent(walls, [{ ...light('torch', 1300), dimRadius: 5 }]);
    expect(lightsRaycast()).toBe(before + 1);
    const read = JSON.parse(JSON.stringify({ walls, lights: [light('torch', 1300)] })) as { walls: unknown; lights: unknown };
    filterTokensByLighting(tokens, 'p1', read.walls, SIZE + 1, SIZE, GRID, true, read.lights, false);
    expect(lightsRaycast()).toBe(before + 2);
  });
});
