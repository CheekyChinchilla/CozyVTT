/**
 * Spirit Layer — filterTokensByLighting Unit Tests
 *
 * Tests server-side visibility enforcement for dynamic lighting.
 * The function should only pass tokens that are within the player's
 * raycasting visibility polygon (or tokens controlled by the player themselves).
 */

import { filterTokensByLighting } from './spirit-layer';
import type { WallSegment } from '../types/walls';

// Minimal token factory
function makeToken(
  id: string,
  x: number,
  y: number,
  controlledBy: string | null = null,
  sightRadius = 0
) {
  return {
    id,
    name: `Token ${id}`,
    imageUrl: '',
    position: { x, y },
    size: { width: 1, height: 1 },
    layer: 'token' as const,
    visible: true,
    controlledBy,
    rotation: 0,
    conditions: [],
    metadata: {},
    sightRadius,
  };
}

function makeWall(id: string, x1: number, y1: number, x2: number, y2: number): WallSegment {
  return { id, x1, y1, x2, y2, type: 'wall' };
}

// Map is 1000×1000 pixels, gridSize=100 so 10×10 squares
const MAP_WIDTH = 10;
const MAP_HEIGHT = 10;
const GRID_SIZE = 100;
const NO_WALLS: WallSegment[] = [];

describe('filterTokensByLighting', () => {
  it('returns all tokens when lightingEnabled is false', () => {
    const tokens = [makeToken('a', 2, 2), makeToken('b', 7, 7)];
    const result = filterTokensByLighting(tokens, 'user1', NO_WALLS, MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, false);
    expect(result).toHaveLength(2);
  });

  it('returns only visible tokens when player has no controlled tokens', () => {
    const tokens = [
      makeToken('a', 2, 2),
      { ...makeToken('b', 5, 5), visible: false },
    ];
    const result = filterTokensByLighting(tokens, 'user-nobody', NO_WALLS, MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, true);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('always includes the player\'s own token regardless of sight', () => {
    // Player token at 2,2 with very small sightRadius so it can't see far
    const playerToken = makeToken('mine', 2, 2, 'user1', 0.1);
    // Another token far away
    const farToken = makeToken('far', 8, 8);
    const tokens = [playerToken, farToken];

    const result = filterTokensByLighting(tokens, 'user1', NO_WALLS, MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, true);
    // Own token always included
    expect(result.some((t) => t.id === 'mine')).toBe(true);
  });

  it('includes nearby token visible through open space', () => {
    // Player at center (5,5 grid = 550,550 px center), sight covers whole map (0 = full)
    const playerToken = makeToken('player', 4, 4, 'user1', 0);
    // Another token one square away — should be in polygon
    const nearbyToken = makeToken('nearby', 5, 4);
    const tokens = [playerToken, nearbyToken];

    const result = filterTokensByLighting(tokens, 'user1', NO_WALLS, MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, true);
    expect(result.some((t) => t.id === 'nearby')).toBe(true);
  });

  it('excludes token blocked behind a solid wall', () => {
    // Wall along x=500px (col 5), from y=0 to y=1000, dividing map in half
    const wall = makeWall('wall1', 500, 0, 500, 1000);

    // Player at grid (2,5) = pixel center ~(250,550)
    const playerToken = makeToken('player', 2, 5, 'user1', 0);
    // Token on the far side of the wall at grid (7,5) = pixel center ~(750,550)
    const blockedToken = makeToken('blocked', 7, 5);

    const result = filterTokensByLighting(
      [playerToken, blockedToken],
      'user1',
      [wall],
      MAP_WIDTH,
      MAP_HEIGHT,
      GRID_SIZE,
      true
    );

    expect(result.some((t) => t.id === 'blocked')).toBe(false);
    // Player's own token still included
    expect(result.some((t) => t.id === 'player')).toBe(true);
  });

  it('includes token visible through an open door', () => {
    // Door segment (open) along x=500, does NOT block vision
    const openDoor: WallSegment = { id: 'door1', x1: 500, y1: 0, x2: 500, y2: 1000, type: 'door-open' };

    const playerToken = makeToken('player', 2, 5, 'user1', 0);
    const otherToken = makeToken('other', 7, 5);

    const result = filterTokensByLighting(
      [playerToken, otherToken],
      'user1',
      [openDoor],
      MAP_WIDTH,
      MAP_HEIGHT,
      GRID_SIZE,
      true
    );

    // Open door doesn't block — token should be visible
    expect(result.some((t) => t.id === 'other')).toBe(true);
  });

  it('multiple controlled tokens combine sight areas', () => {
    // Two player tokens at opposite ends of map, each seeing their half
    const leftToken = makeToken('left', 1, 5, 'user1', 0);
    const rightToken = makeToken('right', 8, 5, 'user1', 0);

    // Wall dividing map — but since both tokens have unlimited sight, both sides covered
    const wall = makeWall('wall1', 500, 0, 500, 1000);

    const leftNPC = makeToken('leftNPC', 2, 5);
    const rightNPC = makeToken('rightNPC', 7, 5);

    const result = filterTokensByLighting(
      [leftToken, rightToken, leftNPC, rightNPC],
      'user1',
      [wall],
      MAP_WIDTH,
      MAP_HEIGHT,
      GRID_SIZE,
      true
    );

    // Both NPCs visible because combined sight covers the whole map
    expect(result.some((t) => t.id === 'leftNPC')).toBe(true);
    expect(result.some((t) => t.id === 'rightNPC')).toBe(true);
  });
});
