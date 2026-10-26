/**
 * The touch gesture recogniser: which pointer samples make a tap, a
 * long-press, a drag or a pinch, and what ends each one. The map's touch
 * handling is built on these rules, so each is pinned here with fake timers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGestureRecognizer, type Gesture, type GestureOptions, type PointerSample } from '../gestures';

const touch = (id: number, x: number, y: number, t = 0, button = 0): PointerSample => ({ id, kind: 'touch', x, y, t, button });
const mouse = (x: number, y: number, button = 0): PointerSample => ({ id: 1, kind: 'mouse', x, y, t: 0, button });
const pen = (x: number, y: number): PointerSample => ({ id: 7, kind: 'pen', x, y, t: 0, button: 0 });

/** A gesture as a short label: "tap", "drag start", "pinch end". */
const label = (g: Gesture) => (g.type === 'drag' || g.type === 'pinch' ? `${g.type} ${g.phase}` : g.type);

function setup(options?: GestureOptions) {
  const seen: Gesture[] = [];
  const r = createGestureRecognizer((g) => { seen.push(g); }, options);
  return { r, seen, labels: () => seen.map(label) };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('a mouse', () => {
  it('makes no gesture at all: no tap, no drag, no long-press', () => {
    const { r, labels } = setup();
    r.down(mouse(10, 10));
    r.move(mouse(80, 10));
    vi.advanceTimersByTime(2000);
    r.up(mouse(80, 10));
    r.down(mouse(10, 10, 2));
    r.cancel(mouse(10, 10, 2));

    expect(labels()).toEqual([]);
  });
});

describe('one finger', () => {
  it('is a tap when it lifts within the slop and before the long-press time, at the point it landed', () => {
    const { r, seen } = setup();
    r.down(touch(1, 100, 100, 0));
    r.move(touch(1, 105, 103, 50));
    vi.advanceTimersByTime(300);
    r.up(touch(1, 105, 103, 300));

    expect(seen).toEqual([{ type: 'tap', at: touch(1, 100, 100, 0) }]);
  });

  it('is a long-press when it holds still past 500 ms, at its latest point, and then nothing more on lift', () => {
    const { r, seen, labels } = setup();
    r.down(touch(1, 100, 100, 0));
    r.move(touch(1, 103, 101, 200));
    vi.advanceTimersByTime(499);
    expect(labels()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([{ type: 'long-press', at: touch(1, 103, 101, 200) }]);

    r.move(touch(1, 200, 200, 600));
    r.up(touch(1, 200, 200, 700));
    expect(labels()).toEqual(['long-press']);
  });

  it('still long-presses with a finger that jitters under the slop', () => {
    const { r, labels } = setup();
    r.down(touch(1, 100, 100, 0));
    for (const [x, y] of [[105, 100], [95, 100], [100, 106], [100, 94], [106, 104]]) r.move(touch(1, x, y));
    vi.advanceTimersByTime(500);

    expect(labels()).toEqual(['long-press']);
  });

  it('measures the slop from where it landed, so a slow drift past it becomes a drag', () => {
    const { r, labels } = setup();
    r.down(touch(1, 100, 100, 0));
    for (const x of [104, 107]) r.move(touch(1, x, 100));
    expect(labels()).toEqual([]);
    r.move(touch(1, 112, 100));
    vi.advanceTimersByTime(1000);

    expect(labels()).toEqual(['drag start']);
  });

  it('is a drag once it moves past the slop: start once, a move per sample, end on lift', () => {
    const { r, seen, labels } = setup();
    r.down(touch(1, 100, 100, 0));
    r.move(touch(1, 120, 100, 10));
    r.move(touch(1, 140, 100, 20));
    r.move(touch(1, 160, 110, 30));
    vi.advanceTimersByTime(1000);
    r.up(touch(1, 160, 110, 1030));

    expect(labels()).toEqual(['drag start', 'drag move', 'drag move', 'drag end']);
    expect(seen[0]).toEqual({ type: 'drag', phase: 'start', from: touch(1, 100, 100, 0), at: touch(1, 120, 100, 10) });
    expect(seen[3]).toEqual({ type: 'drag', phase: 'end', from: touch(1, 100, 100, 0), at: touch(1, 160, 110, 1030) });
  });

  it("carries the down's button on every sample after it", () => {
    const { r, seen } = setup();
    r.down(touch(1, 100, 100, 0, 0));
    r.move(touch(1, 150, 100, 10, -1));
    r.up(touch(1, 150, 100, 20, -1));

    expect(seen.map((g) => (g.type === 'drag' ? g.at.button : null))).toEqual([0, 0]);
  });

  // The timer decides, so a lift the page handles late is still a tap.
  it('is a tap when it lifts before the long-press timer runs, whatever time the lift carries', () => {
    const timers: Array<() => void> = [];
    const { r, labels } = setup({ setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => undefined });
    r.down(touch(1, 100, 100, 0));
    r.up(touch(1, 100, 100, 900));

    expect(labels()).toEqual(['tap']);
    // The first press's timer, run late, never long-presses the next press.
    r.down(touch(2, 100, 100, 1000));
    timers[0]!();
    expect(labels()).toEqual(['tap']);
    timers[1]!();
    expect(labels()).toEqual(['tap', 'long-press']);
  });
});

describe('two fingers', () => {
  it('pinch: the scale is the finger distance over the starting one, and dx, dy the centre moved since the last sample', () => {
    const { r, seen } = setup();
    r.down(touch(1, 100, 100));
    r.down(touch(2, 200, 100));
    r.move(touch(1, 50, 100));
    r.move(touch(2, 250, 120));

    expect(seen).toEqual([
      { type: 'pinch', phase: 'start', centre: { x: 150, y: 100 }, scale: 1, dx: 0, dy: 0 },
      { type: 'pinch', phase: 'move', centre: { x: 125, y: 100 }, scale: 1.5, dx: -25, dy: 0 },
      { type: 'pinch', phase: 'move', centre: { x: 150, y: 110 }, scale: Math.hypot(200, 20) / 100, dx: 25, dy: 10 },
    ]);
  });

  it('cancel a drag in progress, then start a pinch', () => {
    const { r, seen, labels } = setup();
    r.down(touch(1, 100, 100, 0));
    r.move(touch(1, 140, 100, 10));
    r.down(touch(2, 300, 100, 20));

    expect(labels()).toEqual(['drag start', 'drag cancel', 'pinch start']);
    expect(seen[1]).toEqual({ type: 'drag', phase: 'cancel', from: touch(1, 100, 100, 0), at: touch(1, 140, 100, 10) });
  });

  it('start a pinch from a press that is not yet a drag, dropping the press: no tap, no long-press', () => {
    const { r, labels } = setup();
    r.down(touch(1, 100, 100));
    r.down(touch(2, 200, 100));
    vi.advanceTimersByTime(1000);
    r.up(touch(1, 100, 100));
    r.up(touch(2, 200, 100));

    expect(labels()).toEqual(['pinch start', 'pinch end']);
  });

  it.each([
    ['the first finger', 1, 2],
    ['the second finger', 2, 1],
  ])('end the pinch once when %s lifts; the other then starts nothing until it lifts and touches again', (_name, first, second) => {
    const { r, labels } = setup();
    r.down(touch(1, 100, 100));
    r.down(touch(2, 200, 100));
    r.move(touch(1, 80, 100));
    r.move(touch(2, 220, 100));

    r.up(touch(first, first === 1 ? 80 : 220, 100));
    r.move(touch(second, 400, 300));
    r.move(touch(second, 500, 400));
    vi.advanceTimersByTime(1000);
    r.up(touch(second, 500, 400));

    expect(labels()).toEqual(['pinch start', 'pinch move', 'pinch move', 'pinch end']);

    r.down(touch(3, 100, 100));
    r.up(touch(3, 100, 100));
    expect(labels().slice(-1)).toEqual(['tap']);
  });

  it('end the pinch with the scale it reached', () => {
    const { r, seen } = setup();
    r.down(touch(1, 100, 100));
    r.down(touch(2, 200, 100));
    r.move(touch(2, 300, 100));
    r.up(touch(2, 300, 100));

    expect(seen.slice(-1)).toEqual([{ type: 'pinch', phase: 'end', centre: { x: 200, y: 100 }, scale: 2, dx: 0, dy: 0 }]);
  });
});

describe('more touches', () => {
  it('after a long-press start nothing until every finger lifts', () => {
    const { r, labels } = setup();
    r.down(touch(1, 100, 100));
    vi.advanceTimersByTime(500);
    r.down(touch(2, 200, 100));
    r.move(touch(2, 300, 100));
    r.up(touch(1, 100, 100));
    r.down(touch(3, 150, 150));
    r.up(touch(3, 150, 150));
    r.up(touch(2, 300, 100));
    expect(labels()).toEqual(['long-press']);

    r.down(touch(4, 100, 100));
    r.up(touch(4, 100, 100));
    expect(labels()).toEqual(['long-press', 'tap']);
  });

  it('a third touch during a pinch is ignored: its moves change nothing and its lift ends nothing', () => {
    const { r, labels, seen } = setup();
    r.down(touch(1, 100, 100));
    r.down(touch(2, 200, 100));
    r.down(touch(3, 500, 500));
    r.move(touch(3, 600, 600));
    r.up(touch(3, 600, 600));
    r.move(touch(2, 300, 100));

    expect(labels()).toEqual(['pinch start', 'pinch move']);
    expect(seen[1]).toEqual(expect.objectContaining({ scale: 2 }));
  });
});

describe('cancel, when the browser takes the pointer', () => {
  it('drops a press: nothing is emitted, then or later', () => {
    const { r, labels } = setup();
    r.down(touch(1, 100, 100));
    r.cancel(touch(1, 100, 100));
    vi.advanceTimersByTime(1000);
    r.up(touch(1, 100, 100));

    expect(labels()).toEqual([]);
  });

  it('cancels a drag', () => {
    const { r, labels } = setup();
    r.down(touch(1, 100, 100));
    r.move(touch(1, 150, 100));
    r.cancel(touch(1, 150, 100));
    r.up(touch(1, 150, 100));

    expect(labels()).toEqual(['drag start', 'drag cancel']);
  });

  it('ends a pinch', () => {
    const { r, labels } = setup();
    r.down(touch(1, 100, 100));
    r.down(touch(2, 200, 100));
    r.cancel(touch(2, 200, 100));
    r.move(touch(1, 400, 100));
    r.up(touch(1, 400, 100));

    expect(labels()).toEqual(['pinch start', 'pinch end']);
  });
});

describe('pointers it never saw go down', () => {
  it('are ignored: a move, a lift or a cancel for an unknown id does nothing', () => {
    const { r, labels } = setup();
    r.move(touch(9, 100, 100));
    r.up(touch(9, 100, 100));
    r.cancel(touch(9, 100, 100));
    r.down(touch(1, 100, 100));
    r.up(touch(9, 300, 300));
    r.move(touch(9, 300, 300));
    r.up(touch(1, 100, 100));

    expect(labels()).toEqual(['tap']);
  });
});

describe('a pen', () => {
  it('makes no gesture', () => {
    const { r, labels } = setup();
    r.down(pen(100, 100));
    r.move(pen(200, 100));
    vi.advanceTimersByTime(1000);
    r.up(pen(200, 100));

    expect(labels()).toEqual([]);
  });

  it('while down, leaves every touch ignored: a palm neither taps, drags nor pinches', () => {
    const { r, labels } = setup();
    r.down(pen(100, 100));
    r.down(touch(1, 300, 300));
    r.move(touch(1, 400, 300));
    r.down(touch(2, 500, 300));
    r.move(touch(2, 600, 300));
    vi.advanceTimersByTime(1000);
    r.up(touch(1, 400, 300));
    r.up(touch(2, 600, 300));
    r.up(pen(200, 100));

    expect(labels()).toEqual([]);
  });

  it('landing during a touch drag cancels it, and that finger starts nothing more', () => {
    const { r, labels } = setup();
    r.down(touch(1, 300, 300));
    r.move(touch(1, 350, 300));
    r.down(pen(100, 100));
    r.up(pen(100, 100));
    r.move(touch(1, 400, 300));
    r.up(touch(1, 400, 300));

    expect(labels()).toEqual(['drag start', 'drag cancel']);
  });
});

describe('reset', () => {
  it('drops everything without a word: no timer fires, and the fingers down start nothing', () => {
    const { r, labels } = setup();
    r.down(touch(1, 100, 100));
    r.reset();
    vi.advanceTimersByTime(1000);
    r.move(touch(1, 200, 100));
    r.up(touch(1, 200, 100));
    expect(labels()).toEqual([]);

    r.down(touch(2, 100, 100));
    r.up(touch(2, 100, 100));
    expect(labels()).toEqual(['tap']);
  });
});
