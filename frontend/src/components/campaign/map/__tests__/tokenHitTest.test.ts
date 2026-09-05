/**
 * Which token a click acts on, and which tokens block a square.
 *
 * Reported from a live game: a player who moved onto an NPC's square lost both
 * sight of their token and the ability to move it again. The hit test returned
 * the topmost token, the caller's permission check refused it, and the click
 * did nothing — the player's own token was underneath the whole time.
 */

import { describe, it, expect } from 'vitest';
import {
  tokenCoversCell,
  effectiveTokenHp,
  isTokenDowned,
  pickTokenAt,
  pickMovableTokenAt,
  blockingTokensAt,
  isTokenVisibleTo,
  visibleTokenHp,
  type TokenVisibility,
} from '../tokenHitTest';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

function makeToken(id: string, overrides: Partial<Token> = {}): Token {
  return {
    id,
    characterId: null,
    name: `Token ${id}`,
    imageUrl: '',
    position: { x: 0, y: 0 },
    size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN,
    visible: true,
    controlledBy: null,
    rotation: 0,
    conditions: [],
    metadata: {},
    type: TokenType.NPC,
    disposition: null,
    hp: null,
    showHpBar: false,
    ...overrides,
  } as Token;
}

const alive = { current: 7, max: 7, temp: 0 };
const downed = { current: 0, max: 7, temp: 0 };

describe('tokenCoversCell', () => {
  it('covers its own cell', () => {
    expect(tokenCoversCell(makeToken('a', { position: { x: 3, y: 4 } }), 3, 4)).toBe(true);
  });

  it('covers every cell of a larger footprint', () => {
    const ogre = makeToken('o', { position: { x: 2, y: 2 }, size: { width: 2, height: 2 } });
    for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]]) {
      expect(tokenCoversCell(ogre, x, y)).toBe(true);
    }
    // The footprint is exclusive at the far edge.
    expect(tokenCoversCell(ogre, 4, 2)).toBe(false);
    expect(tokenCoversCell(ogre, 2, 4)).toBe(false);
  });
});

describe('effectiveTokenHp', () => {
  it('follows the character sheet for a bound token', () => {
    const token = makeToken('a', { characterId: 'char-1', hp: { current: 1, max: 7, temp: 0 } });
    expect(effectiveTokenHp(token, { 'char-1': alive })).toEqual(alive);
  });

  it("falls back to the token's own copy when the sheet is not cached yet", () => {
    const token = makeToken('a', { characterId: 'char-1', hp: downed });
    expect(effectiveTokenHp(token, {})).toEqual(downed);
  });

  it('uses the token itself when it is bound to no character', () => {
    expect(effectiveTokenHp(makeToken('a', { hp: alive }), {})).toEqual(alive);
  });

  it('is null when nothing tracks hit points', () => {
    expect(effectiveTokenHp(makeToken('a'), {})).toBeNull();
  });
});

describe('isTokenDowned', () => {
  it('is true at zero hit points', () => {
    expect(isTokenDowned(makeToken('a', { hp: downed }), {})).toBe(true);
  });

  it('is false while hit points remain', () => {
    expect(isTokenDowned(makeToken('a', { hp: alive }), {})).toBe(false);
  });

  // Scenery and objects have no hit points; counting them as bodies would let
  // anyone stand on a closed door.
  it('is false for a token that tracks no hit points', () => {
    expect(isTokenDowned(makeToken('door'), {})).toBe(false);
  });

  it('follows the character sheet over the stale copy on the token', () => {
    const token = makeToken('a', { characterId: 'char-1', hp: alive });
    expect(isTokenDowned(token, { 'char-1': downed })).toBe(true);
  });
});

