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
 * Canvas drawing is off except in the last group, which records each layer's
 * calls.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { CampaignMap, Token } from '@/types';
import { mouse } from '@/test/pointer';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'DM' as string,
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
  const noop = () => undefined;
  const campaign = { id: 'campaign-1', name: 'Test', spiritLayerEnabled: false, memberships: [], characters: [] };
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
  h.set({ userRole: 'DM', currentMap: mapWith() });
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
const readout = () => screen.queryByText(/^\(-?\d+, -?\d+\)$/)?.textContent ?? null;

/** Page position of map pixel (x, y) at 100% with no pan. */
const onPage = (x: number, y: number) => ({ clientX: x + 100, clientY: y + 50 });
/** The centre of square (x, y); grid y counts up from the bottom row. */
const square = (x: number, y: number) => onPage(x * 50 + 25, (19 - y) * 50 + 25);

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
  it('resizes the canvases when the window moves to a screen of another density', () => {
    render(<MapCanvas />);
    expect(sizes()[0]).toEqual([800, 600, '800px', '600px']);

    moveToScreen(2);
    expect(sizes()).toEqual(Array(3).fill([1600, 1200, '800px', '600px']));

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

// ── What each layer draws ────────────────────────────────────────────────────

interface Call { method: string; args: unknown[] }

/**
 * A 2D context that records every method called on it and keeps whatever is
 * assigned to it. A method's answer is a gradient-like object, enough for the
 * layers' draws to run.
 */
function recordingContext(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const answer = { addColorStop: () => undefined, width: 0 };
  const props: Record<string, unknown> = { canvas };
  const ctx = new Proxy(props, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop in target) return target[prop];
      return (...args: unknown[]) => { calls.push({ method: prop, args }); return answer; };
    },
    set(target, prop, value) {
      if (typeof prop === 'string') target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** Every picture the map asked for, to load by hand: jsdom loads none. */
const pictures: FakeImage[] = [];
class FakeImage {
  onload: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  crossOrigin = '';
  width = 1000;
  height = 1000;
  private source = '';
  set src(value: string) { this.source = value; pictures.push(this); }
  get src() { return this.source; }
  load() { act(() => { this.onload?.(); }); }
}

/** Lets the map's render loop draw its next frame. */
async function nextFrame() {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

describe('each layer at ratio 2', () => {
  const recorded = new Map<HTMLCanvasElement, Call[]>();

  beforeEach(() => {
    recorded.clear();
    pictures.length = 0;
    vi.stubGlobal('Image', FakeImage);
    const contexts = new Map<HTMLCanvasElement, CanvasRenderingContext2D>();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value(this: HTMLCanvasElement) {
        let ctx = contexts.get(this);
        if (!ctx) {
          const made = recordingContext(this);
          ctx = made.ctx;
          contexts.set(this, ctx);
          recorded.set(this, made.calls);
        }
        return ctx;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true, writable: true });
  });

  /** The calls the layer has had since the last look. */
  function take(canvas: HTMLCanvasElement): Call[] {
    const calls = recorded.get(canvas) ?? [];
    const taken = calls.slice();
    calls.length = 0;
    return taken;
  }

  it('clears every pixel and writes "No map loaded" at the CSS centre at the CSS size', async () => {
    setRatio(2);
    render(<MapCanvas />);
    await nextFrame();

    const [terrain, tokensLayer, top] = layers();
    const drawn = take(terrain);
    expect(drawn.slice(0, 2)).toEqual([
      { method: 'setTransform', args: [1, 0, 0, 1, 0, 0] },
      { method: 'clearRect', args: [0, 0, 1600, 1200] },
    ]);
    const text = drawn.findIndex((c) => c.method === 'fillText');
    expect(drawn[text].args).toEqual(['No map loaded', 400, 300]);
    const before = drawn.slice(0, text).filter((c) => c.method === 'setTransform');
    expect(before[before.length - 1]?.args).toEqual([2, 0, 0, 2, 0, 0]);
    for (const layer of [tokensLayer, top]) {
      expect(take(layer).slice(0, 2)).toEqual([
        { method: 'setTransform', args: [1, 0, 0, 1, 0, 0] },
        { method: 'clearRect', args: [0, 0, 1600, 1200] },
      ]);
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
      const transforms = take(layer).filter((c) => c.method === 'setTransform').map((c) => c.args);
      expect(transforms).toContainEqual([2 * zoom, 0, 0, 2 * zoom, 2 * pan.x, 2 * pan.y]);
    }
  });
});
