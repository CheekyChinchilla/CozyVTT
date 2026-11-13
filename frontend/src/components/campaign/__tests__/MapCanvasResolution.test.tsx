/**
 * The map at the screen's pixel ratio.
 *
 * The three canvases were sized in CSS pixels, so a phone at ratio 3 or a
 * high-density desktop showed each canvas pixel as several and the map came
 * out soft. Each canvas now holds its CSS size times the ratio in pixels and
 * keeps its CSS size; the ratio is read again when the window resizes (the
 * browser's zoom) and when the screen's resolution changes (a window moved to
 * another monitor). Pointers stay in CSS pixels, so a press lands on the same
 * square at any ratio.
 *
 * The stand-ins are those of MapCanvasTouch.test.tsx. jsdom measures every
 * element as 0 by 0 and has no media queries, so the container's rectangle,
 * the ratio, `matchMedia` and the resize observer are stood in for here.
 * Canvas drawing is off except in the groups that record each layer's calls.
 *
 * The last two groups are about the map's picture arriving: a new map is
 * fitted to the view once, and a new picture for the map on screen takes
 * the old one's place only when it is ready.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { CampaignMap, Token } from '@/types';
import { mouse } from '@/test/pointer';
import { recordDrawing, nextFrame, pictures, FakeImage } from '@/test/recordingCanvas';
import { PICTURE_DECODE_WAIT_MS } from '../map/mapImageState';

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

// ── The page around the map ──────────────────────────────────────────────────

/** The container's size, as the layout gives it. */
const container = { width: 800, height: 600 };

/** Every resize observer the map made, to tell when the container changes size. */
const observers = new Set<() => void>();
class RecordingResizeObserver {
  private readonly callback: () => void;
  constructor(callback: () => void) { this.callback = callback; }
  observe() { observers.add(this.callback); }
  unobserve() { observers.delete(this.callback); }
  disconnect() { observers.delete(this.callback); }
}

/** The listeners on each media query, by query. */
const media = new Map<string, Set<() => void>>();
function fakeMatchMedia(query: string): MediaQueryList {
  const listeners = media.get(query) ?? new Set<() => void>();
  media.set(query, listeners);
  const mql = {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: (_type: string, fn: () => void) => { listeners.add(fn); },
    removeEventListener: (_type: string, fn: () => void) => { listeners.delete(fn); },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };
  return mql as unknown as MediaQueryList;
}

/** Listeners on a `(resolution: …)` query, how many in all. */
function resolutionListeners(): number {
  let n = 0;
  for (const [query, fns] of media) if (query.includes('resolution')) n += fns.size;
  return n;
}

function setRatio(ratio: number) {
  Object.defineProperty(window, 'devicePixelRatio', { value: ratio, configurable: true, writable: true });
}

/**
 * The screen's resolution changes, as when the window moves to a monitor of
 * another density: the query for the old ratio stops matching and tells its
 * listeners, and the window's size stays as it was.
 */
function moveToScreen(ratio: number) {
  const before = window.devicePixelRatio;
  setRatio(ratio);
  const old = [...(media.get(`(resolution: ${before}dppx)`) ?? [])];
  act(() => { old.forEach((fn) => fn()); });
}

/** The container takes a new size, and its observers hear of it. */
function resizeContainer(width: number, height: number) {
  container.width = width;
  container.height = height;
  act(() => { [...observers].forEach((fn) => fn()); });
}

const originalDivRect = HTMLDivElement.prototype.getBoundingClientRect;
const originalCanvasRect = HTMLCanvasElement.prototype.getBoundingClientRect;
const originalRatio = window.devicePixelRatio;

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true, writable: true });
  Object.defineProperty(window, 'ResizeObserver', { value: RecordingResizeObserver, configurable: true });
  Object.defineProperty(window, 'matchMedia', { value: fakeMatchMedia, configurable: true, writable: true });
  // The map's container is the only element whose size the map reads, and in
  // the app it sits beside the sidebar and under the header.
  HTMLDivElement.prototype.getBoundingClientRect = () =>
    ({ left: 100, top: 50, right: 100 + container.width, bottom: 50 + container.height, width: container.width, height: container.height, x: 100, y: 50, toJSON: () => ({}) }) as DOMRect;
  HTMLCanvasElement.prototype.getBoundingClientRect = () =>
    ({ left: 100, top: 50, right: 100 + container.width, bottom: 50 + container.height, width: container.width, height: container.height, x: 100, y: 50, toJSON: () => ({}) }) as DOMRect;
});