describe('isTokenVisibleTo', () => {
  // A 4x4 map. Fog rows are top-left origin, token grid Y is bottom-left, so
  // grid (0,0) is the bottom-left cell and fog index 12 in a 4-wide raster.
  const view = (over: Partial<TokenVisibility> = {}): TokenVisibility => ({
    isDM: false,
    revealedCells: null,
    isOwnToken: () => false,
    dmShowSpiritTokens: true,
    mapWidth: 4,
    mapHeight: 4,
    ...over,
  });

  it('shows everything before fog data has arrived', () => {
    expect(isTokenVisibleTo(makeToken('a'), view({ revealedCells: null }))).toBe(true);
  });

  it('hides a token standing in an unrevealed cell', () => {
    const token = makeToken('lurker', { position: { x: 0, y: 0 } });
    expect(isTokenVisibleTo(token, view({ revealedCells: new Set() }))).toBe(false);
  });

  it('shows a token standing in a revealed cell', () => {
    const token = makeToken('seen', { position: { x: 0, y: 0 } });
    expect(isTokenVisibleTo(token, view({ revealedCells: new Set([12]) }))).toBe(true);
  });

  // You always know where you are.
  it('shows your own token even in the dark', () => {
    const mine = makeToken('mine', { position: { x: 0, y: 0 } });
    expect(
      isTokenVisibleTo(mine, view({ revealedCells: new Set(), isOwnToken: (t) => t.id === 'mine' }))
    ).toBe(true);
  });

  it('hides a DM-hidden token from a player', () => {
    expect(isTokenVisibleTo(makeToken('a', { visible: false }), view())).toBe(false);
  });

  it('shows a DM-hidden token to the DM', () => {
    expect(isTokenVisibleTo(makeToken('a', { visible: false }), view({ isDM: true }))).toBe(true);
  });

  it('ignores fog entirely for the DM', () => {
    const token = makeToken('a', { position: { x: 0, y: 0 } });
    expect(isTokenVisibleTo(token, view({ isDM: true, revealedCells: new Set() }))).toBe(true);
  });

  it('respects the DM hiding spirit tokens from their own canvas', () => {
    const spirit = makeToken('s', { layer: TokenLayer.SPIRIT });
    expect(isTokenVisibleTo(spirit, view({ isDM: true, dmShowSpiritTokens: false }))).toBe(false);
    expect(isTokenVisibleTo(spirit, view({ isDM: true, dmShowSpiritTokens: true }))).toBe(true);
  });
});

describe('visibleTokenHp', () => {
  const alivePlayer = { current: 5, max: 10, temp: 0 };

  it('shows a player token from the character sheet, to anyone', () => {
    const token = makeToken('p', { characterId: 'char-1' });
    expect(visibleTokenHp(token, { 'char-1': alivePlayer }, false)).toEqual(alivePlayer);
  });

  // An NPC's hit points are the DM's to reveal.
  it('hides an NPC token from a player unless the bar is on', () => {
    const npc = makeToken('n', { hp: { current: 4, max: 7, temp: 0 }, showHpBar: false });
    expect(visibleTokenHp(npc, {}, false)).toBeNull();
  });

  it('shows an NPC token to a player once the DM turns the bar on', () => {
    const npc = makeToken('n', { hp: { current: 4, max: 7, temp: 0 }, showHpBar: true });
    expect(visibleTokenHp(npc, {}, false)).toEqual({ current: 4, max: 7, temp: 0 });
  });

  it('shows an NPC token to the DM regardless', () => {
    const npc = makeToken('n', { hp: { current: 4, max: 7, temp: 0 }, showHpBar: false });
    expect(visibleTokenHp(npc, {}, true)).toEqual({ current: 4, max: 7, temp: 0 });
  });

  it('is null when nothing tracks hit points', () => {
    expect(visibleTokenHp(makeToken('o'), {}, true)).toBeNull();
  });

  /**
   * The cache is not always warm.
   *
   * A token bound to a character that is not in the cache — the window before
   * the roster fetch returns, or a character no member holds — must still
   * respect the DM's choice. It briefly did not: the bound branch returned the
   * token's own hit points outright, so a hidden NPC's HP appeared for every
   * player until the roster arrived.
   */
  describe('when the character sheet is not cached', () => {
    const bound = (over: Partial<Token> = {}) =>
      makeToken('b', { characterId: 'char-missing', ...over });

    it('does not reveal a hidden NPC\'s hit points to a player', () => {
      const token = bound({ hp: { current: 3, max: 9, temp: 0 }, showHpBar: false });
      expect(visibleTokenHp(token, {}, false)).toBeNull();
    });

    it('shows them once the DM turns the bar on', () => {
      const token = bound({ hp: { current: 3, max: 9, temp: 0 }, showHpBar: true });
      expect(visibleTokenHp(token, {}, false)).toEqual({ current: 3, max: 9, temp: 0 });
    });

    it('shows them to the DM', () => {
      const token = bound({ hp: { current: 3, max: 9, temp: 0 }, showHpBar: false });
      expect(visibleTokenHp(token, {}, true)).toEqual({ current: 3, max: 9, temp: 0 });
    });

    // A zero maximum would divide by zero when drawing the bar.
    it('ignores a zero maximum rather than drawing a NaN bar', () => {
      const token = bound({ hp: { current: 0, max: 0, temp: 0 }, showHpBar: true });
      expect(visibleTokenHp(token, {}, true)).toBeNull();
    });
  });
});

describe('pickTokenAt', () => {
  it('returns the topmost token drawn on the cell', () => {
    const under = makeToken('under', { position: { x: 1, y: 1 } });
    const over = makeToken('over', { position: { x: 1, y: 1 } });
    expect(pickTokenAt([under, over], 1, 1)?.id).toBe('over');
  });

  it('ignores hidden tokens', () => {
    const hidden = makeToken('hidden', { position: { x: 1, y: 1 }, visible: false });
    const shown = makeToken('shown', { position: { x: 1, y: 1 } });
    expect(pickTokenAt([shown, hidden], 1, 1)?.id).toBe('shown');
  });

  it('returns null on an empty cell', () => {
    expect(pickTokenAt([makeToken('a')], 5, 5)).toBeNull();
  });
});

