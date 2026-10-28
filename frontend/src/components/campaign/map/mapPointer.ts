// ============================================
// One pointer as the map's tools see it, whatever made it: a mouse, a finger
// or a pen. The field names are MouseEvent's, so a tool reads `e.shiftKey` or
// `e.buttons & 1` as it always has.
// ============================================

import type React from 'react';
import type { PointerKind } from './gestures';

export type { PointerKind } from './gestures';

export interface MapPointer {
  pointerId: number;
  kind: PointerKind;
  isPrimary: boolean;
  /**
   * The button that changed: 0 primary, 1 middle, 2 secondary, 3 and 4 back
   * and forward, 5 a pen's eraser, -1 on a move. A touch is 0.
   */
  button: number;
  /** The buttons held, as bits: 1 primary, 2 secondary, 4 middle. A touch or pen in contact holds 1. */
  buttons: number;
  /**
   * The click count, 2 on the second click of a double-click. A pointer
   * event's own is always 0, so MapCanvas counts the downs itself.
   */
  detail: number;
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  /**
   * Cancels the event's default, except on a pointer down, where it does
   * nothing: cancelling one stops the mousedown that follows, and the menus
   * over the map close on a mousedown outside them.
   */
  preventDefault(): void;
}

/** A pointer event's `pointerType` as a kind; an empty or unknown one is a mouse. */
export function pointerKind(pointerType: string | undefined): PointerKind {
  return pointerType === 'touch' || pointerType === 'pen' ? pointerType : 'mouse';
}

const nothing = () => undefined;

export function fromPointerEvent(e: React.PointerEvent<Element> | PointerEvent): MapPointer {
  return {
    pointerId: e.pointerId,
    kind: pointerKind(e.pointerType),
    isPrimary: e.isPrimary,
    button: e.button,
    buttons: e.buttons,
    detail: e.detail,
    clientX: e.clientX,
    clientY: e.clientY,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    preventDefault: e.type === 'pointerdown' ? nothing : () => e.preventDefault(),
  };
}

/**
 * The context menu's event. Chrome sends it as a pointer event, whose type
 * says whether a finger opened it; any other browser's is a mouse's.
 */
export function fromMouseEvent(e: React.MouseEvent<HTMLCanvasElement>): MapPointer {
  const native = e.nativeEvent;
  const pointerType = 'pointerType' in native && typeof native.pointerType === 'string' ? native.pointerType : undefined;
  return {
    pointerId: 1,
    kind: pointerKind(pointerType),
    isPrimary: true,
    button: e.button,
    buttons: e.buttons,
    detail: e.detail,
    clientX: e.clientX,
    clientY: e.clientY,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    preventDefault: () => e.preventDefault(),
  };
}

/** A pen's eraser end, which the map ignores. */
export const PEN_ERASER_BUTTON = 5;

const BUTTON_BITS: Record<number, number> = { 0: 1, 1: 4, 2: 2, 3: 8, 4: 16, 5: 32 };

/** The bit a button holds in `buttons`; 0 for -1, a move's. */
export function buttonBit(button: number): number {
  return BUTTON_BITS[button] ?? 0;
}

// TODO(play): a finger's double tap ends a wall line only with its two taps within 4 pixels, which a fingertip
// rarely manages. Widening it to DOUBLE_TAP_PX could end a quick two-point line by itself at low zoom, where two
// snapped corners a square apart are that close; the Walls panel's Done is the dependable way to finish a line.
/**
 * Downs this close in time and place count as one more click. A page cannot
 * read the system's double-click settings; these are the usual ones.
 */
export const CLICK_COUNT_MS = 500;
export const CLICK_COUNT_PX = 4;

/**
 * How far apart, in page pixels, a finger's or a pen's two taps may land and
 * still be a double tap to ping, in CLICK_COUNT_MS. Two taps meant for one
 * spot land several pixels apart, past a mouse's 4; 20 is Chromium's own
 * distance for a touch screen's double tap.
 */
export const DOUBLE_TAP_PX = 20;

export interface ClickCounter {
  /** A primary-button down or a tap at time `t`: its click count, 1 for the first. */
  count(kind: PointerKind, t: number, x: number, y: number): number;
  /** The next down counts from 1, after another button or a drag. */
  reset(): void;
}

/** Counts downs within CLICK_COUNT_MS of each other and `px` page pixels of the last. */
export function createClickCounter(px = CLICK_COUNT_PX): ClickCounter {
  let last: { kind: PointerKind; t: number; x: number; y: number; count: number } | null = null;
  return {
    count(kind, t, x, y) {
      const again = last !== null && last.kind === kind && t - last.t <= CLICK_COUNT_MS
        && Math.hypot(x - last.x, y - last.y) <= px;
      const count = again && last ? last.count + 1 : 1;
      last = { kind, t, x, y, count };
      return count;
    },
    reset() {
      last = null;
    },
  };
}
