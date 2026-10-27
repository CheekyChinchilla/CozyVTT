// ============================================
// Touch gestures on the map: taps, long-presses, drags and pinches, told
// apart from the pointer samples MapCanvas feeds in. Pure: no DOM, no React,
// and the long-press timer can be handed in, so every rule is tested alone.
//
// Only touch makes gestures. A mouse keeps its clicks, right button and wheel
// exactly as they were, so its samples are ignored here. A pen is a mouse to
// the tools and makes no gesture either; while one is down every touch is
// ignored, so a palm resting on the glass neither pans nor cancels a stroke.
//
// The rules:
// - a press that lifts within the slop, before the long-press timer runs,
//   is a tap at the point it landed;
// - one that holds still until the timer runs is a long-press at its latest
//   point, and then nothing more until every finger lifts;
// - one that moves the slop or more from where it landed is a drag: start
//   once, a move per sample, end on lift;
// - a second finger turns a press or a drag into a pinch (a drag is
//   cancelled first); a pinch ends when either finger lifts, and the finger
//   left behind starts nothing until it lifts and touches again;
// - a press that `longPressAt` refuses as it lands has no timer: held still
//   for any time it is still a tap on lift, or a drag once it moves;
// - `hold` holds a press as the long-press timer would, emitting nothing:
//   the browser made its own long-press (Android's contextmenu);
// - a third touch, and any touch after a long-press, is ignored;
// - cancel (the browser took the pointer) ends whatever is in progress: a
//   drag is cancelled, a pinch ends, a press is dropped;
// - a sample for a pointer it never saw go down is ignored.
// ============================================

export type PointerKind = 'mouse' | 'touch' | 'pen';

/**
 * How long a press holds still to be a long-press, and how far it may move
 * from where it landed and still be a press, in pixels. The panels' rows
 * long-press by the same two (hooks/useLongPress.ts).
 */
export const LONG_PRESS_MS = 500;
export const TAP_SLOP_PX = 8;

/**
 * One pointer at one moment. `x` and `y` are in the same pixels for every
 * sample (MapCanvas gives the page's); `t` in milliseconds. `button` is the
 * pointer event's: 0 primary, 2 secondary, -1 on a move; a gesture's samples
 * carry the button their pointer went down with.
 */
export interface PointerSample { id: number; kind: PointerKind; x: number; y: number; t: number; button: number }

export type Gesture =
  | { type: 'tap'; at: PointerSample }
  | { type: 'long-press'; at: PointerSample }
  /** `from` is where the finger landed; `start` carries the sample that crossed the slop. */
  | { type: 'drag'; phase: 'start' | 'move' | 'end' | 'cancel'; from: PointerSample; at: PointerSample }
  /**
   * `centre` is the midpoint of the two fingers, `scale` their distance over
   * the distance when the pinch began, and `dx`, `dy` how far the centre
   * moved since the last pinch gesture (0 at the start and the end).
   */
  | { type: 'pinch'; phase: 'start' | 'move' | 'end'; centre: { x: number; y: number }; scale: number; dx: number; dy: number };

export interface GestureOptions {
  /** TAP_SLOP_PX: movement under it keeps a press a press. */
  slopPx?: number;
  /** LONG_PRESS_MS. */
  longPressMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /**
   * Whether a press may become a long-press, asked once as it lands. Without
   * one it may. A press refused here has no timer, so it stays a press for as
   * long as it is held: a tap on lift, or a drag once it moves the slop.
   */
  longPressAt?: (s: PointerSample) => boolean;
}

export interface GestureRecognizer {
  down(s: PointerSample): void;
  move(s: PointerSample): void;
  up(s: PointerSample): void;
  cancel(s: PointerSample): void;
  /**
   * The browser made its own long-press of this finger, as Android does with
   * its contextmenu: the press is held, as after a long-press, so its lift is
   * no tap and the timer emits nothing. True when it held the press; false
   * once the timer has, or for a drag, a pinch or a finger it never saw.
   */
  hold(id: number): boolean;
  /** Whether this finger's press is held, by the timer's long-press or by `hold`, until it lifts. */
  isHeld(id: number): boolean;
  /** Forget every pointer and gesture without emitting anything. */
  reset(): void;
}

interface Finger { down: PointerSample; latest: PointerSample }

/**
 * idle: no touch down. press: one finger, not yet a drag. drag, held (after a
 * long-press) and pinch are what their names say. spent: a gesture ended with
 * fingers still down, which start nothing until they all lift.
 */
type Phase = 'idle' | 'press' | 'drag' | 'held' | 'pinch' | 'spent';

