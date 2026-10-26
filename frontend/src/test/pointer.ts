import { fireEvent } from '@testing-library/react';

/**
 * Pointer events as a browser sends them, for the map's tests.
 *
 * A pointer event's own `detail` is 0, so none is passed: a page counts
 * clicks itself. A move's `button` is -1. A second button pressed or let go
 * while another is held fires no pointerdown or pointerup: it arrives as a
 * move whose `button` is the one that changed (`chord`). A finger or a pen in
 * contact holds `buttons` 1.
 */

type At = { clientX: number; clientY: number };
type Extra = Record<string, unknown>;

/** The bit each button holds in `buttons`. */
const BIT: Record<number, number> = { 0: 1, 1: 4, 2: 2 };

const MOUSE = { pointerType: 'mouse', pointerId: 1, isPrimary: true };

export const mouse = {
  down: (el: Element, at: At, button = 0, extra: Extra = {}) =>
    fireEvent.pointerDown(el, { ...MOUSE, ...at, button, buttons: BIT[button] ?? 0, ...extra }),
  move: (el: Element, at: At, buttons = 0, extra: Extra = {}) =>
    fireEvent.pointerMove(el, { ...MOUSE, ...at, button: -1, buttons, ...extra }),
  /** The last button let go: `buttons` is what is still held, so 0. */
  up: (el: Element, at: At, button = 0) =>
    fireEvent.pointerUp(el, { ...MOUSE, ...at, button, buttons: 0 }),
  /** Another button pressed or let go while one is held; `buttons` is what is held after. */
  chord: (el: Element, at: At, button: number, buttons: number) =>
    fireEvent.pointerMove(el, { ...MOUSE, ...at, button, buttons }),
  leave: (el: Element, buttons = 0) => fireEvent.pointerLeave(el, { ...MOUSE, buttons }),
  cancel: (el: Element) => fireEvent.pointerCancel(el, { ...MOUSE, button: -1, buttons: 0 }),
};

/** A finger (`touch`) or a pen with the given pointer id. */
export function contact(kind: 'touch' | 'pen', pointerId: number, isPrimary = true) {
  const base = { pointerType: kind, pointerId, isPrimary };
  return {
    down: (el: Element, at: At, extra: Extra = {}) => fireEvent.pointerDown(el, { ...base, ...at, button: 0, buttons: 1, ...extra }),
    move: (el: Element, at: At, extra: Extra = {}) => fireEvent.pointerMove(el, { ...base, ...at, button: -1, buttons: 1, ...extra }),
    up: (el: Element, at: At, extra: Extra = {}) => fireEvent.pointerUp(el, { ...base, ...at, button: 0, buttons: 0, ...extra }),
    cancel: (el: Element) => fireEvent.pointerCancel(el, { ...base, button: 0, buttons: 0 }),
    /** After a lift a finger leaves the element; a pen leaves when it is out of range. */
    leave: (el: Element) => fireEvent.pointerLeave(el, { ...base, button: -1, buttons: 0 }),
  };
}
