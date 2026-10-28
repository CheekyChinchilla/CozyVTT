/**
 * A character sheet's roll menu: one d20 test (a check, a save, a skill, an
 * attack) as Normal, Advantage or Disadvantage, as the sheet's system names
 * them (Fortune and Misfortune in Pathfinder 2e). Every sheet that rolls
 * with advantage opens this one, over the stat.
 *
 * - It opens at the pointer or the finger, on the other side of it where it
 *   would run off the screen, and always inside the screen.
 * - It closes on a press anywhere else. That is a pointerdown, which a
 *   finger, a pen and a mouse all send as they land; a mousedown alone is
 *   what iOS sends as the finger of a long-press lifts, and must not close
 *   the menu that long-press opened.
 * - Escape closes it, and the sheet under it stays open: it is a dialog of
 *   its own to the focus trap, which gives a key to the top one only.
 * - It is portaled to the body, so no ancestor's transform can hold it.
 */

import { useEffect, useLayoutEffect, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Dices } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { applyRollMode, getModeLabels, ROLL_MODES } from '@/utils/rollModes';

export interface RollPoint { clientX: number; clientY: number }

export interface SheetRollPopupProps {
  /** Where it opens: the pointer of a right-click, the finger of a long-press. */
  at: RollPoint;
  /** The test as a Normal roll, `1d20+5`. */
  expression: string;
  purpose: string;
  gameSystem: string | null;
  onRoll: (expression: string, purpose: string) => void;
  onClose: () => void;
}

/** How far inside the screen's edge it always stays. */
const EDGE_PX = 8;

interface Size { width: number; height: number }

/**
 * Where its top-left corner goes: at the point, or the other side of it
 * where it would run off the screen, and never nearer an edge than EDGE_PX.
 */
export function placeRollPopup(at: RollPoint, size: Size, screen: Size): { left: number; top: number } {
  const along = (point: number, length: number, room: number) => {
    const start = point + length > room - EDGE_PX ? point - length : point;
    return Math.max(EDGE_PX, Math.min(start, room - length - EDGE_PX));
  };
  return { left: along(at.clientX, size.width, screen.width), top: along(at.clientY, size.height, screen.height) };
}

export function SheetRollPopup({ at, expression, purpose, gameSystem, onRoll, onClose }: SheetRollPopupProps) {
  const ref = useFocusTrap(true, onClose);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const labels = getModeLabels(gameSystem);

  // Measured before it is painted, so it never shows where it would not fit.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPlace(placeRollPopup(at, { width, height }, { width: window.innerWidth, height: window.innerHeight }));
  }, [ref, at]);

  // In the capture phase, so a control that stops its own pointerdown still
  // closes it.
  useEffect(() => {
    const onPress = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPress, true);
    return () => document.removeEventListener('pointerdown', onPress, true);
  }, [ref, onClose]);

  // A menu's arrow keys, Home and End; Tab moves through it too.
  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const now = items.findIndex((item) => item === document.activeElement);
    const next = {
      ArrowDown: (now + 1) % items.length,
      ArrowUp: (now - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    items[next]?.focus();
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={purpose}
      onKeyDown={moveFocus}
      className="fixed z-60 min-w-45 max-w-[calc(100vw-1rem)] bg-paper border border-ink/10 rounded-lg shadow-xl overflow-hidden"
      style={{ left: place?.left ?? at.clientX, top: place?.top ?? at.clientY, visibility: place ? 'visible' : 'hidden' }}
    >
      <div aria-hidden="true" className="px-3 py-2 bg-accent text-accent-text text-xs font-semibold truncate">
        {purpose}
      </div>
      {ROLL_MODES.map((mode) => {
        const roll = applyRollMode(expression, purpose, mode, gameSystem);
        return (
          <button
            key={mode}
            type="button"
            role="menuitem"
            onClick={() => {
              onRoll(roll.expression, roll.purpose);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 pointer-coarse:min-h-11 text-sm text-ink-secondary hover:bg-accent/10 focus-visible:bg-accent/10 transition-colors text-left"
          >
            <Dices className="w-3.5 h-3.5 text-accent-ink shrink-0" aria-hidden="true" />
            {labels[mode]}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
