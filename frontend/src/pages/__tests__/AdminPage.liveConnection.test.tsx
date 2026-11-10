/**
 * The status card's WS light says whether this browser can open a live
 * connection, and how.
 *
 * It was green whenever the backend ran, because the server could only say
 * that its own live-connection service existed. A proxy in front that refused
 * WebSocket connections left it green while every table fell back to polling,
 * or could not connect at all. The card now opens a connection of its own, as
 * a campaign page does, and says Working, Polling only or Down.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import AdminPage from '../AdminPage';
import deploymentGuide from '../../../../docs/DEPLOYMENT.md?raw';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', displayName: 'Root', platformRole: 'ADMIN' } }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ refreshAppearance: vi.fn() }),
}));

const adminService = vi.hoisted(() => ({
  getStats: vi.fn(),
  getHealth: vi.fn(),
}));
vi.mock('@/services/admin.service', () => ({ adminService }));
vi.mock('@/services/api', () => ({ api: {}, default: {} }));

/**
 * socket.io's client, as far as the check uses it: each connection it opens,
 * the options it was opened with, what it sent and whether it was closed. A
 * test plays the server's side with `fire`.
 */
const live = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;
  class Emitter {
    private readonly listeners = new Map<string, Listener[]>();
    on(event: string, listener: Listener): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      return this;
    }
    fire(event: string, ...args: unknown[]): void {
      for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }
  }
  /** The connection underneath: the transport it is on, and its `upgrade`. */
  class FakeEngine extends Emitter {
    transport = { name: 'polling' };
  }
  class FakeSocket extends Emitter {
    readonly io = { engine: new FakeEngine() };
    readonly emit = vi.fn();
    readonly disconnect = vi.fn(() => this);
    constructor(
      readonly url: string,
      readonly options: Record<string, unknown>
    ) {
      super();
    }
    /** The server took the connection, over this transport. */
    connectOver(transport: 'websocket' | 'polling'): void {
      this.io.engine.transport.name = transport;
      this.fire('connect');
    }
  }
  const sockets: FakeSocket[] = [];
  return {
    sockets,
    io: (url: string, options: Record<string, unknown>) => {
      const socket = new FakeSocket(url, options);
      sockets.push(socket);
      return socket;
    },
  };
});
vi.mock('socket.io-client', () => ({ io: live.io }));

const healthy = { status: 'healthy', services: { api: 'ok', database: 'ok', websocket: 'ok' }, connections: 2 };

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );

/** What a row of the status card says, after its label. */
const part = (label: string) => {
  const row = screen.getByText(label).parentElement;
  return row?.textContent?.slice(label.length).trim();
};

/** The one connection the card opened. */
async function opened() {
  await waitFor(() => expect(live.sockets).toHaveLength(1));
  return live.sockets[0];
}

/** It sent the server nothing: no `authenticate`, so it never joined a table. */
function sentNothing(socket: (typeof live.sockets)[number]) {
  expect(socket.emit).not.toHaveBeenCalled();
}

/** The headings of the deployment guide, as GitHub turns them into links. */
function deploymentGuideSections(): string[] {
  return [...deploymentGuide.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) =>
    heading.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-')
  );
}

/** A link into the deployment guide, at a section it has. */
function expectGuideLink(link: HTMLElement, section: string) {
  const href = link.getAttribute('href') ?? '';
  expect(href).toBe(`https://github.com/CheekyChinchilla/CozyVTT/blob/main/docs/DEPLOYMENT.md#${section}`);
  expect(deploymentGuideSections()).toContain(section);
}

