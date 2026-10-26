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