afterAll(() => {
  HTMLDivElement.prototype.getBoundingClientRect = originalDivRect;
  HTMLCanvasElement.prototype.getBoundingClientRect = originalCanvasRect;
  setRatio(originalRatio);
});

beforeEach(() => {
  h.sent.length = 0;
  h.handlers.clear();
  media.clear();
  observers.clear();
  container.width = 800;
  container.height = 600;
  setRatio(1);
  useGameStore.getState().setTokens([]);
  h.set({ userRole: 'GM', currentMap: mapWith() });
});

/** The three layers, bottom to top. */
function layers(): HTMLCanvasElement[] {
  return [...document.querySelectorAll('canvas')];
}

function surface(): HTMLCanvasElement {
  const input = document.querySelector<HTMLCanvasElement>('canvas[class*="cursor-"]');
  if (!input) throw new Error('no input canvas');
  return input;
}

/** Each layer as [pixels wide, pixels high, CSS width, CSS height]. */
function sizes() {
  return layers().map((c) => [c.width, c.height, c.style.width, c.style.height]);
}

const sentOf = (event: string) => h.sent.filter(([e]) => e === event).map(([, p]) => p);
/** A server event, delivered to the listeners the page registered. */
function fire(event: string, payload: unknown) {
  act(() => { h.handlers.get(event)?.forEach((fn) => (fn as (data: unknown) => void)(payload)); });
}
const readout = () => screen.queryByText(/^\(-?\d+, -?\d+\)$/)?.textContent ?? null;

/** Page position of map pixel (x, y) at 100% with no pan. */
const onPage = (x: number, y: number) => ({ clientX: x + 100, clientY: y + 50 });
/** The centre of square (x, y); grid y counts up from the bottom row. */
const square = (x: number, y: number) => onPage(x * 50 + 25, (19 - y) * 50 + 25);

// ── What each layer draws (src/test/recordingCanvas.ts) ─────────────────────

/** Clearing a layer: the identity transform, then every pixel. */
const cleared = (w: number, h: number) => [
  { method: 'setTransform', args: [1, 0, 0, 1, 0, 0] },
  { method: 'clearRect', args: [0, 0, w, h] },
];

describe('the canvases at the screen ratio', () => {
  it('at ratio 1 are the container size, as before', () => {
    render(<MapCanvas />);

    expect(layers()).toHaveLength(3);
    expect(sizes()).toEqual(Array(3).fill([800, 600, '800px', '600px']));
  });

  it('at ratio 2 hold twice the container size in pixels and keep its CSS size', () => {
    setRatio(2);
    render(<MapCanvas />);

    expect(sizes()).toEqual(Array(3).fill([1600, 1200, '800px', '600px']));
  });

  it('drop the fraction of a pixel the layout gives the container', () => {
    container.width = 812.5;
    container.height = 600.25;
    render(<MapCanvas />);

    expect(sizes()).toEqual(Array(3).fill([812, 600, '812px', '600px']));
  });

  it('follow the container when it grows', () => {
    setRatio(2);
    render(<MapCanvas />);

    resizeContainer(1000, 700);

    expect(sizes()).toEqual(Array(3).fill([2000, 1400, '1000px', '700px']));
  });
});

