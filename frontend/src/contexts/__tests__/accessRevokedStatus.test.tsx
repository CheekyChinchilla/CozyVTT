/**
 * The connection badge stops saying Connected once the table has ended.
 *
 * A removed member's or a deleted campaign's connection stays open, so the
 * badge stayed green while every message went nowhere. After
 * `campaign.access.revoked` it shows the error, with the reason as its
 * detail, and keeps it when the server then closes the connection.
 */

import { it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

type Handler = (...args: unknown[]) => void;

const clientHandlers: Record<string, Handler> = {};
const socketHandlers: Record<string, Handler> = {};
const fakeSocket = {
  connected: true,
  on: (event: string, cb: Handler) => { socketHandlers[event] = cb; },
  disconnect: vi.fn(),
  io: { on: vi.fn() },
};

vi.mock('react-router-dom', () => ({ useParams: () => ({ id: 'campaign-1' }) }));
vi.mock('@/services/api', () => ({ default: { pingSession: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('@/services/socket', () => ({
  default: {
    connect: vi.fn().mockResolvedValue(undefined),
    onRebuilt: () => () => {},
    onCreated: () => () => {},
    isConnectInProgress: () => false,
    disconnect: vi.fn(),
    getSocket: () => fakeSocket,
    on: (event: string, cb: Handler) => { clientHandlers[event] = cb; },
    off: vi.fn(),
    startHeartbeat: () => () => {},
  },
}));

import { WebSocketProvider, useWebSocket } from '../WebSocketContext';

function Probe() {
  const { status, error } = useWebSocket();
  return <div data-testid="status">{status}|{error ?? ''}</div>;
}

it('shows the error and the reason, and keeps them when the connection closes', async () => {
  render(<WebSocketProvider><Probe /></WebSocketProvider>);
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('connected|'));

  act(() => clientHandlers['campaign.access.revoked']?.({ campaignId: 'campaign-1', reason: 'removed', message: 'You were removed from this campaign.' }));
  expect(screen.getByTestId('status').textContent).toBe('error|You were removed from this campaign.');

  act(() => socketHandlers.disconnect?.('io server disconnect'));
  expect(screen.getByTestId('status').textContent).toBe('error|You were removed from this campaign.');
});
