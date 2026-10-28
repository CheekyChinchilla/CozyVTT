import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { createGestureRecognizer, type PointerSample } from '@/components/campaign/map/gestures';
import { createClickSwallow } from '@/components/campaign/map/clickSwallow';
import { pointerKind } from '@/components/campaign/map/mapPointer';

/**
 * A long-press on a row of a side panel, the roster's characters and the
 * initiative tracker's combatants, opens the menu a right-click opens there,
 * as a long-press on a token does on the map. The press is told apart by the
 * map's own recogniser (map/gestures.ts), so its rules are the map's: held
 * still for LONG_PRESS_MS within TAP_SLOP_PX it opens, once; a move past the
 * slop, the browser taking the pointer to scroll, a second finger or a lift
 * before then opens nothing. Only a finger long-presses: a mouse has its
 * right button, and a pen makes none, as on the map.
 *
 * Android's browser makes its own long-press and sends a contextmenu, before
 * the timer or after it as the system's touch-and-hold delay is set. The
 * row's contextmenu handler asks `takeContextMenu` first, so either way the
 * menu opens once. Once it has opened, the mousedown and the click iOS may
 * send as the finger lifts are swallowed (map/clickSwallow.ts), so the menu
 * stays open and the row does not also do what a tap does.
 *
 * A press that lands on an input, or on a drag grip (`data-drag-grip`), never
 * long-presses: the grip is how a finger drags the row.
 *
 * One handler can serve many rows, as a character sheet's root serves every
 * stat that rolls: with `within`, a press long-presses only where it lands
 * inside an element that matches it, and `onOpen` is told which. A press
 * anywhere else is not timed, so it opens nothing and swallows nothing.
 */

/** Where a press may not long-press. */
export const NO_LONG_PRESS = 'input, textarea, select, [data-drag-grip]';

export interface LongPressPoint { clientX: number; clientY: number }

export interface LongPressOptions {
  /** How long a press holds still; the map's LONG_PRESS_MS without one. */
  delayMs?: number;
  /** How far it may move and still be a press; the map's TAP_SLOP_PX without one. */
  slopPx?: number;
  /**
   * A selector: only a press that lands inside a matching element may
   * long-press, and `onOpen` is given that element. Without one, a press
   * anywhere on the element the handlers are on may, and that element is given.
   */
  within?: string;
}

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent<Element>) => void;
  onPointerMove: (e: React.PointerEvent<Element>) => void;
  onPointerUp: (e: React.PointerEvent<Element>) => void;
  onPointerCancel: (e: React.PointerEvent<Element>) => void;
  /**
   * For the row's contextmenu handler, before anything else: true when a
   * finger is down on the row, so the event is the browser's own long-press,
   * which this has handled (cancelled, and the menu opened if this press has
   * not opened it yet and may); false for a mouse's right button or the
   * keyboard's menu key, which the row's handler opens the menu for.
   */
  takeContextMenu: (e: React.MouseEvent<Element>) => boolean;
}

const sampleOf = (e: React.PointerEvent<Element>): PointerSample => ({
  id: e.pointerId, kind: pointerKind(e.pointerType), x: e.clientX, y: e.clientY, t: e.timeStamp, button: e.button,
});

export function useLongPress(onOpen: (at: LongPressPoint, on: Element) => void, options: LongPressOptions = {}): LongPressHandlers {
  const onOpenRef = useRef(onOpen);
  useEffect(() => { onOpenRef.current = onOpen; });

  const [press] = useState(() => {
    const swallow = createClickSwallow();
    /**
     * Each finger down on the row, and what its press would open the menu
     * for: the row, or the element matching `within` it landed in; null
     * where it may not long-press.
     */
    const fingers = new Map<number, Element | null>();
    let landsOn: Element | null = null;
    const open = (pointerId: number, on: Element, clientX: number, clientY: number) => {
      swallow.arm(pointerId);
      onOpenRef.current({ clientX, clientY }, on);
    };
    const recogniser = createGestureRecognizer((g) => {
      if (g.type !== 'long-press') return;
      const on = fingers.get(g.at.id);
      if (on) open(g.at.id, on, g.at.x, g.at.y);
    }, {
      slopPx: options.slopPx,
      longPressMs: options.delayMs,
      longPressAt: () => landsOn !== null,
    });
    /** What a press landing here would open the menu for, if anything. */
    const pressedOn = (e: React.PointerEvent<Element>): Element | null => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(NO_LONG_PRESS)) return null;
      if (options.within === undefined) return e.currentTarget;
      return target?.closest(options.within) ?? null;
    };
    const lifted = (e: React.PointerEvent<Element>, step: 'up' | 'cancel') => {
      const kind = pointerKind(e.pointerType);
      if (kind === 'mouse') return;
      recogniser[step](sampleOf(e));
      if (kind !== 'touch') return;
      fingers.delete(e.pointerId);
      swallow.lifted(e.pointerId);
    };
    const handlers: LongPressHandlers = {
      onPointerDown(e) {
        const kind = pointerKind(e.pointerType);
        if (kind === 'mouse') return;
        if (kind === 'touch') {
          landsOn = pressedOn(e);
          fingers.set(e.pointerId, landsOn);
        }
        recogniser.down(sampleOf(e));
      },
      onPointerMove(e) {
        if (pointerKind(e.pointerType) !== 'mouse') recogniser.move(sampleOf(e));
      },
      onPointerUp: (e) => lifted(e, 'up'),
      onPointerCancel: (e) => lifted(e, 'cancel'),
      takeContextMenu(e) {
        if (fingers.size === 0) return false;
        e.preventDefault();
        for (const [pointerId, on] of fingers) {
          if (on && recogniser.hold(pointerId)) {
            open(pointerId, on, e.clientX, e.clientY);
            break;
          }
        }
        return true;
      },
    };
    return { handlers, forget() { recogniser.reset(); fingers.clear(); swallow.clear(); } };
  });

  useEffect(() => () => press.forget(), [press]);
  return press.handlers;
}
