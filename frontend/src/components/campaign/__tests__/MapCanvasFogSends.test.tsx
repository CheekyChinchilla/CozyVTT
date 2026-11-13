/**
 * What the map sends of fog and explored ground on the largest map, 500 by
 * 500 squares, measured as the live table reads it.
 *
 * The server reads no message longer than MAX_SOCKET_MESSAGE_BYTES, so a fog
 * box of more than about 142,000 squares sent as one operation never reached
 * it; and it refuses a report of more than MAX_EXPLORATION_REPORT_CELLS
 * explored squares whole, which a player's sight on a large open map passes
 * at once. A box over the whole map is now one reveal_all or hide_all, any
 * other box goes in parts each under the message limit, and explored ground
 * goes in reports of at most that many squares.
 *
 * The stand-ins are those of MapCanvasResolution.test.tsx. The view starts at
 * 100% with no pan, so page pixel (x + 100, y + 50) is map pixel (x, y).
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { CampaignMap, Token } from '@/types';
import type { FogOperation } from '@/types/walls';
import { mouse } from '@/test/pointer';
import { recordDrawing, nextFrame, pictures } from '@/test/recordingCanvas';
import { MAP_LIMITS, MAX_EXPLORATION_REPORT_CELLS, MAX_SOCKET_MESSAGE_BYTES } from '@/constants/mapLimits';

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

import MapCanvas from '../MapCanvas';
import { useGameStore } from '@/stores/gameStore';

/** The largest map, at the smallest grid: 500 by 500 squares of 10 pixels. */
const SIDE = MAP_LIMITS.maxSide;
const GRID = MAP_LIMITS.minGridSize;
const CELLS = SIDE * SIDE;
const MAP_ID = '7d0f6c1e-5b8a-4c39-9d8e-2f1a3b4c5d6e';

function largestMap(extra: Partial<CampaignMap> = {}): CampaignMap {
  return {
    id: MAP_ID,
    campaignId: 'campaign-1',
    name: 'The Wastes',
    imageUrl: '/api/assets/maps/x',
    width: SIDE,
    height: SIDE,
    gridSize: GRID,
    tokens: [],
    wallSegments: [],
    lights: [],
    fogEnabled: true,
    lightingEnabled: false,
    globalIllumination: true,
    explorationEnabled: false,
    ...extra,
  } as unknown as CampaignMap;
}

/**
 * A message's length in bytes as the live table reads it: Socket.IO writes
 * an event as its two packet types, then the event's name and payload as a
 * JSON array.
 */
const messageBytes = (event: string, payload: unknown) =>
  new TextEncoder().encode(`42${JSON.stringify([event, payload])}`).length;

const sentOf = (event: string) => h.sent.filter(([e]) => e === event).map(([, p]) => p);
function fire(event: string, payload: unknown) {
  act(() => { h.handlers.get(event)?.forEach((fn) => (fn as (data: unknown) => void)(payload)); });
}
/** Page position of map pixel (x, y). */
const onPage = (x: number, y: number) => ({ clientX: x + 100, clientY: y + 50 });

function surface(): HTMLCanvasElement {
  const input = document.querySelector<HTMLCanvasElement>('canvas[class*="cursor-"]');
  if (!input) throw new Error('no input canvas');
  return input;
}

const originalDivRect = HTMLDivElement.prototype.getBoundingClientRect;
const originalCanvasRect = HTMLCanvasElement.prototype.getBoundingClientRect;
const rect = () => ({ left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600, x: 100, y: 50, toJSON: () => ({}) }) as DOMRect;

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true, writable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
  HTMLDivElement.prototype.getBoundingClientRect = rect;
  HTMLCanvasElement.prototype.getBoundingClientRect = rect;
});

afterAll(() => {
  HTMLDivElement.prototype.getBoundingClientRect = originalDivRect;
  HTMLCanvasElement.prototype.getBoundingClientRect = originalCanvasRect;
});

beforeEach(() => {
  h.sent.length = 0;
  h.handlers.clear();
  useGameStore.getState().setTokens([]);
  h.set({ userRole: 'GM', currentMap: largestMap() });
});

// ── The GM's fog box ────────────────────────────────────────────────────────

