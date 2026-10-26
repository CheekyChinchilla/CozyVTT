/**
 * The map on a touch screen, and with a pen: what the canvas asks of the
 * browser, which pointers it captures, and what a finger or a pen does.
 *
 * The stand-ins are those of MapCanvasTools.test.tsx: the role and current
 * map live in a store the test changes, and the socket records what the page
 * sends and delivers server events to the listeners the page registered.
 * Canvas drawing is switched off, so the view starts at 100% with no pan:
 * screen pixel (x, y) is map pixel (x, y), and a square is 50 pixels.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { CampaignMap, Token } from '@/types';
import type { LightSource, WallSegment } from '@/types/walls';
import { contact, mouse } from '@/test/pointer';

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

const seg = (id: string, x1: number, y1: number, x2: number, y2: number, type: WallSegment['type'] = 'wall'): WallSegment =>
  ({ id, x1, y1, x2, y2, type });

/** A plain wall along y 100 from x 100 to 200. */
const WALL_A = seg('a1', 100, 100, 200, 100);

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

/** A one-square token; grid y counts up from the bottom row, 0, to the top, 19. */
function token(id: string, name: string, x: number, y: number): Token {
  return {
    id, name, imageUrl: '', position: { x, y }, size: { width: 1, height: 1 },
    layer: 'token', visible: true, type: 'npc', conditions: [],
  } as unknown as Token;
}

/** Map pixel (x, y), which at 100% and no pan is the same screen pixel. */
const px = (x: number, y: number) => ({ clientX: x, clientY: y });
/** The centre of square (x, y). */
const square = (x: number, y: number) => px(x * 50 + 25, (19 - y) * 50 + 25);

function surface(): HTMLCanvasElement {
  const input = document.querySelector<HTMLCanvasElement>('canvas[class*="cursor-"]');
  if (!input) throw new Error('no input canvas');
  return input;
}

function sentOf(event: string): unknown[] {
  return h.sent.filter(([e]) => e === event).map(([, p]) => p);
}

function show(...tokens: Token[]) {
  act(() => { useGameStore.getState().setTokens(tokens); });
}

function fire(event: string, payload: unknown) {
  act(() => {
    h.handlers.get(event)?.forEach((fn) => (fn as (data: unknown) => void)(payload));
  });
}

function wallTool(label: string) {
  fireEvent.click(screen.getByText('Walls'));
  fireEvent.click(screen.getByLabelText(label));
}

const readout = () => screen.queryByText(/^\(-?\d+, -?\d+\)$/)?.textContent ?? null;
const zoom = () => screen.getByText(/^\d+%$/).textContent;

/** A finger's tap: down and up at one place, then the leave a lift brings. */
function tap(id: number, at: { clientX: number; clientY: number }) {
  const finger = contact('touch', id);
  finger.down(surface(), at);
  finger.up(surface(), at);
  finger.leave(surface());
}

/** A finger pressed at `from`, moved through `to`, and lifted at the last point. */
function swipe(id: number, from: { clientX: number; clientY: number }, ...to: Array<{ clientX: number; clientY: number }>) {
  const finger = contact('touch', id);
  finger.down(surface(), from);
  for (const p of to) finger.move(surface(), p);
  finger.up(surface(), to[to.length - 1] ?? from);
  finger.leave(surface());
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
  h.set({ userRole: 'DM', currentMap: mapWith() });
});

describe('what the map asks of the browser', () => {
  // The browser's own pan and pinch would scroll or zoom the page.
  it('takes every touch on the map itself', () => {
    render(<MapCanvas />);

    expect(surface().className.split(/\s+/)).toContain('touch-none');
  });

  // A long-press would select text or open the callout over the map; the
  // panels and inputs over it keep their selectable text.
  it('selects no text and opens no callout on the map layers, and only there', () => {
    render(<MapCanvas />);
    const layers = surface().parentElement!;

    expect(layers.className.split(/\s+/)).toEqual(expect.arrayContaining(['select-none', '[-webkit-touch-callout:none]']));
    expect(layers.parentElement!.className).not.toContain('select-none');
  });
});

