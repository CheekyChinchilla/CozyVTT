/**
 * The tokens the keyboard steps through, and the square an arrow key moves a
 * token to. Grid y counts up from the bottom row (map/coords.ts), so the top
 * row of a 10-square map is y 9.
 */

import { describe, it, expect } from 'vitest';
import {
  selectableTokens,
  nextSelectedId,
  squareFromArrow,
  isArrowKey,
  panToKeepInView,
  settleArrowEcho,
  type ArrowKey,
} from '../selection';
import type { CombatState, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

function token(id: string, x: number, y: number, extra: Partial<Token> = {}): Token {
  return {
    id, name: id, characterId: null, imageUrl: '', position: { x, y }, size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
    type: TokenType.NPC, ...extra,
  } as Token;
}

const everyone = () => true;
const ids = (list: readonly Token[]) => list.map((t) => t.id);

function combat(order: string[], active = true): CombatState {
  return {
    active,
    round: 1,
    currentTokenId: order[0] ?? null,
    combatants: order.map((tokenId) => ({
      tokenId, mapId: 'map-a', name: tokenId, imageUrl: '', initiative: 10, hp: null, type: 'npc', disposition: null,
    })),
  };
}

describe('the tokens a viewer may step through', () => {
  it('go by row from the top of the map, then by column from the left', () => {
    const tokens = [token('low-left', 0, 0), token('top-right', 8, 9), token('top-left', 2, 9), token('middle', 5, 4)];

    expect(ids(selectableTokens(tokens, everyone, null))).toEqual(['top-left', 'top-right', 'middle', 'low-left']);
  });

  it('count a large token by its top row', () => {
    // A 2 by 2 token at y 3 covers rows 3 and 4, so its top is row 4, above a
    // one-square token on row 3 to its left.
    const tokens = [token('small', 0, 3), token('large', 5, 3, { size: { width: 2, height: 2 } })];

    expect(ids(selectableTokens(tokens, everyone, null))).toEqual(['large', 'small']);
  });

  it('hold only the tokens the viewer may act on', () => {
    const mine = token('mine', 4, 4, { controlledBy: 'me' });
    const theirs = token('theirs', 1, 9, { controlledBy: 'someone-else' });
    const goblin = token('goblin', 0, 9);

    expect(ids(selectableTokens([goblin, theirs, mine], (t) => t.controlledBy === 'me', null))).toEqual(['mine']);
  });

  it('follow the turn order during a fight, then the rest by row and column', () => {
    const tokens = [token('a', 0, 9), token('b', 1, 9), token('c', 2, 9), token('d', 3, 9)];

    expect(ids(selectableTokens(tokens, everyone, combat(['c', 'a'])))).toEqual(['c', 'a', 'b', 'd']);
  });

  it('leave out a combatant on another map, or one the viewer may not act on', () => {
    const tokens = [token('a', 0, 9), token('b', 1, 9)];

    // 'elsewhere' is in the fight but not among this map's tokens.
    expect(ids(selectableTokens(tokens, (t) => t.id !== 'a', combat(['elsewhere', 'a', 'b'])))).toEqual(['b']);
  });

  it('ignore the turn order once the fight is over', () => {
    const tokens = [token('a', 0, 9), token('b', 1, 9)];

    expect(ids(selectableTokens(tokens, everyone, combat(['b', 'a'], false)))).toEqual(['a', 'b']);
  });

  it('keep two tokens on one square in the order they arrived', () => {
    const tokens = [token('under', 3, 3), token('over', 3, 3)];

    expect(ids(selectableTokens(tokens, everyone, null))).toEqual(['under', 'over']);
  });
});

describe('the next token selected', () => {
  const list = [token('a', 0, 9), token('b', 1, 9), token('c', 2, 9)];

  it('is the next one along, or the one before', () => {
    expect(nextSelectedId(list, 'a', 1)).toBe('b');
    expect(nextSelectedId(list, 'b', -1)).toBe('a');
  });

  it('wraps round at either end', () => {
    expect(nextSelectedId(list, 'c', 1)).toBe('a');
    expect(nextSelectedId(list, 'a', -1)).toBe('c');
  });

  it('starts at the first going forward, or the last going back, when nothing on the list is selected', () => {
    expect(nextSelectedId(list, null, 1)).toBe('a');
    expect(nextSelectedId(list, null, -1)).toBe('c');
    expect(nextSelectedId(list, 'gone', 1)).toBe('a');
  });

  it('is nothing when there is nothing to select', () => {
    expect(nextSelectedId([], null, 1)).toBeNull();
    expect(nextSelectedId([], 'a', -1)).toBeNull();
  });
});

describe('the square an arrow key moves a token to', () => {
  const map = { width: 10, height: 10 };
  const one = { width: 1, height: 1 };
  const large = { width: 2, height: 2 };

  it('is one square up, down, left or right, with up counting towards the top row', () => {
    const from = { x: 4, y: 4 };
    expect(squareFromArrow(from, one, 'ArrowUp', 1, map)).toEqual({ x: 4, y: 5 });
    expect(squareFromArrow(from, one, 'ArrowDown', 1, map)).toEqual({ x: 4, y: 3 });
    expect(squareFromArrow(from, one, 'ArrowLeft', 1, map)).toEqual({ x: 3, y: 4 });
    expect(squareFromArrow(from, one, 'ArrowRight', 1, map)).toEqual({ x: 5, y: 4 });
  });

  it('goes several squares at once', () => {
    expect(squareFromArrow({ x: 4, y: 4 }, one, 'ArrowRight', 5, map)).toEqual({ x: 9, y: 4 });
  });

  it.each<[ArrowKey, { x: number; y: number }, { x: number; y: number }]>([
    ['ArrowUp', { x: 3, y: 8 }, { x: 3, y: 8 }],
    ['ArrowDown', { x: 3, y: 0 }, { x: 3, y: 0 }],
    ['ArrowLeft', { x: 0, y: 3 }, { x: 0, y: 3 }],
    ['ArrowRight', { x: 8, y: 3 }, { x: 8, y: 3 }],
  ])('keeps a 2 by 2 token whole on the map at the edge, for %s', (key, from, to) => {
    expect(squareFromArrow(from, large, key, 1, map)).toEqual(to);
  });

  it.each<[ArrowKey, { x: number; y: number }]>([
    ['ArrowUp', { x: 3, y: 8 }],
    ['ArrowDown', { x: 3, y: 0 }],
    ['ArrowLeft', { x: 0, y: 3 }],
    ['ArrowRight', { x: 8, y: 3 }],
  ])('stops a five-square move of a 2 by 2 token at the edge, for %s', (key, to) => {
    expect(squareFromArrow({ x: 3, y: 3 }, large, key, 5, map)).toEqual(to);
  });

  it('puts a token already over the edge back on the map', () => {
    expect(squareFromArrow({ x: 9, y: 9 }, large, 'ArrowLeft', 1, map)).toEqual({ x: 8, y: 8 });
  });
});

describe('which keys are arrow keys', () => {
  it('knows the four arrows by name', () => {
    expect(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].every(isArrowKey)).toBe(true);
    expect(isArrowKey('Up')).toBe(false);
    expect(isArrowKey('w')).toBe(false);
  });
});

