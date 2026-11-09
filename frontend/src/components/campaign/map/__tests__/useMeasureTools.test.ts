/**
 * The ruler by touch. A mouse's ruler ends wherever the pointer is, so it
 * needs no end of its own; a finger has no hover, so its ruler drew nothing
 * once the finger lifted, and a player, whose ruler starts at their token,
 * could not measure by touch at all, since a finger's drag moved the map.
 * A finger or a pen now pins the ruler's end: for the DM the first tap sets
 * the start, the second the end and the third starts again, and a drag
 * measures from where it lands to where it lifts; for a player a tap or a
 * drag pins the end. A mouse's ruler is as it was.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMeasureTools } from '../tools/useMeasureTools';
import type { PointerAt } from '../tools/types';
import type { MapPointer, PointerKind } from '../mapPointer';

type Square = { x: number; y: number };

function pointer(kind: PointerKind): MapPointer {
  return {
    pointerId: 1, kind, isPrimary: true, button: 0, buttons: 1, detail: 1, clientX: 0, clientY: 0,
    shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, preventDefault: () => undefined,
  };
}

/** A press or a lift on a square, by a mouse, a finger's tap or drag, or a pen. */
function on(square: Square, how: 'mouse' | 'tap' | 'drag' | 'pen'): PointerAt {
  const kind: PointerKind = how === 'tap' || how === 'drag' ? 'touch' : how;
  return {
    e: pointer(kind),
    via: how === 'tap' || how === 'drag' ? how : 'mouse',
    screenX: square.x * 50 + 25,
    screenY: (19 - square.y) * 50 + 25,
    mapPx: { x: square.x * 50 + 25, y: (19 - square.y) * 50 + 25 },
    gridCoords: square,
  };
}

function setup(who: 'DM' | 'PLAYER', options: { hasToken?: boolean; movableAt?: Square; holding?: { now: boolean } } = {}) {
  const view = renderHook(() => useMeasureTools({
    isDM: who === 'DM',
    markDirty: vi.fn(),
    measuresFromToken: () => options.hasToken ?? true,
    picksUpAt: (s) => options.movableAt !== undefined && s.x === options.movableAt.x && s.y === options.movableAt.y,
    holdsToken: () => options.holding?.now ?? false,
  }));
  act(() => { view.result.current.handleToggleRuler(); });
  const tools = () => view.result.current;
  /** A press and its lift at one square, as a tap or a click. */
  const press = (square: Square, how: 'mouse' | 'tap' | 'pen') => {
    let took = false;
    act(() => { took = tools().tool.down?.(on(square, how)) ?? false; });
    act(() => { tools().tool.up?.(on(square, how)); });
    return took;
  };
  /** A press on one square that lifts on another. */
  const drag = (from: Square, to: Square, how: 'drag' | 'pen' = 'drag') => {
    let took = false;
    act(() => { took = tools().tool.down?.(on(from, how)) ?? false; });
    act(() => { tools().track(on(to, how)); });
    act(() => { tools().tool.up?.(on(to, how)); });
    return took;
  };
  return { tools, press, drag };
}

const ends = (t: { rulerOrigin: Square | null; rulerEnd: Square | null }) => ({ origin: t.rulerOrigin, end: t.rulerEnd });

describe("the DM's ruler by touch", () => {
  it('starts at the first tap, ends at the second, and starts again at the third', () => {
    const { tools, press } = setup('DM');

    press({ x: 1, y: 1 }, 'tap');
    expect(ends(tools())).toEqual({ origin: { x: 1, y: 1 }, end: null });
    press({ x: 4, y: 1 }, 'tap');
    expect(ends(tools())).toEqual({ origin: { x: 1, y: 1 }, end: { x: 4, y: 1 } });
    press({ x: 6, y: 2 }, 'tap');
    expect(ends(tools())).toEqual({ origin: { x: 6, y: 2 }, end: null });
  });

  it('measures a drag from where it lands to where it lifts, and keeps it there', () => {
    const { tools, press, drag } = setup('DM');
    press({ x: 1, y: 1 }, 'tap');

    expect(drag({ x: 2, y: 2 }, { x: 5, y: 2 })).toBe(true);

    expect(ends(tools())).toEqual({ origin: { x: 2, y: 2 }, end: { x: 5, y: 2 } });
  });

  it('takes a pen\'s taps as a finger\'s, and a pen\'s press that lifts on another square as a drag\'s end', () => {
    const { tools, press, drag } = setup('DM');

    press({ x: 1, y: 1 }, 'pen');
    press({ x: 3, y: 1 }, 'pen');
    expect(ends(tools())).toEqual({ origin: { x: 1, y: 1 }, end: { x: 3, y: 1 } });

    drag({ x: 2, y: 4 }, { x: 2, y: 8 }, 'pen');
    expect(ends(tools())).toEqual({ origin: { x: 2, y: 4 }, end: { x: 2, y: 8 } });
  });
});