describe("the GM's fog box on the largest map", () => {
  /** Open the map with its fog all hidden, and take up a fog box. */
  function shown(box: 'Fog reveal box' | 'Fog hide box') {
    render(<MapCanvas />);
    fire('fog:updated', { mapId: MAP_ID, fogState: { fogCols: SIDE, fogRows: SIDE, cellPx: GRID, revealed: new Array<boolean>(CELLS).fill(false) } });
    fireEvent.click(screen.getByText('Fog of War'));
    fireEvent.click(screen.getByLabelText(box));
  }
  function drag(from: { clientX: number; clientY: number }, to: { clientX: number; clientY: number }) {
    mouse.down(surface(), from, 0);
    mouse.move(surface(), to, 1);
    mouse.up(surface(), to, 0);
  }
  const operations = () => sentOf('fog:operation') as Array<{ mapId: string; operation: FogOperation }>;

  it('sends a box of every row but the last in parts, each a message the server reads, together naming each square once', () => {
    shown('Fog reveal box');
    // Columns 0 to 499, rows 0 to 498: 249,500 squares.
    drag(onPage(5, 5), onPage(SIDE * GRID - 5, (SIDE - 1) * GRID - 5));

    const sent = operations();
    for (const message of sent) expect(messageBytes('fog:operation', message)).toBeLessThanOrEqual(MAX_SOCKET_MESSAGE_BYTES);
    expect(sent.length).toBeGreaterThan(1);
    let named: number[] = [];
    for (const { mapId, operation } of sent) {
      expect(mapId).toBe(MAP_ID);
      expect(operation.op).toBe('reveal');
      if (operation.op === 'reveal') named = named.concat(operation.cells);
    }
    expect(named).toEqual(Array.from({ length: SIDE * (SIDE - 1) }, (_, i) => i));
  });

  it('sends reveal_all for a box over the whole map', () => {
    shown('Fog reveal box');
    drag(onPage(5, 5), onPage(SIDE * GRID - 5, SIDE * GRID - 5));

    expect(operations()).toEqual([{ mapId: MAP_ID, operation: { op: 'reveal_all' } }]);
  });

  it('sends hide_all for a hide box over the whole map, from corner to corner either way', () => {
    shown('Fog hide box');
    drag(onPage(SIDE * GRID - 5, SIDE * GRID - 5), onPage(-40, -40));

    expect(operations()).toEqual([{ mapId: MAP_ID, operation: { op: 'hide_all' } }]);
  });

  it('still sends a small box as one operation of its squares', () => {
    shown('Fog hide box');
    drag(onPage(5, 5), onPage(15, 5));

    expect(operations()).toEqual([{ mapId: MAP_ID, operation: { op: 'hide', cells: [0, 1] } }]);
  });
});

// ── A player's explored ground ──────────────────────────────────────────────

describe("a player's explored ground on the largest map", () => {
  recordDrawing();

  // Every square of the coverage mask is lit, as for a player's sight over
  // a large open map under Global Illumination. The mask is read back once,
  // as one pixel per square; nothing else on the map reads pixels.
  beforeEach(() => {
    const recording = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value(this: HTMLCanvasElement) {
        const ctx = recording.call(this, '2d');
        if (!ctx) return ctx;
        return new Proxy(ctx, {
          get(target, prop) {
            if (prop === 'getImageData') {
              return (_x: number, _y: number, w: number, hgt: number) => ({ width: w, height: hgt, data: new Uint8ClampedArray(w * hgt * 4).fill(255) });
            }
            return Reflect.get(target, prop);
          },
        });
      },
    });
  });

  it('reports everything the player sees in parts the server takes, together naming each square once', async () => {
    h.set({
      userRole: 'PLAYER',
      currentMap: largestMap({ fogEnabled: false, lightingEnabled: true, explorationEnabled: true }),
    });
    render(<MapCanvas />);
    act(() => {
      useGameStore.getState().setTokens([{
        id: 'tok-me', name: 'Me', imageUrl: '', position: { x: 250, y: 250 }, size: { width: 1, height: 1 },
        layer: 'token', visible: true, type: 'player', conditions: [], controlledBy: 'me',
      } as unknown as Token]);
    });
    fire('exploration:state', { mapId: MAP_ID, userId: 'me', cells: [] });
    pictures.find((p) => p.src === '/api/assets/maps/x')!.load();
    await nextFrame();

    const reports = sentOf('exploration:reveal') as Array<{ mapId: string; cells: number[]; userId: string }>;
    expect(reports.length).toBeGreaterThan(0);
    let named: number[] = [];
    for (const report of reports) {
      expect(report.cells.length).toBeLessThanOrEqual(MAX_EXPLORATION_REPORT_CELLS);
      expect(messageBytes('exploration:reveal', report)).toBeLessThanOrEqual(MAX_SOCKET_MESSAGE_BYTES);
      expect(report).toMatchObject({ mapId: MAP_ID, userId: 'me' });
      named = named.concat(report.cells);
    }
    expect(named).toEqual(Array.from({ length: CELLS }, (_, i) => i));
  });
});
