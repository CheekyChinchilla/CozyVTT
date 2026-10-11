/**
 * The campaign page's components keep hearing the server after a reconnect.
 *
 * The socket client throws its socket.io instance away and builds a new one
 * on every manual reconnect (the browser coming back online, Retry, a
 * server-side disconnect), and puts back only the listeners registered
 * through its own table. A listener a component bound straight to
 * `getSocket()` died with the old socket and was never rebound: after any
 * such reconnect a player stopped receiving map changes, so the DM's Hide and
 * Obscure never reached them, and spirit-plane and vibe changes went the same
 * way.
 *
 * Each component here is mounted on the real socket client over a stand-in
 * for socket.io, and the client is made to reconnect and rejoin. Every event
 * the component listened for on the old socket must have a listener on the
 * new one, however the component bound it: through the client's table, or
 * to the socket itself from an effect that runs again on each rejoin. This replaces a check that searched
 * the components' source for `.on('<event>'`, which a helper or an event name
 * held in a constant got past.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { createElement, Fragment, useEffect, type ReactElement, type ReactNode } from 'react';

/** Stand-in for a socket.io Socket, recording what is attached to it. */
class FakeSocket {
  handlers = new Map<string, Set<(data: unknown) => void>>();
  connected = false;

  on(event: string, cb: (data: unknown) => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(cb);
    return this;
  }
  off(event: string, cb?: (data: unknown) => void) {
    if (cb) this.handlers.get(event)?.delete(cb);
    else this.handlers.delete(event);
    return this;
  }
  removeAllListeners() {
    this.handlers.clear();
    return this;
  }
  disconnect() {
    this.connected = false;
    return this;
  }
  emit() {
    return this;
  }
  fire(event: string, data?: unknown) {
    for (const cb of this.handlers.get(event) ?? []) cb(data);
  }
  count(event: string) {
    return this.handlers.get(event)?.size ?? 0;
  }
}

const sockets = vi.hoisted(() => [] as unknown[]);

vi.mock('socket.io-client', () => ({
  io: () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  },
}));

// The provider's join count, kept as the real one keeps it: each time the
// connection joins the campaign, the first time and every rejoin, it goes up,
// and the components that bind per connection bind again.
vi.mock('@/contexts/WebSocketContext', async () => {
  const { useSyncExternalStore } = await import('react');
  const client = (await import('@/services/socket')).default;
  let joinedEpoch = 0;
  const listeners = new Set<() => void>();
  client.on('authenticated', () => {
    joinedEpoch += 1;
    listeners.forEach((l) => l());
  });
  const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
  return {
    useWebSocket: () => ({
      socket: client, status: 'connected', reconnectCount: 0,
      joinedEpoch: useSyncExternalStore(subscribe, () => joinedEpoch),
    }),
  };
});

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: ReactNode } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return createElement('div', plain, children);
  } }),
  AnimatePresence: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
}));
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: 'campaign-1' }) }));

const MAP = vi.hoisted(() => ({
  id: 'map-a', campaignId: 'campaign-1', name: 'Map A', imageUrl: '/api/assets/maps/x', width: 20, height: 20,
  gridSize: 50, tokens: [], wallSegments: [], lights: [], fogEnabled: false, lightingEnabled: false,
  globalIllumination: true, explorationEnabled: false,
}));

vi.mock('@/contexts/CampaignContext', () => {
  const noop = () => undefined;
  const campaign = { id: 'campaign-1', name: 'Test', status: 'ACTIVE', spiritLayerEnabled: false, memberships: [], characters: [] };
  const value = {
    currentMap: MAP, setCurrentMap: noop, userRole: 'PLAYER', campaign, updateCampaignSpiritLayer: noop,
    dmViewBothPlanes: false, playerSpiritVisible: false, setPlayerSpiritVisible: noop, activeVibeEffect: null,
    updateVibe: noop, activeAtmosphereEffect: null, characterHpCache: {},
  };
  return { useCampaign: () => value };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }));