describe('pointer capture', () => {
  it('holds a finger or a pen from down to lift, and never the mouse', () => {
    const capture = vi.spyOn(Element.prototype, 'setPointerCapture');
    const release = vi.spyOn(Element.prototype, 'releasePointerCapture');
    try {
      render(<MapCanvas />);

      const finger = contact('touch', 7);
      finger.down(surface(), px(500, 500));
      expect(capture).toHaveBeenLastCalledWith(7);
      finger.up(surface(), px(500, 500));
      expect(release).toHaveBeenLastCalledWith(7);

      const pen = contact('pen', 9);
      pen.down(surface(), px(500, 500));
      expect(capture).toHaveBeenLastCalledWith(9);
      pen.cancel(surface());
      expect(release).toHaveBeenLastCalledWith(9);

      mouse.down(surface(), px(500, 500));
      mouse.up(surface(), px(500, 500));
      expect(capture).toHaveBeenCalledTimes(2);
    } finally {
      capture.mockRestore();
      release.mockRestore();
    }
  });
});

describe('a token picked up by a tap', () => {
  // A finger leaves the canvas after every lift, and a pen when it goes out
  // of range. Leaving puts back a token held by the mouse, but not by them.
  it.each(['touch', 'pen'] as const)('stays held when the %s leaves the map, and a second tap puts it down', (kind) => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));

    const first = contact(kind, 2);
    first.down(surface(), square(0, 19));
    first.up(surface(), square(0, 19));
    first.leave(surface());
    expect(sentOf('token.move.start')).toHaveLength(1);
    expect(sentOf('token.move')).toEqual([]);

    const second = contact(kind, 3);
    second.down(surface(), square(3, 19));
    second.up(surface(), square(3, 19));
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 3, y: 19 }]);
  });
});

describe('two fingers', () => {
  // In the app the canvas sits beside the sidebar and under the header, so
  // the fingers' page position is not the canvas's.
  const original = HTMLCanvasElement.prototype.getBoundingClientRect;
  beforeEach(() => {
    HTMLCanvasElement.prototype.getBoundingClientRect = () =>
      ({ left: 100, top: 50, right: 1100, bottom: 1050, width: 1000, height: 1000, x: 100, y: 50, toJSON: () => ({}) }) as DOMRect;
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getBoundingClientRect = original;
  });
  const onPage = (x: number, y: number) => px(x + 100, y + 50);

  it('spread apart double the zoom about their centre, and the finger left behind does not pan', () => {
    render(<MapCanvas />);
    mouse.move(surface(), onPage(250, 300), 0);
    expect(readout()).toBe('(5, 13)');

    const a = contact('touch', 1);
    const b = contact('touch', 2, false);
    a.down(surface(), onPage(200, 300));
    b.down(surface(), onPage(300, 300));
    a.move(surface(), onPage(150, 300));
    b.move(surface(), onPage(350, 300));
    a.up(surface(), onPage(150, 300));
    b.move(surface(), onPage(600, 700));
    b.up(surface(), onPage(600, 700));

    expect(zoom()).toBe('200%');
    mouse.move(surface(), onPage(250, 300), 0);
    expect(readout()).toBe('(5, 13)');
  });

  it('keep the map under them while their centre moves', () => {
    render(<MapCanvas />);

    const a = contact('touch', 1);
    const b = contact('touch', 2, false);
    a.down(surface(), onPage(200, 300));
    b.down(surface(), onPage(300, 300));
    a.move(surface(), onPage(250, 350));
    b.move(surface(), onPage(450, 350));
    a.up(surface(), onPage(250, 350));
    b.up(surface(), onPage(450, 350));

    expect(zoom()).toBe('200%');
    // Map pixel (250, 300), square (5, 13), began under their centre.
    mouse.move(surface(), onPage(350, 350), 0);
    expect(readout()).toBe('(5, 13)');
  });

  it('zoom no further than 300%', () => {
    render(<MapCanvas />);

    const a = contact('touch', 1);
    const b = contact('touch', 2, false);
    a.down(surface(), onPage(490, 500));
    b.down(surface(), onPage(510, 500));
    a.move(surface(), onPage(0, 500));
    b.move(surface(), onPage(1000, 500));

    expect(zoom()).toBe('300%');
  });
});

