/**
 * The join count starts again for each campaign.
 *
 * A page runs its reconnect catch-up on every join after the first. The
 * count was kept across a switch to another campaign, so that campaign's
 * first join looked like a rejoin and ran a catch-up for the campaign the
 * page was leaving.
 */

import { it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

type Handler = (...args: unknown[]) => void;

let routeId = 'campaign-1';
const clientHandlers: Record<string, Handler> = {};

vi.mock('react-router-dom', () => ({ useParams: () => ({ id: routeId }) }));
vi.mock('@/services/api', () => ({ default: { pingSession: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('@/services/socket', () => ({
  default: {
    connect: vi.fn().mockResolvedValue(undefined),
    onRebuilt: () => () => {},
    isConnectInProgress: () => false,
    disconnect: vi.fn(),
    getSocket: () => ({ connected: true, on: vi.fn(), disconnect: vi.fn(), io: { on: vi.fn() } }),
    on: (event: string, cb: Handler) => { clientHandlers[event] = cb; },
    off: vi.fn(),
    startHeartbeat: () => () => {},
  },
}));

import { WebSocketProvider, useWebSocket } from '../WebSocketContext';

function Probe() {
  const { joinedEpoch } = useWebSocket();
  return <div data-testid="epoch">{joinedEpoch}</div>;
}

it('counts joins from zero again when the page moves to another campaign', async () => {
  const view = render(<WebSocketProvider><Probe /></WebSocketProvider>);
  await act(async () => { clientHandlers.authenticated(); });
  await act(async () => { clientHandlers.authenticated(); });
  expect(screen.getByTestId('epoch').textContent).toBe('2');

  routeId = 'campaign-2';
  await act(async () => { view.rerender(<WebSocketProvider><Probe /></WebSocketProvider>); });
  expect(screen.getByTestId('epoch').textContent).toBe('0');
});
