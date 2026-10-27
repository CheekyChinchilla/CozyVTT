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
 */

/** Where a press may not long-press. */
export const NO_LONG_PRESS = 'input, textarea, select, [data-drag-grip]';

export interface LongPressPoint { clientX: number; clientY: number }

export interface LongPressOptions {
  /** How long a press holds still; the map's LONG_PRESS_MS without one. */
  delayMs?: number;
  /** How far it may move and still be a press; the map's TAP_SLOP_PX without one. */
  slopPx?: number;
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

export function useLongPress(onOpen: (at: LongPressPoint) => void, options: LongPressOptions = {}): LongPressHandlers {
  const onOpenRef = useRef(onOpen);
  useEffect(() => { onOpenRef.current = onOpen; });

  const [press] = useState(() => {
    const swallow = createClickSwallow();
    /** Each finger down on the row, and whether its press may open the menu. */
    const fingers = new Map<number, boolean>();
    let landsWhereItMay = true;
    const open = (pointerId: number, clientX: number, clientY: number) => {
      swallow.arm(pointerId);
      onOpenRef.current({ clientX, clientY });
    };
    const recogniser = createGestureRecognizer((g) => {
      if (g.type === 'long-press' && fingers.get(g.at.id)) open(g.at.id, g.at.x, g.at.y);
    }, {
      slopPx: options.slopPx,
      longPressMs: options.delayMs,
      longPressAt: () => landsWhereItMay,
    });
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
          landsWhereItMay = !(e.target instanceof Element && e.target.closest(NO_LONG_PRESS));
          fingers.set(e.pointerId, landsWhereItMay);
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
        for (const [pointerId, may] of fingers) {
          if (may && recogniser.hold(pointerId)) {
            open(pointerId, e.clientX, e.clientY);
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
