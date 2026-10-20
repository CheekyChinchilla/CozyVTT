/**
 * The live connection falls back to polling when its WebSocket is refused.
 *
 * The page's security policy names the WebSocket on the page's own host. A
 * reverse proxy that does not pass the browser's host name on, or a browser
 * that will not match it, refuses the WebSocket; without trying the next
 * transport the live table did not connect at all.
 */
import { it, expect, vi } from 'vitest';

const options: Record<string, unknown>[] = [];
vi.mock('socket.io-client', () => ({
  io: (_url: string, opts: Record<string, unknown>) => {
    options.push(opts);
    return { on: vi.fn(), once: vi.fn(), off: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), emit: vi.fn(), connected: false, io: { on: vi.fn(), off: vi.fn() } };
  },
}));
vi.mock('@/services/api', () => ({ api: {}, default: {} }));

import socketService from '../socket';

it('tries polling when the WebSocket is refused', () => {
  void socketService.connect('campaign-1').catch(() => undefined);
  expect(options[0]).toMatchObject({ transports: ['websocket', 'polling'], tryAllTransports: true });
});
