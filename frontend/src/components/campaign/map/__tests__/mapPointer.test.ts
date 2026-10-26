/**
 * The map's one shape for a pointer: what it reads off a pointer event and
 * off the context menu's mouse event, which must agree on a right-click.
 */

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { fromMouseEvent, fromPointerEvent, pointerKind, type MapPointer } from '../mapPointer';

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
