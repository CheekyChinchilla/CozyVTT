import { describe, it, expect } from 'vitest';
import { releaseHeldToken } from '../tokenHold';

describe('releaseHeldToken', () => {
  it('names the square the token was picked up from, not wherever the cursor went', () => {
    const held = { id: 'tok-1', position: { x: 8, y: 6 } };
    expect(releaseHeldToken(held, 'map-1')).toEqual({ tokenId: 'tok-1', mapId: 'map-1', x: 8, y: 6 });
  });
});
