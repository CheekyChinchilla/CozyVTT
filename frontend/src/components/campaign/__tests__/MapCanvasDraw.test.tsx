/**
 * Drawing on the map, through MapCanvas: what the layers draw of the map's
 * drawings and the strokes on their way, for whom, and in which place in the
 * stack.
 *
 * The stand-ins are those of MapCanvasTouch.test.tsx: the role and the
 * current map live in a store the test changes, and the socket records what
 * the page sends, answers its acknowledged requests as the test says, and
 * delivers server events to the listeners the page registered. The canvases
 * draw into recording contexts where a test asks (recordDrawing), and the
 * view starts at 100% with no pan: screen pixel (x, y) is map pixel (x, y).
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { CampaignMap } from '@/types';
import type { Drawing, DrawingAddAck, DrawingPreview } from '@/types/drawings';
import { recordDrawing, nextFrame, pictures, type Call } from '@/test/recordingCanvas';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'DM' as string,
    currentMap: null as unknown,
    status: 'ACTIVE' as string,
    playersMayDraw: true as boolean,
    playerSpiritVisible: false as boolean,
    memberships: [] as Array<{ userId: string; role: string; user: { displayName: string } }>,
  };
  const handlers = new Map<string, Set<(data: never) => void>>();
  const sent: Array<[string, unknown]> = [];
  const answers = {
    add: async (): Promise<DrawingAddAck> => ({ ok: true, id: 'stored-1' }),
    done: async (): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
  };
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
    answers,
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
  const campaign = {
    id: 'campaign-1', name: 'Test', spiritLayerEnabled: false, characters: [],
    get status() { return h.state.status; },
    get playersMayDraw() { return h.state.playersMayDraw; },
    get memberships() { return h.state.memberships; },
  };
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
  const listen = (event: string) => (cb: (data: never) => void) => { h.raw.on(event, cb); };
  const asked = (event: string, answer: () => Promise<unknown>) => (payload: unknown) => {
    h.sent.push([event, payload]);
    return answer();
  };
  const client = new Proxy({
    getSocket: () => h.raw,
    onMapChanged: listen('map.changed'),
    off: (event: string, cb: (data: never) => void) => { h.raw.off(event, cb); },
    emitTokenMoveStart: record('token.move.start'),
    emitTokenMove: record('token.move'),
    emitTokenMoveEnd: record('token.move.end'),
    emitMapPing: record('map.ping'),
    onDrawingAdded: listen('drawing:added'),
    onDrawingRemoved: listen('drawing:removed'),
    onDrawingsCleared: listen('drawings:cleared'),
    onDrawingPreviewed: listen('drawing:previewed'),
    onDrawingsState: listen('drawings:state'),
    requestDrawings: record('drawings:request'),
    sendDrawingPreview: record('drawing:preview'),
    addDrawing: asked('drawing:add', () => h.answers.add()),
    removeDrawing: asked('drawing:remove', () => h.answers.done()),
    clearMyDrawings: asked('drawing:clear_mine', () => h.answers.done()),
    clearDrawings: asked('drawing:clear', () => h.answers.done()),
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

let made = 0;
function drawing(extra: Partial<Drawing> = {}): Drawing {
  made += 1;
  return {
    id: `d${made}`, authorId: 'them', audience: 'ALL', layer: 'MARKUP', kind: 'line', color: '#d94f3d', fillColor: null,
    width: 4, rotation: 0, sortKey: 0, points: [[11, 13], [123, 77]], text: null,
    createdAt: `2026-10-27T10:00:${String(made % 60).padStart(2, '0')}.000Z`, ...extra,
  };
}

function frame(extra: Partial<Required<DrawingPreview>> = {}): Required<DrawingPreview> {
  return { previewId: 'p1', kind: 'pen', color: '#3d8bd9', width: 4, audience: 'ALL', laser: false, points: [[31, 37], [141, 93]], end: false, ...extra };
}

function fire(event: string, payload: unknown) {
  act(() => {
    h.handlers.get(event)?.forEach((fn) => (fn as (data: unknown) => void)(payload));
  });
}

function sentOf(event: string): unknown[] {
  return h.sent.filter(([e]) => e === event).map(([, p]) => p);
}

/** The three canvases, bottom to top: terrain, tokens, overlay. */
const layers = () => Array.from(document.querySelectorAll('canvas'));

/** Whether a canvas of the page's own, off the screen, is copied on in `calls`. */
const copiesKept = (calls: Call[]) =>
  calls.some((c) => c.method === 'drawImage' && c.args[0] instanceof HTMLCanvasElement && !layers().includes(c.args[0]));

/** Where a call to `method` with these first arguments sits in `calls`, or -1. */
const indexOf = (calls: Call[], method: string, ...args: unknown[]) =>
  calls.findIndex((c) => c.method === method && args.every((a, i) => c.args[i] === a));

beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.sent.length = 0;
  h.handlers.clear();
  h.answers.add = async () => ({ ok: true, id: 'stored-1' });
  h.answers.done = async () => ({ ok: true });
  useGameStore.getState().clearGameState();
  h.set({ userRole: 'DM', currentMap: mapWith(), status: 'ACTIVE', playersMayDraw: true, playerSpiritVisible: false, memberships: [] });
});

describe('the drawings on the map', () => {
  const drawn = recordDrawing();

  /** Render, load the pictures the map asks for, and let the first frame draw. */
  async function open() {
    render(<MapCanvas />);
    for (const picture of [...pictures]) picture.load();
    await nextFrame();
    for (const layer of layers()) drawn.take(layer);
  }

  /**
   * A layer's calls since the last look, with those of each canvas off the
   * screen it copies on (the markup layer's pixels, the lighting's) in the
   * place they are copied, as what shows is stacked.
   */
  function composite(canvas: HTMLCanvasElement): Call[] {
    return drawn.take(canvas).flatMap((c) => (
      c.method === 'drawImage' && c.args[0] instanceof HTMLCanvasElement && drawn.recorded.has(c.args[0]) && !layers().includes(c.args[0])
        ? [c, ...drawn.take(c.args[0])]
        : [c]
    ));
  }

  it('asks for them once the map is open', () => {
    render(<MapCanvas />);

    expect(sentOf('drawings:request')).toEqual([{ mapId: 'map-a' }]);
  });

  // Drawings are the topmost layer of the map, so a table can plan over
  // ground it cannot see: over the tokens, the spirit picture and a
  // player's fog, and none of it on the terrain beneath them.
  it('draws the markup on the top layer, over a player’s fog and the spirit picture, and none on the terrain', async () => {
    h.set({ userRole: 'PLAYER', playerSpiritVisible: true, currentMap: mapWith({ fogEnabled: true, spiritLayerUrl: '/api/assets/maps/spirit' }) });
    await open();
    fire('fog:cells', { mapId: 'map-a', revealedCells: [] });

    fire('drawings:state', { mapId: 'map-a', drawings: [drawing()] });
    await nextFrame();

    expect(indexOf(drawn.take(layers()[0]), 'lineTo', 123, 77)).toBe(-1);
    const overlay = composite(layers()[2]);
    // The fog is one fill of every unrevealed square.
    const fog = overlay.findIndex((c) => c.method === 'fill');
    expect(fog).toBeGreaterThan(-1);
    expect(indexOf(overlay, 'lineTo', 123, 77)).toBeGreaterThan(fog);
  });

  it('draws one for the DM alone on the DM’s screen, and not in Preview Player View', async () => {
    h.set({ currentMap: mapWith({ fogEnabled: true }), memberships: [{ userId: 'p1', role: 'PLAYER', user: { displayName: 'Mara' } }] });
    await open();
    fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ audience: 'DM', points: [[11, 13], [123, 77]] }), drawing({ points: [[11, 13], [321, 45]] })] });
    await nextFrame();
    let top = composite(layers()[2]);
    expect(indexOf(top, 'lineTo', 123, 77)).toBeGreaterThan(-1);
    expect(indexOf(top, 'lineTo', 321, 45)).toBeGreaterThan(-1);

    // The preview shows drawings over its fog, as a player sees them, and
    // none for the DM alone.
    fireEvent.click(screen.getByRole('button', { name: 'Toggle DM player view preview' }));
    await nextFrame();
    top = composite(layers()[2]);

    expect(indexOf(top, 'lineTo', 123, 77)).toBe(-1);
    expect(indexOf(top, 'lineTo', 321, 45)).toBeGreaterThan(top.findIndex((c) => c.method === 'fill'));
  });

  // The server sends a player none; a page that holds one, from before a
  // demotion, draws none either.
  it('draws none for the DM alone on a player’s screen', async () => {
    h.set({ userRole: 'PLAYER' });
    await open();

    fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ audience: 'DM' })] });
    await nextFrame();

    expect(indexOf(composite(layers()[2]), 'lineTo', 123, 77)).toBe(-1);
    expect(useGameStore.getState().drawings).toEqual([]);
  });

  it('draws a drawing and a stroke on its way over a player’s fog, the stroke over the drawing and the laser over both', async () => {
    h.set({ userRole: 'PLAYER', currentMap: mapWith({ fogEnabled: true }) });
    await open();
    fire('fog:cells', { mapId: 'map-a', revealedCells: [] });

    fire('drawings:state', { mapId: 'map-a', drawings: [drawing()] });
    fire('drawing:previewed', { mapId: 'map-a', userId: 'them', preview: frame() });
    fire('drawing:previewed', { mapId: 'map-a', userId: 'them', preview: frame({ previewId: 'l1', laser: true, points: [[51, 57], [161, 99]] }) });
    await nextFrame();

    const overlay = composite(layers()[2]);
    // The fog is one fill of every unrevealed square.
    const fog = overlay.findIndex((c) => c.method === 'fill');
    const stored = indexOf(overlay, 'lineTo', 123, 77);
    const stroke = indexOf(overlay, 'lineTo', 141, 93);
    const laser = indexOf(overlay, 'lineTo', 161, 99);
    expect(fog).toBeGreaterThan(-1);
    expect(stored).toBeGreaterThan(fog);
    expect(stroke).toBeGreaterThan(stored);
    expect(laser).toBeGreaterThan(stroke);
  });

  // A table plans in the dark too: drawings and strokes on their way are
  // over the lit darkness, and the laser over them.
  it('draws a drawing and a stroke on its way over a player’s lit darkness, and the laser over them', async () => {
    h.set({ userRole: 'PLAYER', currentMap: mapWith({ lightingEnabled: true, globalIllumination: false }) });
    await open();
    // The player's own token, whose sight the darkness is cut from.
    const mine = {
      id: 'tok-mine', name: 'Aldra', imageUrl: '', position: { x: 2, y: 17 }, size: { width: 1, height: 1 },
      layer: 'token', visible: true, type: 'player', conditions: [], controlledBy: 'me', sightRadius: 0,
    } as unknown as Parameters<ReturnType<typeof useGameStore.getState>['setTokens']>[0][number];
    act(() => { useGameStore.getState().setTokens([mine]); });

    fire('drawings:state', { mapId: 'map-a', drawings: [drawing()] });
    fire('drawing:previewed', { mapId: 'map-a', userId: 'them', preview: frame() });
    fire('drawing:previewed', { mapId: 'map-a', userId: 'them', preview: frame({ previewId: 'l1', laser: true, points: [[51, 57], [161, 99]] }) });
    await nextFrame();

    const overlay = composite(layers()[2]);
    const darkness = overlay.findIndex((c) => c.method === 'drawImage');
    expect(darkness).toBeGreaterThan(-1);
    expect(indexOf(overlay, 'lineTo', 123, 77)).toBeGreaterThan(darkness);
    expect(indexOf(overlay, 'lineTo', 141, 93)).toBeGreaterThan(indexOf(overlay, 'lineTo', 123, 77));
    expect(indexOf(overlay, 'lineTo', 161, 99)).toBeGreaterThan(indexOf(overlay, 'lineTo', 141, 93));
  });

  // The overlay repaints for each frame of a stroke on its way, a laser and
  // a ping, and on a lit map for each token move. The stored drawings are
  // kept as pixels and copied on, and drawn again only when they or the
  // view change.
  it('strokes no stored drawing again for a stroke on its way, and again for a drawing added or the view changed', async () => {
    await open();
    fire('drawings:state', { mapId: 'map-a', drawings: [drawing()] });
    await nextFrame();
    expect(indexOf(composite(layers()[2]), 'lineTo', 123, 77)).toBeGreaterThan(-1);

    fire('drawing:previewed', { mapId: 'map-a', userId: 'them', preview: frame() });
    await nextFrame();
    const tick = composite(layers()[2]);
    expect(indexOf(tick, 'lineTo', 141, 93)).toBeGreaterThan(-1);
    expect(indexOf(tick, 'lineTo', 123, 77)).toBe(-1);
    expect(copiesKept(tick)).toBe(true);

    fire('drawing:added', { mapId: 'map-a', drawing: drawing({ points: [[11, 13], [321, 45]] }) });
    await nextFrame();
    const added = composite(layers()[2]);
    expect(indexOf(added, 'lineTo', 123, 77)).toBeGreaterThan(-1);
    expect(indexOf(added, 'lineTo', 321, 45)).toBeGreaterThan(-1);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom In' }));
    await nextFrame();
    expect(indexOf(composite(layers()[2]), 'lineTo', 123, 77)).toBeGreaterThan(-1);
  });

  // Review focus: a switch of map mid-stroke leaves no ghost.
  it('leaves no stroke of the old map’s on the overlay after a switch', async () => {
    await open();
    fire('drawing:previewed', { mapId: 'map-a', userId: 'them', preview: frame() });
    await nextFrame();
    expect(indexOf(drawn.take(layers()[2]), 'lineTo', 141, 93)).toBeGreaterThan(-1);

    act(() => { h.set({ currentMap: mapWith({ id: 'map-b', name: 'Map B' }) }); });
    for (const picture of [...pictures]) picture.load();
    await nextFrame();

    expect(indexOf(drawn.take(layers()[2]), 'lineTo', 141, 93)).toBe(-1);
    expect(sentOf('drawings:request')).toEqual([{ mapId: 'map-a' }, { mapId: 'map-b' }]);
  });
});
