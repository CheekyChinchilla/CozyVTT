/**
 * The store's tokens are of one map, and a read of that map's tokens loses
 * no move made while it is out.
 *
 * A token event for the map whose tokens are being read is applied at once
 * when that map is on screen, and kept to be applied again onto the answer,
 * which was read before it. A refetch of the map on screen applied it to the
 * old list only, and the answer then put the token back. Drag frames are not
 * kept, and no more than MAX_HELD_TOKEN_EVENTS are.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, MAX_HELD_TOKEN_EVENTS } from '../gameStore';
import type { Token } from '@/types';

const token = (id: string, x = 1, y = 1) =>
  ({ id, name: id, position: { x, y }, size: { width: 1, height: 1 } }) as unknown as Token;
const store = () => useGameStore.getState();
const moveTo = (id: string, x: number, y: number) => () => store().receiveTokenMove(id, { x, y }, false);

beforeEach(() => {
  store().clearGameState();
  store().setTokens([token('mara')], 'village');
});

describe('a read of the map on screen', () => {
  it('keeps a move made while it is out', () => {
    store().expectTokensOf('village');
    store().onMapTokens('village', moveTo('mara', 5, 5));
    // Shown at once, while the read is out.
    expect(store().tokens.mara.position).toEqual({ x: 5, y: 5 });
    // The answer was read before the move.
    store().setTokens([token('mara', 1, 1)], 'village');
    expect(store().tokens.mara.position).toEqual({ x: 5, y: 5 });
  });

  it('keeps no drag frame, which only moves where a token is drawn', () => {
    store().expectTokensOf('village');
    store().onMapTokens('village', () => undefined, { hold: false });
    expect(store().heldTokenEvents).toHaveLength(0);
  });

  it(`keeps at most ${MAX_HELD_TOKEN_EVENTS} events, the newest`, () => {
    store().expectTokensOf('crypt');
    for (let i = 0; i < MAX_HELD_TOKEN_EVENTS + 500; i += 1) store().onMapTokens('crypt', () => undefined);
    expect(store().heldTokenEvents).toHaveLength(MAX_HELD_TOKEN_EVENTS);
  });
});

describe('a read of another map', () => {
  it('applies its events to nothing until its tokens are in, then in order', () => {
    store().expectTokensOf('crypt');
    store().onMapTokens('crypt', moveTo('lich', 2, 2));
    store().onMapTokens('crypt', moveTo('lich', 3, 3));
    expect(store().tokens.lich).toBeUndefined();
    store().setTokens([token('lich')], 'crypt');
    expect(store().tokens.lich.position).toEqual({ x: 3, y: 3 });
  });
});
