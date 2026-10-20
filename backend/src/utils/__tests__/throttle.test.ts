/**
 * The throttle the live table paces token drags with: the first call at
 * once, then at most one call per wait, the last call of a burst always
 * delivered so a drag ends where the pointer did.
 */

import { throttle } from '../throttle';

beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
afterEach(() => jest.useRealTimers());

describe('throttle', () => {
  it('calls at once the first time', () => {
    const fn = jest.fn();
    throttle(fn, 16)('a');
    expect(fn.mock.calls).toEqual([['a']]);
  });

  it('turns a burst inside one wait into the first call and, at its end, the last', () => {
    const fn = jest.fn();
    const paced = throttle(fn, 16);
    paced(1);
    paced(2);
    paced(3);
    expect(fn.mock.calls).toEqual([[1]]);
    jest.advanceTimersByTime(16);
    expect(fn.mock.calls).toEqual([[1], [3]]);
    jest.advanceTimersByTime(100);
    expect(fn.mock.calls).toEqual([[1], [3]]);
  });

  it('makes no second call when nothing came during the wait', () => {
    const fn = jest.fn();
    throttle(fn, 16)('only');
    jest.advanceTimersByTime(100);
    expect(fn.mock.calls).toEqual([['only']]);
  });

  it('calls at once again when the wait has passed', () => {
    const fn = jest.fn();
    const paced = throttle(fn, 500);
    paced('first');
    jest.advanceTimersByTime(500);
    paced('second');
    expect(fn.mock.calls).toEqual([['first'], ['second']]);
  });

  it('waits a full wait after a trailing call before the next', () => {
    const fn = jest.fn();
    const paced = throttle(fn, 16);
    paced(1);
    paced(2);
    jest.advanceTimersByTime(16); // 2 goes out here
    paced(3);
    expect(fn.mock.calls).toEqual([[1], [2]]);
    jest.advanceTimersByTime(16);
    expect(fn.mock.calls).toEqual([[1], [2], [3]]);
  });

  it('calls at once after the wait even when the clock is set back', () => {
    const fn = jest.fn();
    const paced = throttle(fn, 16);
    paced('before');
    jest.advanceTimersByTime(16);
    // The server's clock corrected an hour back, as a time sync can do.
    jest.setSystemTime(Date.now() - 60 * 60 * 1000);
    paced('after');
    expect(fn.mock.calls).toEqual([['before'], ['after']]);
  });

  it('keeps a steady drag to one call per wait', () => {
    const fn = jest.fn();
    const paced = throttle(fn, 16);
    // A pointer reporting every 4 ms for a second.
    for (let t = 0; t < 1000; t += 4) {
      paced(t);
      jest.advanceTimersByTime(4);
    }
    jest.advanceTimersByTime(16);
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(60);
    expect(fn.mock.calls.length).toBeLessThanOrEqual(64);
    expect(fn.mock.calls.at(-1)).toEqual([996]);
  });
});