describe("the DM's ruler with a mouse", () => {
  it('starts at every click and never pins an end, which follows the pointer', () => {
    const { tools, press } = setup('DM');

    press({ x: 1, y: 1 }, 'mouse');
    press({ x: 4, y: 1 }, 'mouse');
    press({ x: 6, y: 2 }, 'mouse');

    expect(ends(tools())).toEqual({ origin: { x: 6, y: 2 }, end: null });
  });

  it("lets go of a finger's end once the mouse moves over the map", () => {
    const { tools, press } = setup('DM');
    press({ x: 1, y: 1 }, 'tap');
    press({ x: 4, y: 1 }, 'tap');

    act(() => { tools().track(on({ x: 7, y: 7 }, 'mouse')); });

    expect(tools().rulerEnd).toBeNull();
  });
});

describe("a player's ruler, which starts at their token", () => {
  it('ends where a finger taps, and again at the next tap', () => {
    const { tools, press } = setup('PLAYER');

    expect(press({ x: 3, y: 3 }, 'tap')).toBe(true);
    expect(tools().rulerEnd).toEqual({ x: 3, y: 3 });
    press({ x: 5, y: 1 }, 'tap');
    expect(tools().rulerEnd).toEqual({ x: 5, y: 1 });
    expect(tools().rulerOrigin).toBeNull();
  });

  it('measures by a one-finger drag, which it takes from the map, and ends where the finger lifts', () => {
    const { tools, drag } = setup('PLAYER');

    expect(drag({ x: 2, y: 2 }, { x: 6, y: 2 })).toBe(true);

    expect(tools().rulerEnd).toEqual({ x: 6, y: 2 });
  });

  it('leaves a tap on a token they may move to the token, which picks it up', () => {
    const { tools, press } = setup('PLAYER', { movableAt: { x: 0, y: 0 } });

    expect(press({ x: 0, y: 0 }, 'tap')).toBe(false);
    expect(tools().rulerEnd).toBeNull();
  });

  it('takes nothing from a player with no token, whose ruler has no start', () => {
    const { tools, press } = setup('PLAYER', { hasToken: false });

    expect(press({ x: 3, y: 3 }, 'tap')).toBe(false);
    expect(tools().rulerEnd).toBeNull();
  });

  it('takes no click from a mouse, as before', () => {
    const { press } = setup('PLAYER');

    expect(press({ x: 3, y: 3 }, 'mouse')).toBe(false);
  });
});

describe('putting the ruler away', () => {
  it('forgets its start and its end', () => {
    const { tools, press } = setup('DM');
    press({ x: 1, y: 1 }, 'tap');
    press({ x: 4, y: 1 }, 'tap');

    act(() => { tools().handleToggleRuler(); });
    act(() => { tools().handleToggleRuler(); });

    expect(ends(tools())).toEqual({ origin: null, end: null });
  });
});

describe('a token held by a tap', () => {
  it.each([['the DM', 'DM'], ['a player', 'PLAYER']] as const)('takes the tap that puts it down ahead of the ruler, for %s, and then the ruler takes taps again', (_who, who) => {
    const holding = { now: true };
    const { tools, press } = setup(who, { holding });

    expect(press({ x: 3, y: 3 }, 'tap')).toBe(false);
    expect(press({ x: 3, y: 3 }, 'mouse')).toBe(false);
    expect(ends(tools())).toEqual({ origin: null, end: null });

    holding.now = false;
    expect(press({ x: 3, y: 3 }, 'tap')).toBe(true);
  });
});

describe("the DM's start before its end", () => {
  it("is shown after a finger's or a pen's first tap, until the end is set", () => {
    const { tools, press } = setup('DM');

    press({ x: 1, y: 1 }, 'tap');
    expect(tools().rulerStartByTouch).toBe(true);
    press({ x: 4, y: 1 }, 'tap');
    expect(tools().rulerStartByTouch).toBe(false);
    press({ x: 6, y: 1 }, 'pen');
    expect(tools().rulerStartByTouch).toBe(true);
  });

  it("is not for a mouse's click, whose end is the pointer", () => {
    const { tools, press } = setup('DM');

    press({ x: 1, y: 1 }, 'tap');
    press({ x: 2, y: 1 }, 'mouse');

    expect(tools().rulerStartByTouch).toBe(false);
  });
});
