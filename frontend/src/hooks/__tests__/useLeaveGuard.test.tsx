/**
 * Asking before work on the page is left behind, on every way off it: the
 * page's own ways out (the headers' way to the dashboard), the browser's
 * Back on either layout, and a reload or a closed tab. The router has no
 * way to hold a move, so each is held its own way.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useLeaveGuard, useLeavePage } from '../useLeaveGuard';
import { dialogOpened, nextOpening, sheetOpened } from '@/components/campaign/compact/sheetHistory';

const page = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router', () => ({ useNavigate: () => page.navigate }));

/** Whether the browser's current history entry is one held by a sheet, a dialog or a guard. */
const onHeldEntry = () => (window.history.state as Record<string, unknown> | null)?.cozyvttSheet === true;

/** The campaign page's address, with the dashboard before it. */
function arriveAt(path: string) {
  window.history.pushState({}, '', '/dashboard');
  window.history.pushState({}, '', path);
}

/** The browser's Back, and the moment it takes to land. */
async function pressBack() {
  act(() => { window.history.back(); });
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
}

/** A question the test answers. */
function question() {
  let answer: ((leave: boolean) => void) | null = null;
  const ask = vi.fn(() => new Promise<boolean>((resolve) => { answer = resolve; }));
  return { ask, answer: async (leave: boolean) => { await act(async () => { answer?.(leave); await Promise.resolve(); }); } };
}

let leave: ((to: string) => void) | null = null;
function Page({ active, ask, holdBack = true }: { active: boolean; ask: () => Promise<boolean>; holdBack?: boolean }) {
  useLeaveGuard(active, ask, { holdBack });
  leave = useLeavePage();
  return null;
}

/** The router's move, as BrowserRouter makes it. */
const routerMove = (to: string, options?: { replace?: boolean }) => {
  if (options?.replace) window.history.replaceState({}, '', to);
  else window.history.pushState({}, '', to);
};

/**
 * A page whose work ends in the same moment as the question's yes, as
 * Discard my painting drops the paint in its click: the yes and the end of
 * the work are one update.
 */
let answerAndDrop: ((leave: boolean) => void) | null = null;
function WorkPage({ onPhone = false }: { onPhone?: boolean }) {
  const [active, setActive] = useState(true);
  const ask = () => {
    // On a phone the question's own dialog holds an entry until it closes.
    const dialog = onPhone ? dialogOpened(() => undefined, nextOpening()) : null;
    return new Promise<boolean>((resolve) => {
      answerAndDrop = (leave) => {
        if (leave) setActive(false);
        resolve(leave);
        if (dialog) queueMicrotask(() => dialog.release());
      };
    });
  };
  useLeaveGuard(active, ask, { holdBack: true });
  leave = useLeavePage();
  return null;
}
/** Answer in one click, the work dropped with a yes, and let the history settle. */
async function answerInOneClick(yes: boolean) {
  act(() => { answerAndDrop?.(yes); });
  await act(() => new Promise((resolve) => setTimeout(resolve, 40)));
}

beforeEach(() => {
  page.navigate.mockReset();
  answerAndDrop = null;
  arriveAt('/campaigns/c1');
});
afterEach(async () => {
  cleanup();
  await waitFor(() => expect(onHeldEntry()).toBe(false));
});

describe("the page's own ways out", () => {
  it('leave at once with nothing to ask about', () => {
    const { ask } = question();
    render(<Page active={false} ask={ask} />);
    act(() => { leave!('/dashboard'); });
    expect(ask).not.toHaveBeenCalled();
    expect(page.navigate).toHaveBeenCalledWith('/dashboard', { replace: false });
  });

  it('ask first, stay on a no, and leave on a yes in place of the held entry', async () => {
    // The router's move, as BrowserRouter makes it.
    page.navigate.mockImplementation((to: string, options?: { replace?: boolean }) => {
      if (options?.replace) window.history.replaceState({}, '', to);
      else window.history.pushState({}, '', to);
    });
    const q = question();
    render(<Page active ask={q.ask} />);
    expect(onHeldEntry()).toBe(true);
    act(() => { leave!('/characters'); });
    expect(q.ask).toHaveBeenCalledTimes(1);
    await q.answer(false);
    expect(page.navigate).not.toHaveBeenCalled();

    act(() => { leave!('/characters'); });
    await q.answer(true);
    await waitFor(() => expect(page.navigate).toHaveBeenCalledWith('/characters', { replace: true }));
    // The entry was released in place: nothing went Back under the move.
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(window.location.pathname).toBe('/characters');
  });
});

