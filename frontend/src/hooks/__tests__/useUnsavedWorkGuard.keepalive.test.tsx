/**
 * An editor with unsaved changes keeps the session from running out.
 *
 * A session ends after an hour with no requests, and typing into a sheet
 * makes none. The editor now pings the session as soon as it has unsaved
 * changes, since the hour may be nearly up already, and every ten minutes
 * after, and stops once nothing is unsaved.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';

const pingSession = vi.fn();
vi.mock('@/services/api', () => ({
  api: { pingSession: () => pingSession() },
  default: { pingSession: () => pingSession() },
}));

type Hook = typeof import('../useUnsavedWorkGuard');
type Work = typeof import('@/services/unsavedWork');
let useUnsavedWorkGuard: Hook['useUnsavedWorkGuard'];
let work: Work;

function Editor({ unsaved }: { unsaved: boolean }) {
  const signedOut = useUnsavedWorkGuard(unsaved);
  return <p>{signedOut ? 'signed out' : 'signed in'}</p>;
}

const MINUTE = 60 * 1000;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  pingSession.mockReset().mockResolvedValue(undefined);
  ({ useUnsavedWorkGuard } = await import('../useUnsavedWorkGuard'));
  work = await import('@/services/unsavedWork');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the session keepalive in an editor', () => {
  it('sends nothing while nothing is unsaved', async () => {
    render(<Editor unsaved={false} />);
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    expect(pingSession).not.toHaveBeenCalled();
  });

  it('pings at once when changes become unsaved, then every ten minutes', async () => {
    render(<Editor unsaved />);
    await vi.advanceTimersByTimeAsync(0);
    expect(pingSession).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(pingSession).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(pingSession).toHaveBeenCalledTimes(3);
  });

  it('stops once the changes are saved or discarded', async () => {
    const { rerender } = render(<Editor unsaved />);
    await vi.advanceTimersByTimeAsync(0);
    rerender(<Editor unsaved={false} />);

    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    expect(pingSession).toHaveBeenCalledTimes(1);
  });

  it('does not ping again when changes come and go within a minute', async () => {
    const { rerender } = render(<Editor unsaved />);
    await vi.advanceTimersByTimeAsync(0);
    rerender(<Editor unsaved={false} />);
    rerender(<Editor unsaved />);
    await vi.advanceTimersByTimeAsync(0);

    expect(pingSession).toHaveBeenCalledTimes(1);
  });

  it('a ping that succeeds clears a signed-out notice', async () => {
    const { container } = render(<Editor unsaved />);
    await vi.advanceTimersByTimeAsync(0);
    work.reportSignedOut();
    await vi.advanceTimersByTimeAsync(0);
    expect(container.textContent).toBe('signed out');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * MINUTE);
    });

    expect(container.textContent).toBe('signed in');
  });
});
