/**
 * The map's toolbar: what a screen reader calls its buttons.
 *
 * The stand-ins are those of MapCanvasTools.test.tsx: the role and current
 * map live in a store the test changes, and the socket records what the page
 * sends. Canvas drawing is switched off.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CampaignMap } from '@/types';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'DM' as string,
    currentMap: null as unknown,
    playerSpiritVisible: false as boolean,
  };
  const handlers = new Map<string, Set<(data: never) => void>>();
  const sent: Array<[string, unknown]> = [];
  const raw = {
    on(event: string, fn: (data: never) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
      return raw;
    },
    off(event: string, fn: (data: never) => void) {
      handlers.get(event)?.delete(fn);
      return raw;
    },
    emit(event: string, payload: unknown) {
      sent.push([event, payload]);
      return raw;
    },
  };
  return {
    state,
    handlers,
    sent,
    raw,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    snapshot: () => version,
    set(patch: Partial<typeof state>) {
      Object.assign(state, patch);
      version += 1;
      listeners.forEach((l) => l());
    },
  };
});

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/CampaignContext', async () => {
  const { useSyncExternalStore } = await import('react');
  const noop = () => undefined;
  const campaign = { id: 'campaign-1', name: 'Test', spiritLayerEnabled: false, status: 'ACTIVE', memberships: [], characters: [] };
  return {
    useCampaign: () => {
      useSyncExternalStore(h.subscribe, h.snapshot);
      return {
        currentMap: h.state.currentMap,
        setCurrentMap: noop,
        userRole: h.state.userRole,
        campaign,
        updateCampaignSpiritLayer: noop,
        dmViewBothPlanes: false,
        playerSpiritVisible: h.state.playerSpiritVisible,
        setPlayerSpiritVisible: noop,
        activeVibeEffect: null,
        updateVibe: noop,
        activeAtmosphereEffect: null,
        characterHpCache: {},
      };
    },
  };
});

vi.mock('@/contexts/WebSocketContext', async () => {
  const { useSyncExternalStore } = await import('react');
  const record = (event: string) => (payload: unknown) => { h.sent.push([event, payload]); };
  const client = new Proxy({
    getSocket: () => h.raw,
    onMapChanged: (cb: (data: never) => void) => { h.raw.on('map.changed', cb); },
    off: (event: string, cb: (data: never) => void) => { h.raw.off(event, cb); },
    emitTokenMoveStart: record('token.move.start'),
    emitTokenMove: record('token.move'),
    emitTokenMoveEnd: record('token.move.end'),
    emitMapPing: record('map.ping'),
  } as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return () => () => undefined;
    },
  });
  return {
    useWebSocket: () => {
      useSyncExternalStore(h.subscribe, h.snapshot);
      return { socket: client, joinedEpoch: 1, status: 'connected', reconnectCount: 0 };
    },
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }),
}));

vi.mock('@/services/map.service', () => ({
  default: { updateMap: vi.fn().mockResolvedValue({}), getMaps: vi.fn().mockResolvedValue([]), getMap: vi.fn() },
}));

vi.mock('@/services/api', () => {
  const client = new Proxy({}, { get: () => vi.fn().mockResolvedValue({}) });
  return { api: client, default: client };
});

import MapCanvas from '../MapCanvas';
import { useGameStore } from '@/stores/gameStore';

function mapWith(extra: Partial<CampaignMap> = {}): CampaignMap {
  return {
    id: 'map-a',
    campaignId: 'campaign-1',
    name: 'Map A',
    imageUrl: '/api/assets/maps/x',
    width: 20,
    height: 20,
    gridSize: 50,
    tokens: [],
    wallSegments: [],
    lights: [],
    fogEnabled: false,
    lightingEnabled: false,
    globalIllumination: true,
    explorationEnabled: false,
    ...extra,
  } as unknown as CampaignMap;
}

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.sent.length = 0;
  h.handlers.clear();
  useGameStore.getState().setTokens([]);
  h.set({ userRole: 'DM', currentMap: mapWith(), playerSpiritVisible: false });
});

describe("the toolbar's names", () => {
  // Each button showed only an icon, with its name in a tooltip.
  it('gives every button the name its tooltip shows', () => {
    render(<MapCanvas />);
    fireEvent.click(screen.getByTitle('Ruler — measure distance'));

    const titles = [
      'Zoom Out',
      'Zoom In',
      'Fit to Screen',
      'Toggle Grid',
      'Grid Color: Black',
      'Ruler — measure distance',
      'Ruler color: Amber',
      'AoE Shape — area of effect overlay',
      'Spirit tokens shown, click to hide',
    ];
    for (const title of titles) {
      expect(screen.getByTitle(title)).toHaveAttribute('aria-label', title);
    }
  });

  it('names a button by what it shows now, as its tooltip does', () => {
    render(<MapCanvas />);
    fireEvent.click(screen.getByTitle('Grid Color: Black'));
    fireEvent.click(screen.getByTitle('Spirit tokens shown, click to hide'));

    expect(screen.getByTitle('Grid Color: White')).toHaveAttribute('aria-label', 'Grid Color: White');
    expect(screen.getByTitle('Spirit tokens hidden — click to show'))
      .toHaveAttribute('aria-label', 'Spirit tokens hidden — click to show');
  });
});