describe('one finger', () => {
  it('pans the map by its movement on empty ground', () => {
    render(<MapCanvas />);

    swipe(1, px(500, 500), px(520, 500), px(550, 500));

    mouse.move(surface(), px(60, 10), 0);
    expect(readout()).toBe('(0, 19)');
  });

  it('draws a fog box from where it landed', () => {
    h.set({ currentMap: mapWith({ fogEnabled: true }) });
    render(<MapCanvas />);
    fire('fog:updated', { mapId: 'map-a', fogState: { fogCols: 20, fogRows: 20, cellPx: 50, revealed: new Array(400).fill(false) } });
    fireEvent.click(screen.getByText('Fog of War'));
    fireEvent.click(screen.getByLabelText('Fog reveal box'));

    swipe(1, px(60, 60), px(120, 90), px(160, 110));

    expect(sentOf('fog:operation')).toEqual([{
      mapId: 'map-a',
      operation: { op: 'reveal', cells: expect.arrayContaining([21, 22, 23, 41, 42, 43]) },
    }]);
    expect((sentOf('fog:operation')[0] as { operation: { cells: number[] } }).operation.cells).toHaveLength(6);
  });

  // A tap's down and up arrive in one event, so the box's far corner must
  // not come from what the page last drew: a mouse hover had left it there.
  it('reveals the one square it taps, wherever a mouse last hovered', () => {
    h.set({ currentMap: mapWith({ fogEnabled: true }) });
    render(<MapCanvas />);
    fire('fog:updated', { mapId: 'map-a', fogState: { fogCols: 20, fogRows: 20, cellPx: 50, revealed: new Array(400).fill(false) } });
    fireEvent.click(screen.getByText('Fog of War'));
    fireEvent.click(screen.getByLabelText('Fog reveal box'));
    mouse.move(surface(), px(510, 510), 0);
    mouse.leave(surface());

    tap(1, px(60, 60));

    expect(sentOf('fog:operation')).toEqual([{ mapId: 'map-a', operation: { op: 'reveal', cells: [21] } }]);
  });

  it('ends a wall line with a double tap', () => {
    render(<MapCanvas />);
    wallTool('Wall draw mode');

    tap(1, px(100, 300));
    tap(2, px(200, 300));
    tap(3, px(200, 300));
    tap(4, px(400, 400));

    expect(sentOf('wall:add')).toHaveLength(1);
  });

  it('opens a door with a tap, and never with a drag that starts beside it', () => {
    h.set({ currentMap: mapWith({ wallSegments: [seg('d1', 100, 100, 200, 100, 'door-closed')] }) });
    render(<MapCanvas />);

    swipe(1, px(150, 104), px(150, 160), px(150, 104));
    expect(sentOf('wall:update')).toEqual([]);

    tap(2, px(150, 104));
    expect(sentOf('wall:update')).toHaveLength(1);
  });
});

describe('a finger dragging a wall', () => {
  // The drag's down and first move arrive in one event, and the first move
  // carried the walls selected before the down: another wall jumped.
  it('moves the wall it grabbed from the first move, leaving the one selected before', () => {
    const WALL_B = seg('a2', 300, 100, 400, 100);
    h.set({ currentMap: mapWith({ wallSegments: [WALL_A, WALL_B] }) });
    render(<MapCanvas />);
    wallTool('Wall select mode');
    mouse.down(surface(), px(350, 100));
    mouse.up(surface(), px(350, 100));

    const finger = contact('touch', 1);
    finger.down(surface(), px(150, 100));
    finger.move(surface(), px(150, 150));
    mouse.move(surface(), px(350, 100), 0);
    expect(surface().className).toContain('cursor-pointer');

    finger.up(surface(), px(150, 150));
    expect(sentOf('walls:replace')).toEqual([expect.objectContaining({ segments: [{ ...WALL_A, y1: 150, y2: 150 }, WALL_B] })]);
  });
});

