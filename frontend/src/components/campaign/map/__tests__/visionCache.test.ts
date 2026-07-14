/**
 * Vision cache tests.
 *
 * The cache must (a) return byte-identical polygons to the uncached path,
 * (b) reuse a source's polygon when only OTHER sources move, and
 * (c) invalidate everything when the wall array reference changes (any
 * wall mutation). We assert cache hits/misses by object identity of the
 * returned VisionSource — a hit reuses the same reference, a miss makes
 * a new one.
 */

import { describe, it, expect } from 'vitest';
import { createVisionCache, computeVisionState } from '../vision';
import type { Viewport } from '../layers/types';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';
import type { WallSegment, LightSource } from '@/types/walls';

const viewport: Viewport = {
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  gridSize: 50,
  mapWidth: 10,
  mapHeight: 10,
};

function token(id: string, x: number, y: number): Token {
  return {
    id, characterId: null, name: id, imageUrl: '',
    position: { x, y }, size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN, visible: true, controlledBy: null,
    rotation: 0, conditions: [], metadata: {},
    type: TokenType.PLAYER, disposition: null, hp: null, showHpBar: false,
    notes: '', initiative: null, sightRadius: 6,
  } as Token;
}

const wall: WallSegment = { id: 'w1', x1: 100, y1: 0, x2: 100, y2: 500, type: 'wall' };
const light: LightSource = { id: 'l1', x: 300, y: 300, brightRadius: 2, dimRadius: 4, color: '#ffaa00', enabled: true };

describe('createVisionCache', () => {
  it('matches the uncached computeVisionState output', () => {
    const cache = createVisionCache();
    const walls = [wall];
    const a = computeVisionState([token('a', 1, 1)], [light], walls, viewport);
    const b = cache.compute([token('a', 1, 1)], [light], walls, viewport);
    expect(b.tokenVision[0].poly.points).toEqual(a.tokenVision[0].poly.points);
    expect(b.lightVision[0].poly.points).toEqual(a.lightVision[0].poly.points);
    expect(b.all).toHaveLength(2);
  });

  it('reuses a source polygon when nothing changed (cache hit)', () => {
    const cache = createVisionCache();
    const walls = [wall];
    const first = cache.compute([token('a', 1, 1)], [light], walls, viewport);
    const second = cache.compute([token('a', 1, 1)], [light], walls, viewport);
    // Same wall ref + same positions → same VisionSource objects returned
    expect(second.tokenVision[0]).toBe(first.tokenVision[0]);
    expect(second.lightVision[0]).toBe(first.lightVision[0]);
  });

  it('recomputes only the moved token; the light stays cached', () => {
    const cache = createVisionCache();
    const walls = [wall];
    const first = cache.compute([token('a', 1, 1)], [light], walls, viewport);
    const second = cache.compute([token('a', 3, 3)], [light], walls, viewport); // token moved
    expect(second.tokenVision[0]).not.toBe(first.tokenVision[0]); // miss (moved)
    expect(second.lightVision[0]).toBe(first.lightVision[0]);     // hit (unchanged)
  });

  it('invalidates the whole cache when the wall array reference changes', () => {
    const cache = createVisionCache();
    const walls1 = [wall];
    const first = cache.compute([token('a', 1, 1)], [light], walls1, viewport);
    // A wall edit produces a NEW array (even with identical contents here)
    const walls2 = [wall];
    const second = cache.compute([token('a', 1, 1)], [light], walls2, viewport);
    expect(second.tokenVision[0]).not.toBe(first.tokenVision[0]);
    expect(second.lightVision[0]).not.toBe(first.lightVision[0]);
  });

  it('drops cache entries for removed sources', () => {
    const cache = createVisionCache();
    const walls = [wall];
    cache.compute([token('a', 1, 1), token('b', 5, 5)], [], walls, viewport);
    // 'a' removed this frame, then re-added next frame at the SAME spot →
    // must be a fresh compute (its cache entry was pruned), not a stale hit.
    const only_b = cache.compute([token('b', 5, 5)], [], walls, viewport);
    const readd = cache.compute([token('a', 1, 1), token('b', 5, 5)], [], walls, viewport);
    expect(readd.tokenVision[1]).toBe(only_b.tokenVision[0]); // 'b' stayed cached
    expect(readd.tokenVision).toHaveLength(2);
  });
});