describe('a change of ratio', () => {
  const drawing = recordDrawing();

  it('resizes the canvases and draws them again when the window moves to a screen of another density', async () => {
    render(<MapCanvas />);
    await nextFrame();
    expect(sizes()[0]).toEqual([800, 600, '800px', '600px']);
    for (const layer of layers()) drawing.take(layer);

    moveToScreen(2);
    expect(sizes()).toEqual(Array(3).fill([1600, 1200, '800px', '600px']));
    // Resizing a canvas empties it, so each layer is drawn again at once.
    await nextFrame();
    for (const layer of layers()) expect(drawing.take(layer).slice(0, 2)).toEqual(cleared(1600, 1200));

    // The query is asked again for the new ratio, so a move back is heard too.
    moveToScreen(1);
    expect(sizes()).toEqual(Array(3).fill([800, 600, '800px', '600px']));
  });

  it('keeps one listener on the screen resolution, and none once the map is closed', () => {
    const { unmount } = render(<MapCanvas />);
    moveToScreen(2);
    moveToScreen(3);
    expect(resolutionListeners()).toBe(1);

    unmount();
    expect(resolutionListeners()).toBe(0);
  });

  // The browser's zoom changes the ratio and the CSS size together, and
  // fires the window's resize.
  it('is read again when the window resizes', () => {
    render(<MapCanvas />);

    setRatio(1.5);
    container.width = 640;
    container.height = 480;
    act(() => { window.dispatchEvent(new Event('resize')); });

    expect(sizes()).toEqual(Array(3).fill([960, 720, '640px', '480px']));
  });
});

describe('a pointer at ratio 2', () => {
  it('shows the square under it in the readout, as at ratio 1', () => {
    setRatio(2);
    render(<MapCanvas />);

    mouse.move(surface(), onPage(250, 300));
    expect(readout()).toBe('(5, 13)');
    mouse.move(surface(), onPage(10, 960));
    expect(readout()).toBe('(0, 0)');
  });

  it('picks a token up on the square pressed and puts it down on the next', () => {
    setRatio(2);
    render(<MapCanvas />);
    act(() => { useGameStore.getState().setTokens([token('tok-goblin', 'Goblin', 5, 13)]); });

    mouse.down(surface(), square(5, 13));
    mouse.up(surface(), square(5, 13));
    expect(sentOf('token.move.start')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a' }]);

    mouse.down(surface(), square(8, 2));
    mouse.up(surface(), square(8, 2));
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 8, y: 2 }]);
  });
});

describe('each layer at ratio 2', () => {
  const drawing = recordDrawing();

  it('clears every pixel and writes "No map loaded" at the CSS centre at the CSS size', async () => {
    setRatio(2);
    render(<MapCanvas />);
    await nextFrame();

    const [terrain, tokensLayer, top] = layers();
    const drawn = drawing.take(terrain);
    expect(drawn.slice(0, 2)).toEqual(cleared(1600, 1200));
    const text = drawn.findIndex((c) => c.method === 'fillText');
    expect(drawn[text].args).toEqual(['No map loaded', 400, 300]);
    const before = drawn.slice(0, text).filter((c) => c.method === 'setTransform');
    expect(before[before.length - 1]?.args).toEqual([2, 0, 0, 2, 0, 0]);
    for (const layer of [tokensLayer, top]) {
      expect(drawing.take(layer).slice(0, 2)).toEqual(cleared(1600, 1200));
    }
  });

  it('draws the map through one transform that holds the ratio, the zoom and the pan', async () => {
    setRatio(2);
    render(<MapCanvas />);
    pictures.find((p) => p.src === '/api/assets/maps/x')!.load();
    await nextFrame();

    // Fitted to 800 by 600 with a 5% margin: 54%, centred.
    expect(screen.getByText(/^\d+%$/).textContent).toBe('54%');
    const zoom = (600 * 0.9) / 1000;
    const pan = { x: (800 - 1000 * zoom) / 2, y: (600 - 1000 * zoom) / 2 };
    for (const layer of layers()) {
      const transforms = drawing.take(layer).filter((c) => c.method === 'setTransform').map((c) => c.args);
      expect(transforms).toContainEqual([2 * zoom, 0, 0, 2 * zoom, 2 * pan.x, 2 * pan.y]);
    }
  });

  // The memory pass works on canvases the size of the screen's pixels, so the
  // ratio the map draws at has to reach it.
  it('builds the explored-memory mask of a lit map through the same transform', async () => {
    setRatio(2);
    h.set({
      userRole: 'PLAYER',
      currentMap: mapWith({ lightingEnabled: true, explorationEnabled: true, globalIllumination: false }),
    });
    render(<MapCanvas />);
    act(() => { useGameStore.getState().setTokens([{ ...token('tok-me', 'Me', 5, 13), controlledBy: 'me' } as Token]); });
    fire('exploration:state', { mapId: 'map-a', userId: 'me', cells: [0, 1, 2, 21] });
    pictures.find((p) => p.src === '/api/assets/maps/x')!.load();
    await nextFrame();

    // The remembered squares, one pixel each, drawn onto a screen-sized mask.
    const isExplored = (src: unknown) => src instanceof HTMLCanvasElement && src.width === 20 && src.height === 20;
    const mask = [...drawing.recorded].find(([canvas, calls]) =>
      !canvas.isConnected && canvas.width === 1600 && canvas.height === 1200
      && calls.some((c) => c.method === 'drawImage' && isExplored(c.args[0])))?.[0];
    expect(mask).toBeDefined();
    const zoom = (600 * 0.9) / 1000;
    const pan = { x: (800 - 1000 * zoom) / 2, y: (600 - 1000 * zoom) / 2 };
    const transforms = drawing.take(mask!).filter((c) => c.method === 'setTransform').map((c) => c.args);
    expect(transforms).toContainEqual([2 * zoom, 0, 0, 2 * zoom, 2 * pan.x, 2 * pan.y]);
  });
});

