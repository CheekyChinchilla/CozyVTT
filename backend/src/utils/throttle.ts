/**
 * Pace a function to at most one call per `wait` milliseconds.
 *
 * The first call goes through at once. Calls that arrive while waiting are
 * not dropped outright: the last of them goes through when the wait is over,
 * with its own arguments, so a drag always ends on the position the pointer
 * last reported. After that call a full wait passes before the next.
 *
 * Time is read from performance.now(), which only counts up: the wall clock
 * can be set back, and a wait measured on it would then hold calls for as
 * long as the clock moved.
 */
export function throttle<A extends unknown[]>(fn: (...args: A) => unknown, wait: number): (...args: A) => void {
  let lastCall = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;

  const call = (args: A): void => {
    lastCall = performance.now();
    fn(...args);
  };

  return (...args: A): void => {
    const remaining = wait - (performance.now() - lastCall);
    if (remaining <= 0 && timer === undefined) {
      call(args);
      return;
    }
    pending = args;
    if (timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined;
        const next = pending;
        pending = undefined;
        if (next) call(next);
      }, Math.max(remaining, 0));
    }
  };
}
