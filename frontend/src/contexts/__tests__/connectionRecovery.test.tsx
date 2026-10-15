/**
 * How a campaign page's connection comes back, end to end through the real
 * socket client and provider, with socket.io itself stood in for.
 *
 * - Retry after Connection Error runs the same catch-up as an automatic
 *   reconnect, so a pause or chat sent during the outage is not missed.
 * - A first connect that fails, then succeeds on socket.io's own retry,
 *   shows Connected: the badge's listeners were attached only after a
 *   successful connect.
 * - socket.io keeps retrying past its first few attempts, and a server
 *   restart is retried for as long as it takes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

type Handler = (...args: unknown[]) => void;

class FakeEmitter {
  handlers = new Map<string, Set<Handler>>();
  on(event: string, cb: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(cb);
    return this;
  }
  off(event: string, cb?: Handler) {
    if (cb) this.handlers.get(event)?.delete(cb);
    else this.handlers.delete(event);
    return this;
  }
  removeAllListeners() {
    this.handlers.clear();
    return this;
  }
  fire(event: string, ...args: unknown[]) {
    for (const cb of [...(this.handlers.get(event) ?? [])]) cb(...args);
  }
}

/** A socket.io Socket, with its Manager as `io`. */
class FakeSocket extends FakeEmitter {
  connected = false;
  io = new FakeEmitter();
  constructor(public options: Record<string, unknown>) {
    super();
  }
  disconnect() {
    this.connected = false;
    return this;
  }
  emit() {
    return true;
  }
}

const sockets: FakeSocket[] = [];
vi.mock('socket.io-client', () => ({
  io: (_url: string, options: Record<string, unknown>) => {
    const s = new FakeSocket(options);
    sockets.push(s);
    return s;
  },
}));
vi.mock('react-router', () => ({ useParams: () => ({ id: 'campaign-1' }) }));
vi.mock('@/services/api', () => ({
  api: { listCampaigns: vi.fn(), pingSession: vi.fn().mockResolvedValue(undefined) },
  default: { listCampaigns: vi.fn(), pingSession: vi.fn().mockResolvedValue(undefined) },
}));

import { WebSocketProvider, useWebSocket } from '../WebSocketContext';
import ConnectionStatus from '@/components/ConnectionStatus';
import { useOnRejoin } from '@/hooks/useOnRejoin';

const current = () => sockets[sockets.length - 1];
const catchUp = vi.fn();

function Page() {
  const { status, joinedEpoch } = useWebSocket();
  useOnRejoin(joinedEpoch, catchUp);
  return (
    <>
      <p data-testid="status">{status}</p>
      <ConnectionStatus />
    </>
  );
}

/** The server accepts the socket and lets it join the campaign. */
async function serverAccepts(socket: FakeSocket) {
  await act(async () => {
    socket.connected = true;
    socket.fire('connect');
    socket.fire('connected', { userId: 'u1' });
    socket.fire('authenticated', { userId: 'u1', campaignId: 'campaign-1', role: 'PLAYER' });
  });
}

const status = () => screen.getByTestId('status').textContent;

beforeEach(() => {
  vi.useFakeTimers();
  sockets.length = 0;
  catchUp.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Retry after Connection Error', () => {
  it('runs the catch-up once the page has joined again', async () => {
    render(<WebSocketProvider><Page /></WebSocketProvider>);
    await serverAccepts(current());
    expect(status()).toBe('connected');

    // The connection drops and socket.io gives up.
    await act(async () => {
      current().connected = false;
      current().fire('disconnect', 'transport close');
      current().io.fire('reconnect_attempt', 1);
      current().io.fire('reconnect_failed');
    });
    expect(status()).toBe('error');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    await serverAccepts(current());

    expect(status()).toBe('connected');
    expect(catchUp).toHaveBeenCalledTimes(1);
  });
});

describe('a first connect that fails', () => {
  it('shows Connected once socket.io gets through on its own retry', async () => {
    render(<WebSocketProvider><Page /></WebSocketProvider>);
    await act(async () => { current().fire('connect_error', new Error('xhr poll error')); });
    expect(status()).toBe('error');

    // socket.io retries the same socket, and this time the server answers.
    await act(async () => { current().io.fire('reconnect_attempt', 1); });
    await serverAccepts(current());
    await act(async () => { current().io.fire('reconnect', 1); });

    expect(sockets).toHaveLength(1);
    expect(status()).toBe('connected');
  });
});

describe('retrying', () => {
  it('does not stop after a few attempts', async () => {
    render(<WebSocketProvider><Page /></WebSocketProvider>);

    expect(current().options.reconnectionAttempts).toBe(Infinity);
  });

  it('keeps rebuilding the connection through a long server restart', async () => {
    render(<WebSocketProvider><Page /></WebSocketProvider>);
    await serverAccepts(current());

    // The server closes every socket as it stops, and stays down for minutes:
    // each new socket times out without an answer.
    await act(async () => {
      current().connected = false;
      current().fire('disconnect', 'io server disconnect');
    });
    for (let minute = 0; minute < 5; minute++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    }
    const builtWhileDown = sockets.length;
    expect(builtWhileDown).toBeGreaterThan(6);

    // Back up: the next socket gets through.
    for (let waited = 0; sockets.length === builtWhileDown && waited < 60_000; waited += 1000) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    }
    expect(sockets.length).toBeGreaterThan(builtWhileDown);
    await serverAccepts(current());
    expect(status()).toBe('connected');
    expect(catchUp).toHaveBeenCalledTimes(1);
  });
});

describe('coming back to the page', () => {
  it('reconnects at once when a dropped page is shown again', async () => {
    render(<WebSocketProvider><Page /></WebSocketProvider>);
    await serverAccepts(current());
    await act(async () => {
      current().connected = false;
      current().fire('disconnect', 'transport close');
      current().io.fire('reconnect_failed');
    });
    expect(status()).toBe('error');
    const before = sockets.length;

    // A phone's screen comes back on.
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(sockets.length).toBe(before + 1);
    await serverAccepts(current());
    expect(status()).toBe('connected');
    expect(catchUp).toHaveBeenCalledTimes(1);
  });
});