describe('pickMovableTokenAt', () => {
  // The reported bug, in one test.
  it('reaches the player token underneath an NPC', () => {
    const mine = makeToken('mine', { position: { x: 4, y: 4 }, characterId: 'char-1' });
    const npc = makeToken('npc', { position: { x: 4, y: 4 } });
    const canMove = (t: Token) => t.id === 'mine';

    expect(pickTokenAt([mine, npc], 4, 4)?.id).toBe('npc');
    expect(pickMovableTokenAt([mine, npc], 4, 4, canMove)?.id).toBe('mine');
  });

  it('still prefers the topmost when several are movable', () => {
    const lower = makeToken('lower', { position: { x: 0, y: 0 } });
    const upper = makeToken('upper', { position: { x: 0, y: 0 } });
    expect(pickMovableTokenAt([lower, upper], 0, 0, () => true)?.id).toBe('upper');
  });

  it('returns null when nothing on the cell can be moved', () => {
    const npc = makeToken('npc', { position: { x: 2, y: 2 } });
    expect(pickMovableTokenAt([npc], 2, 2, () => false)).toBeNull();
  });

  it('does not reach a hidden token even when it could be moved', () => {
    const hidden = makeToken('hidden', { position: { x: 1, y: 1 }, visible: false });
    expect(pickMovableTokenAt([hidden], 1, 1, () => true)).toBeNull();
  });
});

describe('blockingTokensAt', () => {
  const mover = makeToken('mover', { position: { x: 0, y: 0 } });

  it('reports a living token standing on the target square', () => {
    const guard = makeToken('guard', { position: { x: 3, y: 3 }, hp: alive });
    expect(blockingTokensAt([mover, guard], mover, { x: 3, y: 3 }, {}).map((t) => t.id)).toEqual([
      'guard',
    ]);
  });

  it('lets a body be stood on', () => {
    const corpse = makeToken('corpse', { position: { x: 3, y: 3 }, hp: downed });
    expect(blockingTokensAt([mover, corpse], mover, { x: 3, y: 3 }, {})).toEqual([]);
  });

  it('treats a token with no hit points as solid', () => {
    const crate = makeToken('crate', { position: { x: 3, y: 3 } });
    expect(blockingTokensAt([mover, crate], mover, { x: 3, y: 3 }, {}).map((t) => t.id)).toEqual([
      'crate',
    ]);
  });

  it('never blocks on the moving token itself', () => {
    expect(blockingTokensAt([mover], mover, { x: 0, y: 0 }, {})).toEqual([]);
  });

  it('ignores tokens on the other layer', () => {
    const spirit = makeToken('spirit', {
      position: { x: 3, y: 3 },
      hp: alive,
      layer: TokenLayer.SPIRIT,
    });
    expect(blockingTokensAt([mover, spirit], mover, { x: 3, y: 3 }, {})).toEqual([]);
  });

  // A player is never sent hidden tokens, so this can only ever run on tokens
  // the mover can already see. Blocking on one would also leak its position.
  it('ignores hidden tokens', () => {
    const lurker = makeToken('lurker', { position: { x: 3, y: 3 }, hp: alive, visible: false });
    expect(blockingTokensAt([mover, lurker], mover, { x: 3, y: 3 }, {})).toEqual([]);
  });

  it('blocks on any overlap, not just the anchor cell', () => {
    const ogre = makeToken('ogre', {
      position: { x: 0, y: 0 },
      size: { width: 2, height: 2 },
      hp: alive,
    });
    // A 1x1 mover targeting the ogre's far corner still collides.
    expect(blockingTokensAt([mover, ogre], mover, { x: 1, y: 1 }, {}).map((t) => t.id)).toEqual([
      'ogre',
    ]);
  });

  it('lets a large mover be caught by anything under its footprint', () => {
    const big = makeToken('big', { position: { x: 8, y: 8 }, size: { width: 2, height: 2 } });
    const guard = makeToken('guard', { position: { x: 4, y: 3 }, hp: alive });
    expect(blockingTokensAt([big, guard], big, { x: 3, y: 3 }, {}).map((t) => t.id)).toEqual([
      'guard',
    ]);
  });

  it('reports an empty target square as free', () => {
    const guard = makeToken('guard', { position: { x: 9, y: 9 }, hp: alive });
    expect(blockingTokensAt([mover, guard], mover, { x: 3, y: 3 }, {})).toEqual([]);
  });

  it('follows the character sheet when deciding a bound token is down', () => {
    const ally = makeToken('ally', { position: { x: 3, y: 3 }, characterId: 'char-2', hp: alive });
    expect(blockingTokensAt([mover, ally], mover, { x: 3, y: 3 }, { 'char-2': downed })).toEqual([]);
  });
});
