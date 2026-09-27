/**
 * The connection status follows socket.io's own reconnects.
 *
 * socket.io-client v4 emits `reconnect_attempt`, `reconnect` and
 * `reconnect_failed` on the Manager (`socket.io`), never on the Socket. The
 * provider listened on the Socket, so after an automatic reconnect the badge
 * stayed on "disconnected", `reconnectCount` never ticked, and everything
 * that waited for the status to come back waited for good.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

type Handler = (...args: unknown[]) => void;

const socketHandlers: Record<string, Handler> = {};
const managerHandlers: Record<string, Handler> = {};
const fakeSocket = {
  connected: true,
  on: (event: string, cb: Handler) => { socketHandlers[event] = cb; },
  disconnect: vi.fn(),
  io: { on: (event: string, cb: Handler) => { managerHandlers[event] = cb; } },
};

vi.mock('react-router-dom', () => ({ useParams: () => ({ id: 'campaign-1' }) }));
vi.mock('@/services/api', () => ({ default: { pingSession: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('@/services/socket', () => ({
  default: {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    getSocket: () => fakeSocket,
    on: vi.fn(),
    off: vi.fn(),
    startHeartbeat: () => () => {},
  },
}));

import { WebSocketProvider, useWebSocket } from '../WebSocketContext';

function Probe() {
  const { status, reconnectCount } = useWebSocket();
  return <div data-testid="status">{status}:{reconnectCount}</div>;
}

describe('connection status across socket.io reconnects', () => {
  beforeEach(() => {
    for (const k of Object.keys(socketHandlers)) delete socketHandlers[k];
    for (const k of Object.keys(managerHandlers)) delete managerHandlers[k];
  });

  it('follows the Manager\'s reconnect lifecycle and counts each reconnect', async () => {
    render(<WebSocketProvider><Probe /></WebSocketProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('connected:0'));

    act(() => socketHandlers.disconnect?.('transport close'));
    expect(screen.getByTestId('status').textContent).toBe('disconnected:0');

    expect(managerHandlers.reconnect_attempt).toBeDefined();
    act(() => managerHandlers.reconnect_attempt!());
    expect(screen.getByTestId('status').textContent).toBe('connecting:0');

    expect(managerHandlers.reconnect).toBeDefined();
    act(() => managerHandlers.reconnect!());
    expect(screen.getByTestId('status').textContent).toBe('connected:1');

    act(() => managerHandlers.reconnect_failed!());
    expect(screen.getByTestId('status').textContent).toBe('error:1');
  });
});