// ── Fitting a new map to the view ────────────────────────────────────────────

describe('fitting a new map to the view', () => {
  beforeEach(() => {
    pictures.length = 0;
    vi.stubGlobal('Image', FakeImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const zoom = () => screen.getByText(/^\d+%$/).textContent;
  const loadMap = () => pictures.find((p) => p.src === '/api/assets/maps/x')!.load();

  // A map opened while its panel is collapsed or still being laid out
  // measures 0 by 0 when the picture arrives.
  it('fits a map whose picture loaded while the map measured 0 by 0, once the map has a size', () => {
    container.width = 0;
    container.height = 0;
    render(<MapCanvas />);
    loadMap();
    expect(zoom()).toBe('100%');

    resizeContainer(800, 600);

    expect(zoom()).toBe('54%');
  });

  it('fits a map once: a later resize leaves the view as it is', () => {
    render(<MapCanvas />);
    loadMap();
    expect(zoom()).toBe('54%');

    resizeContainer(400, 300);

    expect(zoom()).toBe('54%');
  });
});

// ── A new picture for the map on screen ─────────────────────────────────────

// Edit Map's picture change reaches every member's page as the same map with
// a new address. The map and its tokens stay drawn on the picture they had
// until the new one is ready; a switch to another map waits for its own.
describe('a new picture for the map on screen', () => {
  const drawing = recordDrawing();
  const OLD = '/api/assets/maps/x';
  const NEW = '/api/assets/maps/y';
  const NEWER = '/api/assets/maps/w';
  const OTHER = '/api/assets/maps/z';
  /** The last picture asked for at an address. */
  const pictureAt = (src: string) => pictures.filter((p) => p.src === src).pop()!;
  /** The pictures a layer drew among its calls. */
  const picturesIn = (calls: Array<{ method: string; args: unknown[] }>) =>
    calls.filter((c) => c.method === 'drawImage' && c.args[0] instanceof FakeImage).map((c) => c.args[0]);
  const tokenCircles = (calls: Array<{ method: string; args: unknown[] }>) => calls.filter((c) => c.method === 'arc').length;
  const zoom = () => screen.getByText(/^\d+%$/).textContent;
  /** Page position of map pixel (x, y) in the fitted view: 54%, centred. */
  const fitted = (x: number, y: number) => {
    const z = (600 * 0.9) / 1000;
    return { clientX: 100 + (800 - 1000 * z) / 2 + x * z, clientY: 50 + (600 - 1000 * z) / 2 + y * z };
  };
  const fittedSquare = (x: number, y: number) => fitted(x * 50 + 25, (19 - y) * 50 + 25);

  async function shown() {
    render(<MapCanvas />);
    act(() => { useGameStore.getState().setTokens([token('tok-goblin', 'Goblin', 5, 13)]); });
    pictureAt(OLD).load();
    await nextFrame();
    const [terrain, tokensLayer] = layers();
    expect(picturesIn(drawing.take(terrain))).toEqual([pictureAt(OLD)]);
    expect(tokenCircles(drawing.take(tokensLayer))).toBeGreaterThan(0);
  }

  it('keeps drawing the map and its tokens on the old picture until the new one has loaded, then draws the new one', async () => {
    await shown();
    const old = pictureAt(OLD);
    const [terrain, tokensLayer] = layers();

    act(() => { h.set({ currentMap: mapWith({ imageUrl: NEW }) }); });
    await nextFrame();

    expect(screen.queryByText('Loading map...')).toBeNull();
    expect(picturesIn(drawing.take(terrain))).toEqual([old]);
    expect(tokenCircles(drawing.take(tokensLayer))).toBeGreaterThan(0);

    // Loaded, and still decoding: nothing of it is drawn until it is ready.
    pictureAt(NEW).load();
    await nextFrame();
    expect(picturesIn(drawing.take(terrain))).not.toContain(pictureAt(NEW));
    expect(screen.queryByText('Loading map...')).toBeNull();

    await pictureAt(NEW).decoded();
    await nextFrame();

    expect(picturesIn(drawing.take(terrain))).toEqual([pictureAt(NEW)]);
    expect(screen.queryByText('Loading map...')).toBeNull();
  });

  it('leaves the view and a carried token as they were', async () => {
    await shown();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom In' }));
    const zoomed = zoom();
    expect(zoomed).not.toBe('54%');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom Out' }));
    expect(zoom()).toBe('54%');

    mouse.down(surface(), fittedSquare(5, 13));
    mouse.up(surface(), fittedSquare(5, 13));
    expect(sentOf('token.move.start')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a' }]);

    act(() => { h.set({ currentMap: mapWith({ imageUrl: NEW }) }); });
    pictureAt(NEW).load();
    await pictureAt(NEW).decoded();
    await nextFrame();
    expect(picturesIn(drawing.take(layers()[0]))).toEqual([pictureAt(NEW)]);

    expect(zoom()).toBe('54%');
    expect(sentOf('token.move.end')).toEqual([]);
    mouse.down(surface(), fittedSquare(8, 2));
    mouse.up(surface(), fittedSquare(8, 2));
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 8, y: 2 }]);
  });

  it('keeps the old picture when the new one does not load, and says so', async () => {
    await shown();
    const old = pictureAt(OLD);
    const [terrain, tokensLayer] = layers();

    act(() => { h.set({ currentMap: mapWith({ imageUrl: NEW }) }); });
    pictureAt(NEW).fail();
    await nextFrame();

    expect(screen.getByText('Failed to load map image')).toBeInTheDocument();
    expect(picturesIn(drawing.take(terrain))).toEqual([old]);
    expect(tokenCircles(drawing.take(tokensLayer))).toBeGreaterThan(0);
  });

  it('shows another map only on its own picture, loading until it has', async () => {
    await shown();
    const [terrain, tokensLayer] = layers();

    act(() => { h.set({ currentMap: mapWith({ id: 'map-b', name: 'Map B', imageUrl: NEW }) }); });
    await nextFrame();

    expect(screen.getByText('Loading map...')).toBeInTheDocument();
    expect(picturesIn(drawing.take(terrain))).toEqual([]);
    expect(tokenCircles(drawing.take(tokensLayer))).toBe(0);

    pictureAt(NEW).load();
    await nextFrame();

    expect(screen.queryByText('Loading map...')).toBeNull();
    expect(picturesIn(drawing.take(terrain))).toEqual([pictureAt(NEW)]);
  });

  it('shows another map at the same address on that picture at once', async () => {
    await shown();
    const old = pictureAt(OLD);
    const [terrain] = layers();

    act(() => { h.set({ currentMap: mapWith({ id: 'map-b', name: 'Map B' }) }); });
    await nextFrame();

    expect(screen.queryByText('Loading map...')).toBeNull();
    expect(picturesIn(drawing.take(terrain))).toEqual([old]);
  });

  // A late load or decode belongs to the map and address it was asked for:
  // one the page has moved on from changes nothing.
  it('draws neither map on a picture that finishes decoding after the table has moved on', async () => {
    await shown();
    act(() => { h.set({ currentMap: mapWith({ imageUrl: NEW }) }); });
    const pending = pictureAt(NEW);
    pending.load();
    act(() => { h.set({ currentMap: mapWith({ id: 'map-b', name: 'Map B', imageUrl: OTHER }) }); });
    pictureAt(OTHER).load();
    await pending.decoded();
    await nextFrame();

    const drawn = picturesIn(drawing.take(layers()[0]));
    expect(drawn).not.toContain(pending);
    expect(drawn).toEqual([pictureAt(OTHER)]);
    expect(screen.queryByText('Loading map...')).toBeNull();
  });

  it('ends a second change of picture made before the first is ready on the second', async () => {
    await shown();
    act(() => { h.set({ currentMap: mapWith({ imageUrl: NEW }) }); });
    const first = pictureAt(NEW);
    first.load();
    act(() => { h.set({ currentMap: mapWith({ imageUrl: NEWER }) }); });
    const second = pictureAt(NEWER);
    second.load();
    await second.decoded();
    await nextFrame();
    expect(picturesIn(drawing.take(layers()[0]))).toEqual([second]);

    await first.decoded();
    await nextFrame();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Zoom In' })); });
    await nextFrame();
    expect(picturesIn(drawing.take(layers()[0]))).toEqual([second]);
  });

  it("draws only A's picture after a switch to B and straight back, before and after B's loads", async () => {
    await shown();
    act(() => { h.set({ currentMap: mapWith({ id: 'map-b', name: 'Map B', imageUrl: OTHER }) }); });
    const forB = pictureAt(OTHER);
    act(() => { h.set({ currentMap: mapWith() }); });
    await nextFrame();
    /** The addresses of the pictures the terrain drew since the last look, each once. */
    const srcs = () => [...new Set(picturesIn(drawing.take(layers()[0])).map((p) => (p as FakeImage).src))];
    expect(srcs()).toEqual([OLD]);

    forB.load();
    pictureAt(OLD).load();
    await pictureAt(OLD).decoded();
    await nextFrame();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Zoom In' })); });
    await nextFrame();
    expect(srcs()).toEqual([OLD]);
    expect(screen.queryByText('Loading map...')).toBeNull();
  });

  // A decoding that never ends must not keep the old picture for good.
  it('shows a new picture whose decoding has not ended after PICTURE_DECODE_WAIT_MS', async () => {
    await shown();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      act(() => { h.set({ currentMap: mapWith({ imageUrl: NEW }) }); });
      pictureAt(NEW).load();
      act(() => { vi.advanceTimersByTime(PICTURE_DECODE_WAIT_MS - 1); });
      await nextFrame();
      expect(picturesIn(drawing.take(layers()[0]))).not.toContain(pictureAt(NEW));

      act(() => { vi.advanceTimersByTime(1); });
      await nextFrame();
      expect(picturesIn(drawing.take(layers()[0]))).toEqual([pictureAt(NEW)]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the error over a first picture that does not load', async () => {
    render(<MapCanvas />);
    pictureAt(OLD).fail();
    await nextFrame();

    expect(screen.getByText('Failed to load map image')).toBeInTheDocument();
    expect(picturesIn(drawing.take(layers()[0]))).toEqual([]);
  });
});