describe('a second finger', () => {
  /**
   * A second finger lands and lifts: a pinch, which draws nothing itself.
   * Moving it zooms the map.
   */
  function secondFinger({ moving = false } = {}) {
    const second = contact('touch', 2, false);
    second.down(surface(), px(800, 800));
    if (moving) second.move(surface(), px(850, 800));
    second.up(surface(), px(moving ? 850 : 800, 800));
  }

  it('cancels a brush stroke: nothing is sent', () => {
    render(<MapCanvas />);
    wallTool('Brush wall mode');

    const first = contact('touch', 1);
    first.down(surface(), px(100, 300));
    first.move(surface(), px(150, 300));
    first.move(surface(), px(200, 300));
    secondFinger({ moving: true });
    first.up(surface(), px(200, 300));

    expect(sentOf('walls:replace')).toEqual([]);
  });

  it('puts a dragged wall back where it was', () => {
    h.set({ currentMap: mapWith({ wallSegments: [WALL_A] }) });
    render(<MapCanvas />);
    wallTool('Wall select mode');

    const first = contact('touch', 1);
    first.down(surface(), px(150, 100));
    first.move(surface(), px(150, 130));
    first.move(surface(), px(150, 150));
    secondFinger();
    first.up(surface(), px(150, 150));
    expect(sentOf('walls:replace')).toEqual([]);

    // The wall is where it began: a mouse drag from there moves it.
    mouse.down(surface(), px(150, 100));
    mouse.move(surface(), px(150, 120), 1);
    mouse.up(surface(), px(150, 120));
    expect(sentOf('walls:replace')).toEqual([expect.objectContaining({ segments: [{ ...WALL_A, y1: 120, y2: 120 }] })]);
  });

  it('puts a dragged light back where it was, sending nothing', () => {
    const lamp: LightSource = { id: 'l1', x: 250, y: 250, brightRadius: 4, dimRadius: 8, color: '#ffcc66', enabled: true };
    h.set({ currentMap: mapWith({ lights: [lamp] }) });
    render(<MapCanvas />);
    fireEvent.click(screen.getByText('Lights'));
    fireEvent.click(screen.getByText('Select'));

    const first = contact('touch', 1);
    first.down(surface(), px(250, 250));
    first.move(surface(), px(300, 310));
    secondFinger();
    first.up(surface(), px(300, 310));
    expect(sentOf('light:update')).toEqual([]);

    // The light is where it began: a click there picks it up again.
    mouse.down(surface(), px(250, 250));
    mouse.up(surface(), px(250, 250));
    expect(sentOf('light:update')).toEqual([expect.objectContaining({ light: expect.objectContaining({ id: 'l1', x: 250, y: 250 }) })]);
  });
});

describe('a pen', () => {
  it('reaches the tools at once, with no slop: a light moves by 4 pixels', () => {
    const lamp: LightSource = { id: 'l1', x: 250, y: 250, brightRadius: 4, dimRadius: 8, color: '#ffcc66', enabled: true };
    h.set({ currentMap: mapWith({ lights: [lamp] }) });
    render(<MapCanvas />);
    fireEvent.click(screen.getByText('Lights'));
    fireEvent.click(screen.getByText('Select'));

    const pen = contact('pen', 5);
    pen.down(surface(), px(250, 250));
    pen.move(surface(), px(254, 250));
    pen.up(surface(), px(254, 250));

    expect(sentOf('light:update')).toEqual([expect.objectContaining({ light: expect.objectContaining({ x: 254, y: 250 }) })]);
  });

  it('keeps its stroke while a palm rests on the glass, and the palm does not pan', () => {
    render(<MapCanvas />);
    wallTool('Brush wall mode');

    const pen = contact('pen', 5);
    const palm = contact('touch', 1, false);
    pen.down(surface(), px(100, 300));
    pen.move(surface(), px(200, 300));
    palm.down(surface(), px(600, 600));
    palm.move(surface(), px(700, 600));
    pen.move(surface(), px(300, 300));
    palm.up(surface(), px(700, 600));
    pen.up(surface(), px(300, 300));

    expect(sentOf('walls:replace')).toEqual([expect.objectContaining({
      mapId: 'map-a',
      segments: [expect.objectContaining({ x1: 100, y1: 300, x2: 300, y2: 300, type: 'wall' })],
    })]);
    mouse.move(surface(), px(10, 10), 0);
    expect(readout()).toBe('(0, 19)');
  });

  it('does nothing with its eraser end', () => {
    h.set({ currentMap: mapWith({ wallSegments: [WALL_A] }) });
    render(<MapCanvas />);
    wallTool('Wall erase mode');

    const pen = contact('pen', 5);
    pen.down(surface(), px(150, 100), { button: 5, buttons: 32 });
    pen.move(surface(), px(160, 100), { buttons: 32 });
    pen.up(surface(), px(160, 100), { button: 5 });

    expect(sentOf('walls:replace')).toEqual([]);
  });
});

describe('the window losing focus', () => {
  it("drops a finger's stroke under way", () => {
    render(<MapCanvas />);
    wallTool('Brush wall mode');

    const finger = contact('touch', 1);
    finger.down(surface(), px(100, 300));
    finger.move(surface(), px(200, 300));
    act(() => { window.dispatchEvent(new Event('blur')); });
    finger.move(surface(), px(300, 300));
    finger.up(surface(), px(300, 300));

    expect(sentOf('walls:replace')).toEqual([]);
  });
});
