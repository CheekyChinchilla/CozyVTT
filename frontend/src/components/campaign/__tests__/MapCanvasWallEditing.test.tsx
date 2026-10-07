/**
 * The DM's wall editing on the map, driven through MapCanvas itself.
 *
 * The campaign, socket and sign-in contexts are replaced by small stand-ins:
 * the campaign's current map and the viewer's role live in a store the test
 * changes, and the socket records what the page emits and lets the test
 * deliver server events to the listeners the page registered. Canvas drawing
 * is switched off; what is checked is what the page sends and what its
 * panels show.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Map as CampaignMap } from '@/types';
import type { WallSegment } from '@/types/walls';


const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'DM' as string,
    currentMap: null as unknown,
    joinedEpoch: 1,
  };
  const handlers = new Map<string, Set<(data: never) => void>>();
  const emitted: Array<[string, unknown]> = [];
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
      emitted.push([event, payload]);
      return raw;
    },
  };
  return {
    state,
    handlers,
    emitted,
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

vi.mock('@/contexts/CampaignContext', async () => {
  const { useSyncExternalStore } = await import('react');
  const setCurrentMap = (next: unknown) => {
    h.set({ currentMap: typeof next === 'function' ? (next as (p: unknown) => unknown)(h.state.currentMap) : next });
  };
  const noop = () => undefined;
  const campaign = { id: 'campaign-1', name: 'Test', spiritLayerEnabled: false, memberships: [], characters: [] };
  return {
    useCampaign: () => {
      useSyncExternalStore(h.subscribe, h.snapshot);
      return {
        currentMap: h.state.currentMap,
        setCurrentMap,
        userRole: h.state.userRole,
        campaign,
        updateCampaignSpiritLayer: noop,
        dmViewBothPlanes: false,
        playerSpiritVisible: false,
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
  const client = new Proxy({
    getSocket: () => h.raw,
    onMapChanged: (cb: (data: never) => void) => { h.raw.on('map.changed', cb); },
    off: (event: string, cb: (data: never) => void) => { h.raw.off(event, cb); },
  } as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return () => () => undefined;
    },
  });
  return {
    useWebSocket: () => {
      useSyncExternalStore(h.subscribe, h.snapshot);
      return { socket: client, joinedEpoch: h.state.joinedEpoch, status: 'connected', reconnectCount: 0 };
    },
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'dm-user', displayName: 'The DM' } }),
}));

vi.mock('@/services/map.service', () => ({
  default: { updateMap: vi.fn(), getMaps: vi.fn().mockResolvedValue([]), getMap: vi.fn() },
}));

vi.mock('@/services/api', () => {
  const client = new Proxy({}, { get: () => vi.fn().mockResolvedValue({}) });
  return { api: client, default: client };
});

import MapCanvas from '../MapCanvas';

const wall = (id: string, x: number, type: WallSegment['type'] = 'wall'): WallSegment => ({ id, x1: x, y1: 100, x2: x + 100, y2: 100, type });

function mapWith(id: string, walls: WallSegment[]): CampaignMap {
  return {
    id,
    campaignId: 'campaign-1',
    name: `Map ${id}`,
    imageUrl: '/api/assets/maps/x',
    width: 20,
    height: 20,
    gridSize: 50,
    tokens: [],
    wallSegments: walls,
    lights: [],
    fogEnabled: false,
    lightingEnabled: false,
    globalIllumination: true,
    explorationEnabled: false,
  } as unknown as CampaignMap;
}

function emittedOf(event: string): unknown[] {
  return h.emitted.filter(([e]) => e === event).map(([, p]) => p);
}

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.emitted.length = 0;
  h.handlers.clear();
  h.set({ userRole: 'DM', joinedEpoch: 1, currentMap: mapWith('map-a', [wall('a1', 100), wall('a2', 300)]) });
});

function openWallSelect() {
  fireEvent.click(screen.getByText('Walls'));
  fireEvent.click(screen.getByLabelText('Wall select mode'));
}

/** A key pressed with nothing focused, as on the map. */
function press(key: string, opts: { ctrlKey?: boolean; shiftKey?: boolean } = {}) {
  return fireEvent.keyDown(document.body, { key, ...opts });
}

describe('wall undo after a map switch', () => {
  it('has nothing to undo on the new map, so Ctrl+Z writes nothing to it', () => {
    render(<MapCanvas />);
    openWallSelect();
    press('a', { ctrlKey: true });
    press('Delete');
    expect(emittedOf('walls:replace')).toHaveLength(1);

    act(() => { h.set({ currentMap: mapWith('map-b', [wall('b1', 100), wall('b2', 300), wall('b3', 500)]) }); });
    h.emitted.length = 0;
    press('z', { ctrlKey: true });

    expect(emittedOf('walls:replace')).toEqual([]);
  });

  it('turns the Undo button off on the new map', () => {
    render(<MapCanvas />);
    openWallSelect();
    press('a', { ctrlKey: true });
    press('Delete');
    expect(screen.getByLabelText('Undo wall edit')).toBeEnabled();

    act(() => { h.set({ currentMap: mapWith('map-b', [wall('b1', 100)]) }); });

    expect(screen.getByLabelText('Undo wall edit')).toBeDisabled();
  });
});
