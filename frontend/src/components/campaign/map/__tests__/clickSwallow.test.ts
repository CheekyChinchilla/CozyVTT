/**
 * What a long-press's lift may bring, swallowed once. iOS can send a
 * mousedown and a click as the finger of a long-press lifts, and the menu
 * the long-press just opened closes on one or the other, or the click
 * presses whatever it lands on. The map's canvas and the panels' rows share
 * this rule, so it is pinned here on its own.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createClickSwallow as create, LONG_PRESS_CLICK_MS, type ClickSwallow } from '../clickSwallow';

let clock = 0;
const now = () => clock;
/** Each swallow a test made, cleared after it so none listens into the next. */
const made: ClickSwallow[] = [];
const createClickSwallow = (target: Window, at: () => number) => {
  const swallow = create(target, at);
  made.push(swallow);
  return swallow;
};

const fire = (type: 'mousedown' | 'click' | 'pointerdown', detail = 1) => {
  const event = type === 'pointerdown'
    ? new Event('pointerdown', { bubbles: true, cancelable: true })
    : new MouseEvent(type, { bubbles: true, cancelable: true, detail });
  document.body.dispatchEvent(event);
  return event;
};

const heard: string[] = [];
const hear = (event: Event) => { heard.push(event.type); };
document.addEventListener('mousedown', hear);
document.addEventListener('click', hear);

afterEach(() => {
  made.splice(0).forEach((swallow) => swallow.clear());
  heard.length = 0;
  clock = 0;
});

describe('after a long-press', () => {
  it('swallows the first mousedown and the first click, once each', () => {
    const swallow = createClickSwallow(window, now);
    swallow.arm(1);

    const down = fire('mousedown');
    const click = fire('click');
    fire('mousedown');
    fire('click');

    expect(down.defaultPrevented).toBe(true);
    expect(click.defaultPrevented).toBe(true);
    expect(heard).toEqual(['mousedown', 'click']);
  });

  it('lets a click with no pointer through, as Enter or Space on a focused control makes', () => {
    const swallow = createClickSwallow(window, now);
    swallow.arm(1);

    fire('click', 0);

    expect(heard).toEqual(['click']);
  });

  it('swallows nothing once a new press starts', () => {
    const swallow = createClickSwallow(window, now);
    swallow.arm(1);

    fire('pointerdown');
    fire('mousedown');
    fire('click');

    expect(heard).toEqual(['mousedown', 'click']);
  });

  it('waits for as long as the finger stays down, and a second after it lifts', () => {
    const swallow = createClickSwallow(window, now);
    swallow.arm(1);
    clock = 5000;
    fire('mousedown');
    expect(heard).toEqual([]);

    swallow.lifted(1);
    clock += LONG_PRESS_CLICK_MS + 1;
    fire('click');

    expect(heard).toEqual(['click']);
  });

  it("keeps waiting when another finger lifts", () => {
    const swallow = createClickSwallow(window, now);
    swallow.arm(1);

    swallow.lifted(2);
    clock = 5000;
    fire('click');

    expect(heard).toEqual([]);
  });

  it('swallows nothing more once cleared, and nothing before it is armed', () => {
    const swallow = createClickSwallow(window, now);
    fire('click');
    swallow.arm(1);
    swallow.clear();
    fire('mousedown');
    fire('click');

    expect(heard).toEqual(['click', 'mousedown', 'click']);
  });

  it('listens on the window only while it is armed', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    try {
      const swallow = createClickSwallow(window, now);
      expect(add).not.toHaveBeenCalled();
      swallow.arm(1);
      expect(add.mock.calls.map(([type]) => type).sort()).toEqual(['click', 'mousedown', 'pointerdown']);
      fire('mousedown');
      fire('click');
      expect(remove.mock.calls.map(([type]) => type).sort()).toEqual(['click', 'mousedown', 'pointerdown']);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });
});