vi.mock('@/services/dice.service', () => ({ getDiceRolls: vi.fn().mockResolvedValue([]) }));
vi.mock('@/services/message.service', () => ({
  getMessages: vi.fn().mockResolvedValue({ messages: [], pagination: { hasMore: false } }),
}));
vi.mock('@/services/map.service', () => ({
  default: { updateMap: vi.fn(), getMaps: vi.fn().mockResolvedValue([]), getMap: vi.fn() },
}));
vi.mock('@/services/api', () => {
  const client = new Proxy({}, {
    get: (_t, prop: string) => (prop === 'listDiceMacros' ? vi.fn().mockResolvedValue({ macros: [] }) : vi.fn().mockResolvedValue({})),
  });
  return { api: client, default: client };
});
vi.mock('../DiceMacroManager', () => ({ default: () => null }));

import socketClient from '@/services/socket';
import MapCanvas from '../MapCanvas';
import InitiativeTracker from '../InitiativeTracker';
import DiceRoller from '../DiceRoller';
import ChatPanel from '../ChatPanel';
import { useInitiativeSync } from '@/hooks/useInitiativeSync';

/** The campaign page's initiative subscription, which the tracker reads from the store. */
function InitiativeSync() {
  useInitiativeSync();
  return null;
}

const current = () => sockets[sockets.length - 1] as FakeSocket;

/** A full connection, handshake included, as socketListenerRegistry.test.ts plays it out. */
async function connect() {
  const pending = socketClient.connect('campaign-1');
  await Promise.resolve();
  current().fire('connected');
  current().fire('authenticated');
  await pending;
}

/** Every event the socket has a listener for, with how many. */
const listening = (socket: FakeSocket) => new Map([...socket.handlers].map(([event, set]) => [event, set.size]));

/**
 * The events the element listens for on the socket in use when it mounts,
 * and those of them with no listener on the socket a reconnect builds.
 */
async function acrossReconnect(element: ReactElement): Promise<{ heard: string[]; lost: string[] }> {
  await connect();
  const before = listening(current());
  const view = render(element);
  await act(async () => { await Promise.resolve(); });
  const after = listening(current());
  const heard = [...after].filter(([event, n]) => n > (before.get(event) ?? 0)).map(([event]) => event);

  await act(async () => { await connect(); });
  const lost = heard.filter((event) => current().count(event) === 0);
  view.unmount();
  return { heard, lost };
}

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: () => undefined, configurable: true });
});

beforeEach(() => {
  socketClient.disconnect();
});

describe('after a reconnect, the page still hears every event it listened for', () => {
  it.each([
    ['the map', () => createElement(MapCanvas), ['map.changed', 'token.moved', 'map.pinged', 'spirit_layer.toggled', 'vibe.updated']],
    ['the initiative tracker', () => createElement(InitiativeTracker), []],
    ['the initiative order the page keeps', () => createElement(InitiativeSync), ['initiative.state']],
    ['the dice roller', () => createElement(DiceRoller), ['dice.rolled']],
    ['the chat', () => createElement(ChatPanel), ['chat.message']],
  ])('%s', async (_name, element, expected) => {
    const { heard, lost } = await acrossReconnect(element());

    // A floor, so a mount that listened for nothing it should cannot pass.
    // The tracker listens for nothing of its own: it reads the store.
    expect(heard).toEqual(expect.arrayContaining(expected));
    expect(lost).toEqual([]);
  });

  it('is told apart from a component that binds to the socket once, which loses its listener', async () => {
    function BindsToTheSocket() {
      useEffect(() => {
        const raw = socketClient.getSocket();
        const handler = () => undefined;
        raw?.on('map.changed', handler);
        return () => { raw?.off('map.changed', handler); };
      }, []);
      return null;
    }

    const { heard, lost } = await acrossReconnect(createElement(BindsToTheSocket));

    expect(heard).toEqual(['map.changed']);
    expect(lost).toEqual(['map.changed']);
  });
});
