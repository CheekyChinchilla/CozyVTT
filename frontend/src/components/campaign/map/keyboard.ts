// ============================================
// The map's token keys: when a key press belongs to the map, and what each
// key asks for.
//
// The map listens on the window, so it hears every key on the page. The keys
// it has always had (Tab, Escape, the wall and undo keys) keep their own
// guard in MapCanvas, `isTypingInto` alone, so they still work after a tool
// button is clicked. The token keys added beside them ask `keyBelongsToMap`
// first: they are the map's only while its focus stop, or its own menu, has
// the keyboard, so an arrow pressed after a click on the chat log scrolls the
// log. Keys are matched by what they type (`key`), never by
// where they sit (`code`), so `[` is `[` on every layout that can type it.
// ============================================

import { isTypingInto } from './typingTarget';
import { isAnyTrapOpen } from '@/hooks/useFocusTrap';
import { isArrowKey, type ArrowKey, type StepDirection } from './selection';

/**
 * Focused elements that take keys of their own: an arrow on a radio button,
 * a slider or a tab of the session rail moves that control, and Enter
 * presses a button or follows a link.
 */
const OWN_KEYS = [
  'button', 'a[href]', 'select', 'input', 'textarea', 'summary',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="slider"]', '[role="menuitem"]',
  '[role="option"]', '[role="radio"]', '[role="checkbox"]', '[role="switch"]', '[role="spinbutton"]',
].join(', ');

const takesKeys = (el: EventTarget | null): boolean => el instanceof Element && el.matches(OWN_KEYS);

/**
 * Whether a token key press is the map's: only while `map`, its focus stop,
 * has the keyboard, or focus is inside `menu`, the map's own token menu; and
 * then not once something else on the page has used the key, not while
 * typing, not on a control that takes keys itself, and not while a dialog
 * is open.
 */
export function keyBelongsToMap(e: KeyboardEvent, map: Element | null, menu: Element | null = null): boolean {
  if (e.defaultPrevented) return false;
  const focused = document.activeElement;
  const onMap = map !== null && focused === map;
  const inMenu = menu !== null && focused !== null && menu.contains(focused);
  if (!onMap && !inMenu) return false;
  if (isTypingInto(e.target) || isTypingInto(focused)) return false;
  if (takesKeys(e.target) || takesKeys(focused)) return false;
  return !isAnyTrapOpen();
}

/** How many squares Shift and an arrow key move a token. */
export const SHIFT_SQUARES = 5;

/** A held arrow key moves a token at most once in this many milliseconds. */
export const ARROW_REPEAT_MS = 120;

/** What a token key asks the map to do with the selected token. */
export type MapKeyAction =
  | { kind: 'move'; key: ArrowKey; squares: number }
  | { kind: 'turn'; step: 1 | -1 }
  | { kind: 'step'; direction: StepDirection }
  | { kind: 'menu' };

/** The parts of a key press the map reads. */
export type KeyPress = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'getModifierState'>;

/**
 * Whether the modifiers held leave a punctuation key to the map. Cmd is the
 * browser's (Cmd+[ is Back on a Mac). Ctrl is too, except as half of AltGr,
 * which Windows reports as Ctrl and Alt and which German and French layouts
 * type `[` and `]` with. Alt alone is a Mac's Option, which types them there.
 */
function punctuationFree(e: KeyPress): boolean {
  if (e.metaKey) return false;
  return !e.ctrlKey || e.getModifierState('AltGraph');
}

const TURNS: ReadonlyMap<string, 1 | -1> = new Map([['[', -1], [']', 1]]);
const STEPS: ReadonlyMap<string, StepDirection> = new Map([[',', -1], ['<', -1], ['.', 1], ['>', 1]]);

/**
 * The action a key asks for, or null when the key is not one of the map's.
 * An arrow takes Shift for five squares and leaves Ctrl, Alt and Cmd to the
 * browser (Alt+Left is Back; Cmd+Left goes to the start of a line).
 */
export function mapKeyAction(e: KeyPress): MapKeyAction | null {
  if (isArrowKey(e.key)) {
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    return { kind: 'move', key: e.key, squares: e.shiftKey ? SHIFT_SQUARES : 1 };
  }
  if (e.key === 'Enter') {
    return e.ctrlKey || e.metaKey || e.altKey || e.shiftKey ? null : { kind: 'menu' };
  }
  const step = TURNS.get(e.key);
  if (step !== undefined) return punctuationFree(e) ? { kind: 'turn', step } : null;
  const direction = STEPS.get(e.key);
  if (direction !== undefined) return punctuationFree(e) ? { kind: 'step', direction } : null;
  return null;
}

export interface RepeatPacer {
  /** Whether a press at `now` acts: a fresh press always, a repeat only once the interval has passed. */
  allow(repeat: boolean, now: number): boolean;
}

/**
 * Paces the key repeat of a held key. Every fresh press acts at once; the
 * browser's repeats, about 30 a second, act at most once per `intervalMs`.
 */
export function createRepeatPacer(intervalMs: number): RepeatPacer {
  let last = -Infinity;
  return {
    allow(repeat, now) {
      if (repeat && now - last < intervalMs) return false;
      last = now;
      return true;
    },
  };
}
