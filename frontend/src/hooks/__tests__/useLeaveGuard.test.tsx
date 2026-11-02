/**
 * Asking before work on the page is left behind, on every way off it: the
 * page's own ways out (the headers' way to the dashboard), the browser's
 * Back on either layout, and a reload or a closed tab. The router has no
 * way to hold a move, so each is held its own way.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useLeaveGuard, useLeavePage } from '../useLeaveGuard';
import { dialogOpened, nextOpening } from '@/components/campaign/compact/sheetHistory';

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

beforeEach(() => {
  page.navigate.mockReset();
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

describe('a reload or a closed tab', () => {
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