describe("the browser's Back", () => {
  it('asks, and stays on the page on a no, ready to ask again', async () => {
    const q = question();
    render(<Page active ask={q.ask} />);
    await pressBack();
    expect(q.ask).toHaveBeenCalledTimes(1);
    await q.answer(false);
    expect(window.location.pathname).toBe('/campaigns/c1');
    expect(onHeldEntry()).toBe(true);
    await pressBack();
    expect(q.ask).toHaveBeenCalledTimes(2);
  });

  it('goes on back past the page on a yes', async () => {
    const q = question();
    render(<Page active ask={q.ask} />);
    await pressBack();
    await q.answer(true);
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
  });

  it('goes on back past the page on a yes given in a dialog that holds an entry of its own, as one does on a phone', async () => {
    let answer: ((leave: boolean) => void) | null = null;
    const ask = () => {
      // The question's dialog, whose focus trap holds the entry on a phone until it closes.
      const dialog = dialogOpened(() => undefined, nextOpening());
      return new Promise<boolean>((resolve) => {
        answer = (leave) => {
          resolve(leave);
          queueMicrotask(() => dialog.release());
        };
      });
    };
    render(<Page active ask={ask} />);
    await pressBack();
    await act(async () => { answer?.(true); await Promise.resolve(); });
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
  });

  it('asks once for a second Back pressed while it asks', async () => {
    const q = question();
    render(<Page active ask={q.ask} />);
    await pressBack();
    await pressBack();
    expect(q.ask).toHaveBeenCalledTimes(1);
    await q.answer(false);
  });

  it('is left to the page when it does not hold Back, and holds nothing with no work', async () => {
    const q = question();
    const { rerender } = render(<Page active ask={q.ask} holdBack={false} />);
    expect(onHeldEntry()).toBe(false);
    rerender(<Page active={false} ask={q.ask} />);
    expect(onHeldEntry()).toBe(false);
  });

  it('lets the entry go when the work is saved, and Back then leaves without asking', async () => {
    const q = question();
    const { rerender } = render(<Page active ask={q.ask} />);
    expect(onHeldEntry()).toBe(true);
    rerender(<Page active={false} ask={q.ask} />);
    await waitFor(() => expect(onHeldEntry()).toBe(false));
    await pressBack();
    expect(q.ask).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/dashboard');
  });
});

describe('a yes that ends the work in the same moment, as Discard does', () => {
  it.each([[false, 'a computer'], [true, 'a phone']])('leaves by Back past the page (on a phone: %s)', async (onPhone) => {
    render(<WorkPage onPhone={onPhone} />);
    await pressBack();
    expect(answerAndDrop).not.toBeNull();
    await answerInOneClick(true);
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
    await act(() => new Promise((resolve) => setTimeout(resolve, 40)));
    expect(window.location.pathname).toBe('/dashboard');
  });

  it.each([[false, 'a computer'], [true, 'a phone']])("leaves by the header's way, and stays gone (on a phone: %s)", async (onPhone) => {
    page.navigate.mockImplementation(routerMove);
    render(<WorkPage onPhone={onPhone} />);
    act(() => { leave!('/characters'); });
    expect(answerAndDrop).not.toBeNull();
    await answerInOneClick(true);
    expect(page.navigate).toHaveBeenCalledWith('/characters', { replace: true });
    await act(() => new Promise((resolve) => setTimeout(resolve, 40)));
    expect(window.location.pathname).toBe('/characters');
  });

  it('stays on a no, the entry held for the next Back', async () => {
    render(<WorkPage />);
    await pressBack();
    await answerInOneClick(false);
    expect(window.location.pathname).toBe('/campaigns/c1');
    expect(onHeldEntry()).toBe(true);
  });
});

describe('asked once', () => {
  it("for the header's way pressed twice before the question shows", async () => {
    const q = question();
    render(<Page active ask={q.ask} />);
    act(() => { leave!('/dashboard'); leave!('/dashboard'); });
    await act(async () => { await Promise.resolve(); });
    expect(q.ask).toHaveBeenCalledTimes(1);
    await q.answer(false);
  });
});

describe('a sheet open before the work began', () => {
  it('is closed by Back first, as before, and only then is the page asked about', async () => {
    const closed = vi.fn();
    const sheet = sheetOpened(closed);
    const q = question();
    render(<Page active ask={q.ask} />);
    await pressBack();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(q.ask).not.toHaveBeenCalled();
    sheet.release();
    await pressBack();
    expect(q.ask).toHaveBeenCalledTimes(1);
    await q.answer(false);
  });
});

describe('a reload or a closed tab', () => {
  it('is listened for only while there is work', () => {
    const added = vi.spyOn(window, 'addEventListener');
    try {
      const { ask } = question();
      const { rerender } = render(<Page active={false} ask={ask} />);
      expect(added.mock.calls.filter(([type]) => type === 'beforeunload')).toEqual([]);
      rerender(<Page active ask={ask} />);
      expect(added.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1);
    } finally {
      added.mockRestore();
    }
  });

  it('sets returnValue as well, which older browsers ask on', () => {
    const { ask } = question();
    render(<Page active ask={ask} />);
    const event = new Event('beforeunload', { cancelable: true }) as Event & { returnValue: unknown };
    Object.defineProperty(event, 'returnValue', { value: undefined, writable: true });
    window.dispatchEvent(event);
    expect(event.returnValue).toBe('');
  });

  it("gets the browser's question while there is work, and none after", () => {
    const { ask } = question();
    const { rerender } = render(<Page active ask={ask} />);
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(true);
    rerender(<Page active={false} ask={ask} />);
    expect(unload()).toBe(false);
  });
});
