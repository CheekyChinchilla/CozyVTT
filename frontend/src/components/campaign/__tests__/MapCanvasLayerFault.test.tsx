/**
 * A layer of the map that fails to draw leaves the context as it found it,
 * and the layers above it drawn.
 *
 * A token whose badge could not be drawn threw part-way through the token
 * layer, after its save and before its restore. The context kept that
 * layer's state on its stack, and the overlay, drawn after the tokens in the
 * same frame, was not drawn at all: a player's fog, walls and pings. Each
 * layer's save now has its restore whatever happens, and the overlay is drawn.
 *
 * The stand-ins are those of MapCanvasResolution.test.tsx.
 */

import { it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import type { CampaignMap, Token } from '@/types';
import { recordDrawing, nextFrame, pictures, type Call } from '@/test/recordingCanvas';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'GM' as string,
    currentMap: null as unknown,
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
  const mapActions = (await import('@/test/viewedMapContext')).mapActionsFor(() => h.state.currentMap, () => undefined);
  const noop = () => undefined;
  const campaign = { id: 'campaign-1', name: 'Test', spiritLayerEnabled: false, memberships: [], characters: [] };
  return {
    useCampaign: () => {
      useSyncExternalStore(h.subscribe, h.snapshot);
      return {
        currentMap: h.state.currentMap,
        viewedMap: h.state.currentMap,
        setCurrentMap: noop,
        ...mapActions,
        userRole: h.state.userRole,
        campaign,
        updateCampaignSpiritLayer: noop,
        gmViewBothPlanes: false,
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
  const record = (event: string) => (payload: unknown) => { h.sent.push([event, payload]); };
  const client = new Proxy({
    getSocket: () => h.raw,
    emitTokenMoveStart: record('token.move.start'),
    emitTokenMove: record('token.move'),
    emitTokenMoveEnd: record('token.move.end'),
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

vi.mock('../map/layers/drawTokens', async (original) => {
  const real = await original<typeof import('../map/layers/drawTokens')>();
  return { ...real, drawTokens: vi.fn(real.drawTokens) };
});
vi.mock('../map/layers/drawWalls', async (original) => {
  const real = await original<typeof import('../map/layers/drawWalls')>();
  return { ...real, drawWalls: vi.fn(real.drawWalls) };
});
vi.mock('../map/layers/drawFog', async (original) => {
  const real = await original<typeof import('../map/layers/drawFog')>();
  return { ...real, drawFog: vi.fn(real.drawFog) };
});

import MapCanvas from '../MapCanvas';
import { drawTokens } from '../map/layers/drawTokens';
import { drawWalls } from '../map/layers/drawWalls';
import { drawFog } from '../map/layers/drawFog';
import { useGameStore } from '@/stores/gameStore';

/** A 20 by 20 map of 50 pixel squares: 1,000 by 1,000 map pixels. */
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

function token(id: string, name: string, x: number, y: number): Token {
  return {
    id, name, imageUrl: '', position: { x, y }, size: { width: 1, height: 1 },
    layer: 'token', visible: true, type: 'npc', conditions: [],
  } as unknown as Token;
}


/** The container's size, as the layout gives it. */
const container = { width: 800, height: 600 };

class StillResizeObserver {
  observe() { return undefined; }
  unobserve() { return undefined; }
  disconnect() { return undefined; }
}

function stillMatchMedia(query: string): MediaQueryList {
  return {
    matches: false, media: query, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}

const originalDivRect = HTMLDivElement.prototype.getBoundingClientRect;
const originalCanvasRect = HTMLCanvasElement.prototype.getBoundingClientRect;
const rect = () =>
  ({ left: 100, top: 50, right: 100 + container.width, bottom: 50 + container.height, width: container.width, height: container.height, x: 100, y: 50, toJSON: () => ({}) }) as DOMRect;

beforeAll(() => {
  Object.defineProperty(window, 'ResizeObserver', { value: StillResizeObserver, configurable: true });
  Object.defineProperty(window, 'matchMedia', { value: stillMatchMedia, configurable: true, writable: true });
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true, writable: true });
  HTMLDivElement.prototype.getBoundingClientRect = rect;
  HTMLCanvasElement.prototype.getBoundingClientRect = rect;
});

afterAll(() => {
  HTMLDivElement.prototype.getBoundingClientRect = originalDivRect;
  HTMLCanvasElement.prototype.getBoundingClientRect = originalCanvasRect;
});

const drawing = recordDrawing();
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.sent.length = 0;
  h.handlers.clear();
  useGameStore.getState().setTokens([]);
  h.set({ userRole: 'GM', currentMap: mapWith() });
  logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  logged.mockRestore();
  vi.mocked(drawTokens).mockReset();
  vi.mocked(drawWalls).mockReset();
  vi.mocked(drawFog).mockClear();
});

/** The three layers, bottom to top. */
const layers = () => [...document.querySelectorAll('canvas')];
const count = (calls: Call[], method: string) => calls.filter((c) => c.method === method).length;

it('restores the token layer and draws the overlay when a token cannot be drawn', async () => {
  const real = await vi.importActual<typeof import('../map/layers/drawTokens')>('../map/layers/drawTokens');
  vi.mocked(drawTokens).mockImplementation((ctx, state, viewport) => {
    // As the badge did: the tokens are drawn, then the badge throws.
    real.drawTokens(ctx, state, viewport);
    throw new TypeError('label.startsWith is not a function');
  });
  render(<MapCanvas />);
  act(() => { useGameStore.getState().setTokens([token('tok-goblin', 'Goblin', 5, 13)]); });
  pictures.find((p) => p.src === '/api/assets/maps/x')!.load();
  await nextFrame();
  const [, tokenLayer, overlay] = layers();
  for (const layer of layers()) drawing.take(layer);

  // A frame that draws every layer again.
  act(() => { useGameStore.getState().setTokens([token('tok-goblin', 'Goblin', 6, 13)]); });
  await nextFrame();

  const tokenCalls = drawing.take(tokenLayer);
  expect(count(tokenCalls, 'fillText')).toBeGreaterThan(0);
  // The layer's save has its restore, after the error.
  expect(count(tokenCalls, 'restore')).toBe(count(tokenCalls, 'save'));
  expect(tokenCalls[tokenCalls.length - 1].method).toBe('restore');
  const overlayCalls = drawing.take(overlay);
  expect(count(overlayCalls, 'save')).toBeGreaterThan(0);
  expect(count(overlayCalls, 'restore')).toBe(count(overlayCalls, 'save'));
  expect(logged).toHaveBeenCalledTimes(1);
});

it('draws a player\'s fog over the map when a layer drawn before it on the overlay throws', async () => {
  vi.mocked(drawWalls).mockImplementation(() => {
    throw new TypeError('wall.x1 is undefined');
  });
  h.set({ userRole: 'PLAYER', currentMap: mapWith({ fogEnabled: true }) });
  render(<MapCanvas />);
  pictures.find((p) => p.src === '/api/assets/maps/x')!.load();
  await nextFrame();
  vi.mocked(drawFog).mockClear();
  for (const layer of layers()) drawing.take(layer);

  // A frame that draws every layer again.
  act(() => { useGameStore.getState().setTokens([token('tok-goblin', 'Goblin', 6, 13)]); });
  await nextFrame();

  const overlay = layers()[2];
  expect(drawFog).toHaveBeenCalledWith(overlay.getContext('2d'), expect.objectContaining({ isGM: false }), expect.anything());
  const overlayCalls = drawing.take(overlay);
  expect(count(overlayCalls, 'restore')).toBe(count(overlayCalls, 'save'));
  expect(logged).toHaveBeenCalledTimes(1);
});

it('draws a player\'s fog over the whole map, in a fresh state, when a step before it throws inside a clip of its own', async () => {
  vi.mocked(drawWalls).mockImplementation((ctx) => {
    // As a layer that clips to a player's sight and throws before its restore.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 10, 10);
    ctx.clip();
    throw new TypeError('wall.x1 is undefined');
  });
  h.set({ userRole: 'PLAYER', currentMap: mapWith({ fogEnabled: true }) });
  render(<MapCanvas />);
  pictures.find((p) => p.src === '/api/assets/maps/x')!.load();
  await nextFrame();
  for (const layer of layers()) drawing.take(layer);

  act(() => { useGameStore.getState().setTokens([token('tok-goblin', 'Goblin', 6, 13)]); });
  await nextFrame();

  const calls = drawing.take(layers()[2]);
  const clipped = calls.findIndex((c) => c.method === 'clip');
  const fresh = calls.findIndex((c) => c.method === 'reset');
  expect(clipped).toBeGreaterThan(-1);
  expect(fresh).toBeGreaterThan(clipped);
  const fog = calls.slice(fresh);
  // Every square of the 20 by 20 map, none of them revealed, and no clip left to cut it.
  expect(fog.filter((c) => c.method === 'rect')).toHaveLength(400);
  expect(fog.some((c) => c.method === 'clip')).toBe(false);
  expect(fog.some((c) => c.method === 'fill')).toBe(true);
});