const distance = (a: PointerSample, b: PointerSample) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: PointerSample, b: PointerSample) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function createGestureRecognizer(emit: (g: Gesture) => void, options: GestureOptions = {}): GestureRecognizer {
  const slopPx = options.slopPx ?? TAP_SLOP_PX;
  const longPressMs = options.longPressMs ?? LONG_PRESS_MS;
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const longPressAt = options.longPressAt ?? (() => true);

  let phase: Phase = 'idle';
  /** Every touch down that the recogniser saw land, whether or not it counts. */
  const contacts = new Set<number>();
  /** The one or two touches the current gesture is made of. */
  const fingers = new Map<number, Finger>();
  const pens = new Set<number>();
  let pinch: { startDistance: number; centre: { x: number; y: number }; scale: number } | null = null;
  let timer: unknown = null;
  /** Which press the timer belongs to, so a stale one never long-presses a later press. */
  let pressNumber = 0;

  const stopTimer = () => {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
  };

  /** The gesture is over; any fingers still down wait to lift. */
  const finish = () => {
    stopTimer();
    fingers.clear();
    pinch = null;
    phase = contacts.size > 0 ? 'spent' : 'idle';
  };

  /** End whatever is in progress as the browser taking the pointer would. */
  const cancelGesture = () => {
    const [only] = fingers.values();
    if (phase === 'drag' && only) emit({ type: 'drag', phase: 'cancel', from: only.down, at: only.latest });
    if (phase === 'pinch' && pinch) emit({ type: 'pinch', phase: 'end', centre: pinch.centre, scale: pinch.scale, dx: 0, dy: 0 });
    finish();
  };

  const onLongPress = (press: number) => {
    timer = null;
    if (press !== pressNumber || phase !== 'press') return;
    const [only] = fingers.values();
    if (!only) return;
    phase = 'held';
    emit({ type: 'long-press', at: only.latest });
  };

  const startPinch = (first: Finger, s: PointerSample) => {
    stopTimer();
    fingers.set(s.id, { down: s, latest: s });
    phase = 'pinch';
    const centre = midpoint(first.latest, s);
    pinch = { startDistance: distance(first.latest, s), centre, scale: 1 };
    emit({ type: 'pinch', phase: 'start', centre, scale: 1, dx: 0, dy: 0 });
  };

  const touchDown = (s: PointerSample) => {
    if (contacts.has(s.id)) return;
    contacts.add(s.id);
    if (pens.size > 0) {
      if (fingers.size === 0) phase = 'spent';
      return;
    }
    const [first] = fingers.values();
    switch (phase) {
      case 'idle': {
        fingers.set(s.id, { down: s, latest: s });
        phase = 'press';
        pressNumber += 1;
        const press = pressNumber;
        if (longPressAt(s)) timer = setTimer(() => onLongPress(press), longPressMs);
        return;
      }
      case 'press':
        if (first) startPinch(first, s);
        return;
      case 'drag':
        if (!first) return;
        emit({ type: 'drag', phase: 'cancel', from: first.down, at: first.latest });
        startPinch(first, s);
        return;
      default:
        // held, pinch (a third touch) and spent start nothing.
        return;
    }
  };

  const touchMove = (s: PointerSample) => {
    const finger = fingers.get(s.id);
    if (!finger) return;
    const at = { ...s, button: finger.down.button };
    finger.latest = at;
    if (phase === 'press') {
      if (distance(finger.down, at) < slopPx) return;
      stopTimer();
      phase = 'drag';
      emit({ type: 'drag', phase: 'start', from: finger.down, at });
    } else if (phase === 'drag') {
      emit({ type: 'drag', phase: 'move', from: finger.down, at });
    } else if (phase === 'pinch' && pinch) {
      const [a, b] = [...fingers.values()];
      if (!a || !b) return;
      const centre = midpoint(a.latest, b.latest);
      const scale = pinch.startDistance > 0 ? distance(a.latest, b.latest) / pinch.startDistance : 1;
      const dx = centre.x - pinch.centre.x;
      const dy = centre.y - pinch.centre.y;
      pinch = { ...pinch, centre, scale };
      emit({ type: 'pinch', phase: 'move', centre, scale, dx, dy });
    }
  };

  const touchUp = (s: PointerSample) => {
    if (!contacts.delete(s.id)) return;
    const finger = fingers.get(s.id);
    if (!finger) {
      if (fingers.size === 0) phase = contacts.size > 0 ? 'spent' : 'idle';
      return;
    }
    if (phase === 'press') emit({ type: 'tap', at: finger.down });
    if (phase === 'drag') emit({ type: 'drag', phase: 'end', from: finger.down, at: { ...s, button: finger.down.button } });
    if (phase === 'pinch' && pinch) emit({ type: 'pinch', phase: 'end', centre: pinch.centre, scale: pinch.scale, dx: 0, dy: 0 });
    finish();
  };

  const touchCancel = (s: PointerSample) => {
    if (!contacts.delete(s.id)) return;
    if (!fingers.has(s.id)) {
      if (fingers.size === 0) phase = contacts.size > 0 ? 'spent' : 'idle';
      return;
    }
    cancelGesture();
  };

  return {
    down(s) {
      if (s.kind === 'pen') {
        if (pens.has(s.id)) return;
        pens.add(s.id);
        // The pen wins: a touch gesture under way ends, and its fingers
        // start nothing more.
        cancelGesture();
        return;
      }
      if (s.kind === 'touch') touchDown(s);
    },
    move(s) {
      if (s.kind === 'touch') touchMove(s);
    },
    up(s) {
      if (s.kind === 'pen') pens.delete(s.id);
      else if (s.kind === 'touch') touchUp(s);
    },
    cancel(s) {
      if (s.kind === 'pen') pens.delete(s.id);
      else if (s.kind === 'touch') touchCancel(s);
    },
    hold(id) {
      if (phase !== 'press' || !fingers.has(id)) return false;
      stopTimer();
      phase = 'held';
      return true;
    },
    isHeld(id) {
      return phase === 'held' && fingers.has(id);
    },
    reset() {
      stopTimer();
      contacts.clear();
      fingers.clear();
      pens.clear();
      pinch = null;
      phase = 'idle';
    },
  };
}
