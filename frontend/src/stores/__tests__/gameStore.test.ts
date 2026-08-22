/**
 * Game store unit tests.
 *
 * Locks in the two contracts the session screen depends on:
 *  1. Targeted actions mutate the normalized token map correctly and
 *     synchronously (socket handlers rely on getState() read-after-write).
 *  2. The movement-ignoring selector really does skip re-renders for
 *     position-only updates — that's what keeps the sidebar static
 *     while tokens are dragged.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useGameStore,
  useTokenList,
  useTokenListIgnoringMovement,
  useCurrentTurnTokenId,
} from '../gameStore';
import type { CombatState, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

function makeCombat(overrides: Partial<CombatState> = {}): CombatState {
  return { active: true, round: 1, currentTokenId: 'a', combatants: [], ...overrides };
}

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

beforeEach(() => {
  useGameStore.getState().clearGameState();
});

describe('gameStore actions', () => {
  it('setTokens normalizes the list and preserves order', () => {
    useGameStore.getState().setTokens([makeToken('b'), makeToken('a')]);
    const s = useGameStore.getState();
    expect(s.tokenOrder).toEqual(['b', 'a']);
    expect(s.tokens['a'].name).toBe('Token a');
  });

  it('applyTokenMove updates only position and keeps other field identities', () => {
    const token = makeToken('a', { conditions: ['stunned'] });
    useGameStore.getState().setTokens([token]);
    useGameStore.getState().applyTokenMove('a', { x: 7, y: 3 });

    const after = useGameStore.getState().tokens['a'];
    expect(after.position).toEqual({ x: 7, y: 3 });
    // Non-positional fields keep reference identity (spread of prev token)
    expect(after.conditions).toBe(token.conditions);
    // Unknown ids are a no-op, not a crash or a phantom token
    useGameStore.getState().applyTokenMove('ghost', { x: 1, y: 1 });
    expect(useGameStore.getState().tokens['ghost']).toBeUndefined();
  });

  it('writes are synchronous — read-after-write in the same tick sees the update', () => {
    useGameStore.getState().setTokens([makeToken('a')]);
    useGameStore.getState().applyTokenMove('a', { x: 5, y: 5 });
    // This is the contract socket handlers rely on (multiple events in one macro-task)
    expect(useGameStore.getState().tokens['a'].position).toEqual({ x: 5, y: 5 });
  });

  it('addToken appends once; re-adding the same id does not duplicate order', () => {
    useGameStore.getState().addToken(makeToken('a'));
    useGameStore.getState().addToken(makeToken('a', { name: 'Renamed' }));
    const s = useGameStore.getState();
    expect(s.tokenOrder).toEqual(['a']);
    expect(s.tokens['a'].name).toBe('Renamed');
  });

  it('revealToken patches position for known tokens but preserves local fields', () => {
    useGameStore.getState().setTokens([makeToken('a', { visible: false })]);
    useGameStore.getState().revealToken(makeToken('a', { visible: true, position: { x: 9, y: 9 } }));
    const known = useGameStore.getState().tokens['a'];
    expect(known.position).toEqual({ x: 9, y: 9 });
    expect(known.visible).toBe(false); // locally-known visibility wins

    useGameStore.getState().revealToken(makeToken('new', { position: { x: 2, y: 2 } }));
    expect(useGameStore.getState().tokenOrder).toEqual(['a', 'new']);
  });

  it('removeToken / patchToken / replaceToken behave and no-op on unknown ids', () => {
    useGameStore.getState().setTokens([makeToken('a'), makeToken('b')]);

    useGameStore.getState().patchToken('a', { visible: false });
    expect(useGameStore.getState().tokens['a'].visible).toBe(false);

    useGameStore.getState().replaceToken(makeToken('b', { name: 'Replaced' }));
    expect(useGameStore.getState().tokens['b'].name).toBe('Replaced');

    useGameStore.getState().removeToken('a');
    expect(useGameStore.getState().tokenOrder).toEqual(['b']);

    // Unknown ids: no-ops
    useGameStore.getState().patchToken('ghost', { visible: false });
    useGameStore.getState().replaceToken(makeToken('ghost'));
    useGameStore.getState().removeToken('ghost');
    expect(useGameStore.getState().tokenOrder).toEqual(['b']);
  });
});

describe('selector hooks', () => {
  it('useTokenList re-renders on token movement (canvas needs live positions)', () => {
    useGameStore.getState().setTokens([makeToken('a')]);
    const counts = { renders: 0 };
    const { result } = renderHook(() => {
      counts.renders += 1;
      return useTokenList();
    });
    const initial = counts.renders;

    act(() => {
      useGameStore.getState().applyTokenMove('a', { x: 4, y: 4 });
    });

    expect(counts.renders).toBeGreaterThan(initial);
    expect(result.current[0].position).toEqual({ x: 4, y: 4 });
  });

  it('useTokenListIgnoringMovement skips position-only updates but sees other changes', () => {
    useGameStore.getState().setTokens([makeToken('a'), makeToken('b')]);
    const counts = { renders: 0 };
    const { result } = renderHook(() => {
      counts.renders += 1;
      return useTokenListIgnoringMovement();
    });
    const initial = counts.renders;

    // Position-only stream (the token.moved hot path) — no re-render
    act(() => {
      useGameStore.getState().applyTokenMove('a', { x: 1, y: 1 });
      useGameStore.getState().applyTokenMove('a', { x: 2, y: 2 });
      useGameStore.getState().applyTokenMove('b', { x: 3, y: 3 });
    });
    expect(counts.renders).toBe(initial);

    // Non-positional change — must re-render, with fresh positions visible
    act(() => {
      useGameStore.getState().patchToken('a', { visible: false });
    });
    expect(counts.renders).toBeGreaterThan(initial);
    expect(result.current.find((t) => t.id === 'a')?.visible).toBe(false);
    expect(result.current.find((t) => t.id === 'b')?.position).toEqual({ x: 3, y: 3 });

    // Add/remove — must re-render
    const before = counts.renders;
    act(() => {
      useGameStore.getState().addToken(makeToken('c'));
    });
    expect(counts.renders).toBeGreaterThan(before);
    expect(result.current).toHaveLength(3);
  });
});

describe('combat state', () => {
  it('starts inactive and clears with the rest of the session', () => {
    expect(useGameStore.getState().combat.active).toBe(false);
    expect(useGameStore.getState().combat.currentTokenId).toBeNull();

    useGameStore.getState().setCombatState(makeCombat());
    expect(useGameStore.getState().combat.currentTokenId).toBe('a');

    useGameStore.getState().clearGameState();
    expect(useGameStore.getState().combat.active).toBe(false);
    expect(useGameStore.getState().combat.currentTokenId).toBeNull();
  });

  it('useCurrentTurnTokenId reports null while combat is inactive', () => {
    // The server keeps currentTokenId populated after `initiative.end` in some
    // paths; the map must key off `active`, not the raw id, or a ring lingers
    // on the map after combat is over.
    const { result } = renderHook(() => useCurrentTurnTokenId());
    expect(result.current).toBeNull();

    act(() => {
      useGameStore.getState().setCombatState(makeCombat({ active: false, currentTokenId: 'a' }));
    });
    expect(result.current).toBeNull();

    act(() => {
      useGameStore.getState().setCombatState(makeCombat({ active: true, currentTokenId: 'a' }));
    });
    expect(result.current).toBe('a');
  });

  it('does not re-render turn subscribers when only a combatant HP ticks', () => {
    let renders = 0;
    const combatants = [
      { tokenId: 'a', name: 'A', imageUrl: '', initiative: 10, hp: { current: 9, max: 10, temp: 0 }, type: 'npc' as const, disposition: null },
    ];
    useGameStore.getState().setCombatState(makeCombat({ combatants }));

    const { result } = renderHook(() => {
      renders++;
      return useCurrentTurnTokenId();
    });
    const initial = renders;

    act(() => {
      useGameStore.getState().setCombatState(makeCombat({
        combatants: [{ ...combatants[0], hp: { current: 4, max: 10, temp: 0 } }],
      }));
    });
    expect(renders).toBe(initial);
    expect(result.current).toBe('a');

    act(() => {
      useGameStore.getState().setCombatState(makeCombat({ currentTokenId: 'b', combatants }));
    });
    expect(renders).toBeGreaterThan(initial);
    expect(result.current).toBe('b');
  });
});

describe('cross-highlight peek', () => {
  it('records which side is pointing', () => {
    useGameStore.getState().setPeekToken('a', 'tracker');
    expect(useGameStore.getState().peekTokenId).toBe('a');
    expect(useGameStore.getState().peekSource).toBe('tracker');

    useGameStore.getState().setPeekToken(null, 'tracker');
    expect(useGameStore.getState().peekTokenId).toBeNull();
    expect(useGameStore.getState().peekSource).toBeNull();
  });

  it('ignores a clear from the side that is not currently pointing', () => {
    // The map's mouse-leave can fire after the pointer has reached the
    // tracker; without this guard it would cancel the tracker's highlight.
    useGameStore.getState().setPeekToken('a', 'tracker');
    useGameStore.getState().setPeekToken(null, 'map');
    expect(useGameStore.getState().peekTokenId).toBe('a');
    expect(useGameStore.getState().peekSource).toBe('tracker');
  });

  it('clears with the rest of the session', () => {
    useGameStore.getState().setPeekToken('a', 'map');
    useGameStore.getState().clearGameState();
    expect(useGameStore.getState().peekTokenId).toBeNull();
    expect(useGameStore.getState().peekSource).toBeNull();
  });
});
