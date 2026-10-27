// ============================================
// What a long-press's lift may bring. iOS can send a mousedown and a click
// as the finger of a long-press lifts, and the menu the long-press has just
// opened closes on one or the other (the token and door menus on a click,
// the roster's and the tracker's on a mousedown), or the click presses what
// it lands on: a roster row would open its sheet as well. So after a
// long-press the first mousedown and the first click anywhere on the page
// are swallowed, unless a new press starts first or a second has passed
// since the finger lifted. A click with no pointer, which Enter or Space on
// a focused control makes, is the user's and goes through. The map's canvas
// and the panels' rows (hooks/useLongPress.ts) each keep one.
// ============================================

/** How long after a long-pressing finger lifts what it may bring is still swallowed. */
export const LONG_PRESS_CLICK_MS = 1000;

export interface ClickSwallow {
  /** A long-press of this pointer opened something: swallow what its lift may bring. */
  arm(pointerId: number): void;
  /** That pointer lifted, or the browser took it: a second more. */
  lifted(pointerId: number): void;
  /** Swallow nothing more. */
  clear(): void;
}

const SWALLOWED = ['mousedown', 'click'] as const;

/**
 * Listens on `target`, in the capture phase, only while armed, so a
 * swallowed event reaches nothing else on the page.
 */
export function createClickSwallow(target: Window = window, now: () => number = () => performance.now()): ClickSwallow {
  let armed: { pointerId: number; until: number; left: Set<string> } | null = null;

  const onPress = () => clear();
  const onMouse = (event: MouseEvent) => {
    if (!armed || !armed.left.has(event.type)) return;
    if (event.type === 'click' && event.detail === 0) return;
    if (now() > armed.until) {
      clear();
      return;
    }
    armed.left.delete(event.type);
    event.stopImmediatePropagation();
    event.preventDefault();
    if (armed.left.size === 0) clear();
  };

  const listen = () => {
    target.addEventListener('pointerdown', onPress, true);
    for (const type of SWALLOWED) target.addEventListener(type, onMouse, true);
  };
  function clear() {
    if (!armed) return;
    armed = null;
    target.removeEventListener('pointerdown', onPress, true);
    for (const type of SWALLOWED) target.removeEventListener(type, onMouse, true);
  }

  return {
    arm(pointerId) {
      if (!armed) listen();
      armed = { pointerId, until: Infinity, left: new Set(SWALLOWED) };
    },
    lifted(pointerId) {
      if (armed?.pointerId === pointerId && armed.until === Infinity) armed.until = now() + LONG_PRESS_CLICK_MS;
    },
    clear,
  };
}
