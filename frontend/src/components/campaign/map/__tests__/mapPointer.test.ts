/**
 * The map's one shape for a pointer: what it reads off a pointer event and
 * off the context menu's mouse event, which must agree on a right-click.
 */

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { buttonBit, createClickCounter, fromMouseEvent, fromPointerEvent, pointerKind, DOUBLE_TAP_PX, type MapPointer } from '../mapPointer';

/** A canvas that records what each handler made of its event. */
function canvas(options: { preventDown?: boolean; preventMove?: boolean } = {}) {
  const seen: MapPointer[] = [];
  const { container } = render(createElement('canvas', {
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
      const p = fromPointerEvent(e);
      seen.push(p);
      if (options.preventDown) p.preventDefault();
    },
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
      const p = fromPointerEvent(e);
      seen.push(p);
      if (options.preventMove) p.preventDefault();
    },
    onContextMenu: (e: React.MouseEvent<HTMLCanvasElement>) => { seen.push(fromMouseEvent(e)); },
  }));
  return { el: container.querySelector('canvas')!, seen };
}

const RIGHT_CLICK = { clientX: 120, clientY: 80, button: 2, buttons: 2, shiftKey: true, ctrlKey: false, altKey: true, metaKey: false };
const shared = ({ clientX, clientY, button, shiftKey, ctrlKey, altKey, metaKey }: MapPointer) =>
  ({ clientX, clientY, button, shiftKey, ctrlKey, altKey, metaKey });

describe('fromPointerEvent', () => {
  it('reads the pointer, its buttons and the modifier keys', () => {
    const { el, seen } = canvas();
    fireEvent.pointerDown(el, { pointerId: 3, pointerType: 'pen', isPrimary: true, button: 0, buttons: 1, clientX: 10, clientY: 20, ctrlKey: true });

    expect(seen[0]).toEqual({
      pointerId: 3, kind: 'pen', isPrimary: true, button: 0, buttons: 1, detail: 0,
      clientX: 10, clientY: 20, shiftKey: false, ctrlKey: true, altKey: false, metaKey: false,
      preventDefault: expect.any(Function),
    });
  });

  it('takes a pointer with no type, as jsdom sends, for a mouse', () => {
    expect(pointerKind('')).toBe('mouse');
    expect(pointerKind(undefined)).toBe('mouse');
    expect(pointerKind('touch')).toBe('touch');
    expect(pointerKind('pen')).toBe('pen');
  });

  // Cancelling a pointerdown would stop the mousedown that follows it, which
  // menus over the map listen for to close.
  it('does not cancel a pointer down when asked to, but does cancel a move', () => {
    const down = canvas({ preventDown: true });
    expect(fireEvent.pointerDown(down.el, { pointerType: 'mouse', button: 0, buttons: 1 })).toBe(true);

    const move = canvas({ preventMove: true });
    expect(fireEvent.pointerMove(move.el, { pointerType: 'mouse', buttons: 1 })).toBe(false);
  });
});

describe('fromMouseEvent', () => {
  it('agrees with fromPointerEvent on a right-click', () => {
    const { el, seen } = canvas();
    fireEvent.pointerDown(el, { pointerId: 1, pointerType: 'mouse', isPrimary: true, ...RIGHT_CLICK });
    fireEvent.contextMenu(el, RIGHT_CLICK);

    expect(seen.map((p) => p.kind)).toEqual(['mouse', 'mouse']);
    expect(shared(seen[1]!)).toEqual(shared(seen[0]!));
    expect(seen[1]).toEqual(expect.objectContaining({ pointerId: 1, isPrimary: true }));
  });

  // Chrome sends contextmenu as a pointer event, so a long-press on Android
  // says it came from a finger.
  it('reads the pointer type when the browser sends the menu event as a pointer event', () => {
    const { el, seen } = canvas();
    el.dispatchEvent(new PointerEvent('contextmenu', { bubbles: true, cancelable: true, pointerType: 'touch', clientX: 5, clientY: 6 }));

    expect(seen[0]).toEqual(expect.objectContaining({ kind: 'touch', clientX: 5, clientY: 6 }));
  });
});

describe('the click count', () => {
  it('counts downs of one kind within 500 ms and 4 pixels of the last as one more click', () => {
    const clicks = createClickCounter();
    expect(clicks.count('mouse', 0, 100, 100)).toBe(1);
    expect(clicks.count('mouse', 300, 103, 102)).toBe(2);
    expect(clicks.count('mouse', 790, 103, 102)).toBe(3);
  });

  it('starts again after 500 ms, past 4 pixels, for another kind of pointer, and after another button', () => {
    const clicks = createClickCounter();
    clicks.count('mouse', 0, 100, 100);
    expect(clicks.count('mouse', 501, 100, 100)).toBe(1);
    expect(clicks.count('mouse', 600, 105, 100)).toBe(1);
    expect(clicks.count('touch', 700, 105, 100)).toBe(1);
    clicks.reset();
    expect(clicks.count('touch', 800, 105, 100)).toBe(1);
  });

  // A double tap to ping allows a finger's two taps more room than a
  // mouse's double-click, in the same time.
  it('counts within a distance of its own when given one, in the same 500 ms', () => {
    const taps = createClickCounter(DOUBLE_TAP_PX);
    taps.count('touch', 0, 100, 100);
    expect(taps.count('touch', 200, 112, 116)).toBe(2);
    taps.reset();
    taps.count('touch', 0, 100, 100);
    expect(taps.count('touch', 200, 121, 100)).toBe(1);
    expect(taps.count('touch', 701, 121, 100)).toBe(1);
    expect(DOUBLE_TAP_PX).toBe(20);
  });

  it('keeps 4 pixels without one', () => {
    const clicks = createClickCounter();
    clicks.count('touch', 0, 100, 100);
    expect(clicks.count('touch', 200, 104, 100)).toBe(2);
    expect(clicks.count('touch', 400, 109, 100)).toBe(1);
  });
});

describe('buttonBit', () => {
  it('gives the bit each button holds in buttons', () => {
    expect([0, 1, 2, 3, 4, 5].map(buttonBit)).toEqual([1, 4, 2, 8, 16, 32]);
    expect(buttonBit(-1)).toBe(0);
  });
});