beforeEach(() => {
  vi.clearAllMocks();
  live.sockets.length = 0;
  adminService.getStats.mockResolvedValue({ assetBreakdown: [], totalStorageBytes: 0 });
  adminService.getHealth.mockResolvedValue(healthy);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the WS light on the status card', () => {
  it('does not say Working before the check has answered', async () => {
    renderPage();

    await waitFor(() => expect(part('DB')).toBe('Working'));
    expect(part('WS')).toBe('Checking…');
    expect(screen.queryByText('Healthy')).toBeNull();
  });

  it('says Working when the connection is made over WebSocket, and closes it', async () => {
    renderPage();
    const socket = await opened();

    act(() => socket.connectOver('websocket'));

    await waitFor(() => expect(part('WS')).toBe('Working'));
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(socket.disconnect).toHaveBeenCalled();
    sentNothing(socket);
  });

  it('says Working when a polling connection moves to WebSocket', async () => {
    renderPage();
    const socket = await opened();

    act(() => {
      socket.connectOver('polling');
      socket.io.engine.fire('upgrade', { name: 'websocket' });
    });

    await waitFor(() => expect(part('WS')).toBe('Working'));
    expect(socket.disconnect).toHaveBeenCalled();
    sentNothing(socket);
  });

  it('says Polling only when the connection never moves to WebSocket, and points at the proxy settings', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPage();
    const socket = await opened();

    act(() => socket.connectOver('polling'));
    expect(part('WS')).toBe('Checking…');
    await act(() => vi.advanceTimersByTimeAsync(60_000));

    expect(part('WS')).toBe('Polling only');
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText(/Tables work, but slower/)).toBeInTheDocument();
    expectGuideLink(screen.getByRole('link', { name: /WebSocket settings/ }), 'minimum-proxy-requirements');
    expect(socket.disconnect).toHaveBeenCalled();
    sentNothing(socket);
  });

  it('says Down when the connection is refused', async () => {
    renderPage();
    const socket = await opened();

    act(() => socket.fire('connect_error', new Error('xhr poll error')));

    await waitFor(() => expect(part('WS')).toBe('Down'));
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText(/Tables cannot connect/)).toBeInTheDocument();
    expectGuideLink(
      screen.getByRole('link', { name: /Troubleshoot live connections/ }),
      'live-features-dont-work-dice-token-movement-chat'
    );
    expect(socket.disconnect).toHaveBeenCalled();
    sentNothing(socket);
  });

  it('says Down when nothing answers in time, and closes the connection', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPage();
    const socket = await opened();

    await act(() => vi.advanceTimersByTimeAsync(60_000));

    expect(part('WS')).toBe('Down');
    expect(socket.disconnect).toHaveBeenCalled();
    sentNothing(socket);
  });

  it('closes the connection when the page is left before it answers', async () => {
    const { unmount } = renderPage();
    const socket = await opened();

    unmount();

    expect(socket.disconnect).toHaveBeenCalled();
    sentNothing(socket);
  });

  it('opens a connection of its own that does not retry, as a campaign page would', async () => {
    renderPage();
    const socket = await opened();

    expect(socket.options).toMatchObject({
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      forceNew: true,
      reconnection: false,
    });
  });

  it('checks once the server has answered, so the count of live connections leaves it out', async () => {
    let answer: (value: typeof healthy) => void = () => undefined;
    adminService.getHealth.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderPage();
    await waitFor(() => expect(adminService.getHealth).toHaveBeenCalled());
    expect(live.sockets).toHaveLength(0);

    act(() => answer(healthy));

    await opened();
    expect(screen.getByText('2 live connections')).toBeInTheDocument();
  });

  it('checks again when Refresh is pressed', async () => {
    renderPage();
    const first = await opened();
    act(() => first.connectOver('websocket'));
    await waitFor(() => expect(part('WS')).toBe('Working'));

    await userEvent.click(screen.getByRole('button', { name: /Refresh/ }));

    await waitFor(() => expect(live.sockets).toHaveLength(2));
    expect(part('WS')).toBe('Checking…');
    act(() => live.sockets[1].fire('connect_error', new Error('websocket error')));
    await waitFor(() => expect(part('WS')).toBe('Down'));
  });
});