describe('the pan that keeps a point in sight', () => {
  const canvas = { width: 800, height: 600 };

  it('is none while the point is well inside the view', () => {
    expect(panToKeepInView({ x: 400, y: 300 }, canvas, 50)).toEqual({ dx: 0, dy: 0 });
  });

  it('brings a point past an edge back to the margin, and no further', () => {
    expect(panToKeepInView({ x: 900, y: 300 }, canvas, 50)).toEqual({ dx: -150, dy: 0 });
    expect(panToKeepInView({ x: -40, y: 620 }, canvas, 50)).toEqual({ dx: 90, dy: -70 });
  });

  it('centres a point in a view too small for the margin', () => {
    expect(panToKeepInView({ x: 100, y: 10 }, { width: 60, height: 60 }, 50)).toEqual({ dx: -70, dy: 20 });
  });

  it('is none for a view with no size yet', () => {
    expect(panToKeepInView({ x: 900, y: 900 }, { width: 0, height: 0 }, 50)).toEqual({ dx: 0, dy: 0 });
  });
});

describe("what the page does with the server's word on a token it moved by arrow", () => {
  const sent = [{ x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 }];

  it('does not draw its own echo of an earlier square, and stops waiting for it', () => {
    expect(settleArrowEcho(sent, { x: 1, y: 4, movedBy: 'me' }, 'me')).toEqual({ draw: false, sent: sent.slice(1) });
    expect(settleArrowEcho(sent, { x: 2, y: 4, movedBy: 'me' }, 'me')).toEqual({ draw: false, sent: sent.slice(2) });
  });

  it('draws its own echo of the last square sent, which ends the run', () => {
    expect(settleArrowEcho(sent, { x: 3, y: 4, movedBy: 'me' }, 'me')).toEqual({ draw: true, sent: [] });
  });

  it('does not draw an echo of its own from before the run', () => {
    expect(settleArrowEcho([{ x: 8, y: 4 }], { x: 1, y: 10, movedBy: 'me' }, 'me')).toEqual({ draw: false, sent: [{ x: 8, y: 4 }] });
  });

  it("draws a put-back or someone else's move, and ends the run", () => {
    expect(settleArrowEcho(sent, { x: 0, y: 4, movedBy: null }, 'me')).toEqual({ draw: true, sent: [] });
    expect(settleArrowEcho(sent, { x: 7, y: 7, movedBy: 'dm-user' }, 'me')).toEqual({ draw: true, sent: [] });
  });

  it('draws everything while nothing is waiting', () => {
    expect(settleArrowEcho([], { x: 1, y: 4, movedBy: 'me' }, 'me')).toEqual({ draw: true, sent: [] });
  });
});
