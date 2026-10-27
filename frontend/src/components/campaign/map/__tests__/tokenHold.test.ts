import { describe, it, expect } from 'vitest';
import { carriedSquare, heldDrawnAt, releaseHeldToken } from '../tokenHold';

describe('releaseHeldToken', () => {
  it('names the square the token was picked up from, not wherever the cursor went', () => {
    const held = { id: 'tok-1', position: { x: 8, y: 6 } };
    expect(releaseHeldToken(held, 'map-1')).toEqual({ tokenId: 'tok-1', mapId: 'map-1', x: 8, y: 6 });
  });
});

describe('where a held token is drawn', () => {
  const map = { width: 10, height: 8 };
  const one = { position: { x: 3, y: 4 }, size: { width: 1, height: 1 } };
  const big = { position: { x: 3, y: 4 }, size: { width: 2, height: 2 } };

  // A finger lifted, or a pen out of range: nothing is carrying it, and it
  // stays drawn where it stands.
  it('is its own square while no pointer carries it', () => {
    expect(heldDrawnAt(one, null, map)).toEqual({ x: 3, y: 4 });
    expect(heldDrawnAt(big, null, map)).toEqual({ x: 3, y: 4 });
  });

  it("is the carrying pointer's square less the square of the token it was taken by", () => {
    // Taken by its top-right square, (4, 5), and carried to (7, 2).
    expect(heldDrawnAt(big, { square: { x: 7, y: 2 }, offset: { x: 1, y: 1 } }, map)).toEqual({ x: 6, y: 1 });
    expect(heldDrawnAt(one, { square: { x: 0, y: 7 }, offset: { x: 0, y: 0 } }, map)).toEqual({ x: 0, y: 7 });
  });

  // Taken by its top-right square near the left or bottom edge, or by its
  // bottom-left square near the right or top edge, a two-square token would
  // hang half off the map.
  it.each([
    ['left', { x: 0, y: 3 }, { x: 1, y: 1 }, { x: 0, y: 2 }],
    ['bottom', { x: 4, y: 0 }, { x: 1, y: 1 }, { x: 3, y: 0 }],
    ['right', { x: 9, y: 3 }, { x: 0, y: 0 }, { x: 8, y: 3 }],
    ['top', { x: 4, y: 7 }, { x: 0, y: 0 }, { x: 4, y: 6 }],
  ])('keeps a two-square token whole on the map at the %s edge', (_edge, square, offset, drawn) => {
    expect(heldDrawnAt(big, { square, offset }, map)).toEqual(drawn);
    expect(carriedSquare({ square, offset }, big.size, map)).toEqual(drawn);
  });
});
