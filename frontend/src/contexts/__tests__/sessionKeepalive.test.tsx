/**
 * The campaign page keeps the session from running out while connected.
 *
 * Play happens over the live connection, which makes no HTTP requests, so the
 * page pings the session every ten minutes while connected, and stops when it
 * is not.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

type Handler = (...args: unknown[]) => void;

const socketHandlers: Record<string, Handler> = {};
const fakeSocket = {
  connected: true,
  on: (event: string, cb: Handler) => { socketHandlers[event] = cb; },
  disconnect: vi.fn(),
  io: { on: vi.fn() },
};
const pingSession = vi.fn();

vi.mock('react-router-dom', () => ({ useParams: () => ({ id: 'campaign-1' }) }));
vi.mock('@/services/api', () => ({ default: { pingSession: () => pingSession() } }));
vi.mock('@/services/socket', () => ({
  default: {
    connect: vi.fn().mockResolvedValue(undefined),
    onRebuilt: () => () => {},
    isConnectInProgress: () => false,
    disconnect: vi.fn(),
    getSocket: () => fakeSocket,
    on: vi.fn(),
    off: vi.fn(),
    startHeartbeat: () => () => {},
  },
}));

import { WebSocketProvider, useWebSocket } from '../WebSocketContext';

function Probe() {
  const { status } = useWebSocket();
  return <div data-testid="status">{status}</div>;
}

const MINUTE = 60 * 1000;

describe('the campaign page session keepalive', () => {
  beforeEach(() => {
    pingSession.mockReset().mockResolvedValue(undefined);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pings every ten minutes while connected, and stops when disconnected', async () => {
    render(<WebSocketProvider><Probe /></WebSocketProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('connected'));

    await act(async () => { await vi.advanceTimersByTimeAsync(10 * MINUTE); });
    expect(pingSession).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * MINUTE); });
    expect(pingSession).toHaveBeenCalledTimes(2);

    act(() => socketHandlers.disconnect?.('transport close'));
    await act(async () => { await vi.advanceTimersByTimeAsync(30 * MINUTE); });
    expect(pingSession).toHaveBeenCalledTimes(2);
  });
});
