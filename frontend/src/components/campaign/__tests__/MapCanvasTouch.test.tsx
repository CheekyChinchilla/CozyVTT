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
import { render, screen, fireEvent, act, createEvent, within } from '@testing-library/react';
import { TokenLayer, TokenType, type CampaignMap, type Token } from '@/types';
import type { LightSource, WallSegment } from '@/types/walls';
import { contact, mouse } from '@/test/pointer';
import { recordDrawing, nextFrame, pictures } from '@/test/recordingCanvas';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'DM' as string,
    currentMap: null as unknown,
    status: 'ACTIVE' as string,
    memberships: [] as Array<{ userId: string; role: string; user: { displayName: string } }>,
    characters: [] as Array<{ id: string; userId: string; name: string }>,
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
  const campaign = {
    id: 'campaign-1', name: 'Test', spiritLayerEnabled: false,
    get status() { return h.state.status; },
    get memberships() { return h.state.memberships; },
    get characters() { return h.state.characters; },
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
function token(id: string, name: string, x: number, y: number, extra: Partial<Token> = {}): Token {
  return {
    id, name, imageUrl: '', position: { x, y }, size: { width: 1, height: 1 },
    layer: 'token', visible: true, type: 'npc', conditions: [], ...extra,
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
  h.set({ userRole: 'DM', currentMap: mapWith(), status: 'ACTIVE', memberships: [], characters: [] });
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

describe('a held token that leaves the map', () => {
  // Since a finger or a pen can hold a token for as long as it likes, the DM
  // can remove, hide or move it meanwhile. The page must not go on holding a
  // token it no longer has, and send its put-down.
  it('is let go when the DM removes it, and the next tap sends nothing for it', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19), token('tok-wolf', 'Wolf', 9, 9));
    tap(1, square(0, 19));
    expect(sentOf('token.move.start')).toHaveLength(1);

    // The map the server sends after the removal no longer has it.
    fire('map.changed', { mapId: 'map-a', mapData: mapWith({ tokens: [token('tok-wolf', 'Wolf', 9, 9)] }) });
    tap(2, square(3, 19));

    expect(sentOf('token.move.end')).toEqual([]);
    expect(sentOf('token.move')).toEqual([]);
  });

  it('is let go when the server takes it out of sight, and the next tap sends nothing for it', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(token('tok-mine', 'Aldra', 0, 19, { type: TokenType.PLAYER, controlledBy: 'me' }));
    tap(1, square(0, 19));
    expect(sentOf('token.move.start')).toHaveLength(1);

    fire('token:disappeared', { tokenId: 'tok-mine', mapId: 'map-a' });
    tap(2, square(3, 19));

    expect(sentOf('token.move.end')).toEqual([]);
    expect(sentOf('token.move')).toEqual([]);
  });

  it('stays held through a resend of its map that still has it', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));
    tap(1, square(0, 19));

    fire('map.changed', { mapId: 'map-a', mapData: mapWith({ tokens: [token('tok-goblin', 'Goblin', 0, 19)] }) });
    tap(2, square(3, 19));

    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 3, y: 19 }]);
  });

  // A switch replaces the token list too, and the list can arrive a render
  // before the map: the hold is the switch's to end, by putting the token
  // back on the map it came from.
  it('goes back on the map it came from when the token list for the next map arrives first', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));
    const pen = contact('pen', 5);
    pen.down(surface(), square(0, 19));
    pen.up(surface(), square(0, 19));
    pen.move(surface(), square(3, 19), { buttons: 0 });

    act(() => { useGameStore.getState().setTokens([token('tok-x', 'X', 1, 1)]); });
    act(() => { h.set({ currentMap: { ...mapWith(), id: 'map-b', name: 'Map B' } as unknown as CampaignMap }); });

    expect(sentOf('token.move').slice(-1)).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 0, y: 19 }]);
  });

  it('goes back to the square the table last saw it on, after someone else moved it', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));
    tap(1, square(0, 19));

    // Another page put it down on (5, 10) while this one held it.
    act(() => { useGameStore.getState().applyTokenMove('tok-goblin', { x: 5, y: 10 }); });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(sentOf('token.move')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 5, y: 10 }]);
    expect(sentOf('token.move.end')).toEqual([]);
  });
});

describe('a finger carrying a token', () => {
  it('picks up a token it may move as it moves, and puts it down where it lifts, selected', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));

    swipe(1, square(0, 19), square(1, 19), square(2, 18), square(3, 17));

    expect(sentOf('token.move.start')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a' }]);
    expect(sentOf('token.move').length).toBeGreaterThan(0);
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 3, y: 17 }]);
    expect(useGameStore.getState().tokens['tok-goblin'].position).toEqual({ x: 3, y: 17 });
    expect(useGameStore.getState().selectedTokenId).toBe('tok-goblin');
    // Nothing is held after: a tap on empty ground puts nothing down.
    tap(2, square(9, 9));
    expect(sentOf('token.move.end')).toHaveLength(1);
  });

  // The server decides each frame and the drop per player by sight, so a
  // finger must send what a mouse sends.
  it('sends the table the events a mouse carry sends, in the same shape', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));
    const shapes = () => h.sent
      .filter(([e]) => e.startsWith('token.'))
      .map(([e, p]) => `${e} ${Object.keys(p as object).sort().join(',')}`)
      .filter((line, i, all) => all.indexOf(line) === i);

    mouse.down(surface(), square(0, 19));
    mouse.up(surface(), square(0, 19));
    mouse.move(surface(), square(3, 19));
    mouse.down(surface(), square(3, 19));
    mouse.up(surface(), square(3, 19));
    mouse.leave(surface());
    const byMouse = shapes();
    h.sent.length = 0;
    // Frames are sent at most every 16 ms, and the mouse sent one just now.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 1000);
      swipe(1, square(3, 19), square(4, 19), square(6, 19));
    } finally {
      vi.useRealTimers();
    }

    expect(byMouse).toEqual([
      'token.move.start mapId,tokenId',
      'token.move mapId,tokenId,x,y',
      'token.move.end mapId,tokenId,x,y',
    ]);
    expect(shapes()).toEqual(byMouse);
  });

  const creature = () => token('tok-wolf', 'Wolf', 10, 9);
  const mine = () => token('tok-mine', 'Aldra', 10, 9, { type: TokenType.PLAYER, controlledBy: 'me' });
  it.each([
    ['a player, from a creature', 'PLAYER', 'ACTIVE', creature],
    ['a player, from their own token while the session is paused', 'PLAYER', 'PAUSED', mine],
    ['a spectator, from a player\'s token', 'SPECTATOR', 'ACTIVE', mine],
  ] as const)('pans the map for %s, carrying nothing', (_who, userRole, status, which) => {
    h.set({ userRole, status });
    render(<MapCanvas />);
    show(which());

    swipe(1, square(10, 9), px(545, 525), px(575, 525));

    expect(sentOf('token.move.start')).toEqual([]);
    expect(sentOf('token.move.end')).toEqual([]);
    mouse.move(surface(), px(60, 10), 0);
    expect(readout()).toBe('(0, 19)');
  });

  it("carries a player's own token out from under a creature drawn over it", () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(mine(), creature());

    swipe(1, square(10, 9), square(11, 9), square(12, 9));

    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-mine', mapId: 'map-a', x: 12, y: 9 }]);
  });

  it('toggles no door it ends on', () => {
    h.set({ currentMap: mapWith({ wallSegments: [seg('d1', 100, 100, 200, 100, 'door-closed')] }) });
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));

    swipe(1, square(0, 19), px(100, 80), px(150, 104));

    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 3, y: 17 }]);
    expect(sentOf('wall:update')).toEqual([]);
  });
});

describe('a carry let go of before the finger lifts', () => {
  /** A finger presses the goblin on (0, 19) and carries it to (2, 19), still down. */
  function carry() {
    show(token('tok-goblin', 'Goblin', 0, 19));
    const finger = contact('touch', 1);
    finger.down(surface(), square(0, 19));
    finger.move(surface(), square(1, 19));
    finger.move(surface(), square(2, 19));
    return finger;
  }
  const lastMove = () => sentOf('token.move').slice(-1)[0];

  it('goes back where it was picked up when a second finger lands, and the two fingers zoom', () => {
    render(<MapCanvas />);
    const first = carry();

    const second = contact('touch', 2, false);
    second.down(surface(), px(800, 800));
    second.move(surface(), px(900, 800));
    second.up(surface(), px(900, 800));
    first.up(surface(), square(2, 19));

    expect(lastMove()).toEqual({ tokenId: 'tok-goblin', mapId: 'map-a', x: 0, y: 19 });
    expect(sentOf('token.move.end')).toEqual([]);
    expect(zoom()).not.toBe('100%');
    // Nothing is held after.
    tap(3, px(10, 10));
    expect(sentOf('token.move.end')).toEqual([]);
  });

  it('goes back where it was picked up when the browser takes the pointer', () => {
    render(<MapCanvas />);
    const finger = carry();

    finger.cancel(surface());

    expect(lastMove()).toEqual({ tokenId: 'tok-goblin', mapId: 'map-a', x: 0, y: 19 });
    expect(sentOf('token.move.end')).toEqual([]);
    tap(2, px(10, 10));
    expect(sentOf('token.move.end')).toEqual([]);
  });

  // A pen wins over fingers: its landing ends the finger's carry, and the
  // pen's own press must not then put the token down where the pen landed.
  it('goes back where it was picked up when a pen lands, and the pen puts nothing down', () => {
    render(<MapCanvas />);
    const finger = carry();

    const pen = contact('pen', 5);
    pen.down(surface(), square(6, 19));
    pen.up(surface(), square(6, 19));
    finger.up(surface(), square(2, 19));

    expect(lastMove()).toEqual({ tokenId: 'tok-goblin', mapId: 'map-a', x: 0, y: 19 });
    expect(sentOf('token.move.end')).toEqual([]);
  });

  it('goes back where it was picked up when the window loses focus', () => {
    render(<MapCanvas />);
    const finger = carry();

    act(() => { window.dispatchEvent(new Event('blur')); });
    finger.move(surface(), square(5, 19));
    finger.up(surface(), square(5, 19));

    expect(lastMove()).toEqual({ tokenId: 'tok-goblin', mapId: 'map-a', x: 0, y: 19 });
    expect(sentOf('token.move.end')).toEqual([]);
  });
});

// One finger picks up, pans and places.
describe('a token held by a tap, and the next finger', () => {
  const goblin = () => token('tok-goblin', 'Goblin', 0, 19);

  it('is carried by a drag that starts on its own square, and put down where the finger lifts', () => {
    render(<MapCanvas />);
    show(goblin());
    tap(1, square(0, 19));

    swipe(2, square(0, 19), square(2, 19), square(4, 19));

    expect(sentOf('token.move.start')).toHaveLength(1);
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 4, y: 19 }]);
  });

  it('stays held while a drag anywhere else pans the map, and a tap then puts it down where it lands', () => {
    render(<MapCanvas />);
    show(goblin());
    tap(1, square(0, 19));

    swipe(2, px(500, 500), px(520, 500), px(550, 500));
    expect(sentOf('token.move')).toEqual([]);
    expect(sentOf('token.move.end')).toEqual([]);

    // The map moved 50 pixels right: screen (575, 525) is square (10, 9).
    tap(3, px(575, 525));
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 10, y: 9 }]);
  });

  it.each([
    ['from a still finger', false],
    ['whose first finger slid first', true],
  ])('stays held through a pinch %s, and a tap then puts it down', (_how, slid) => {
    render(<MapCanvas />);
    show(goblin());
    tap(1, square(0, 19));

    const a = contact('touch', 2);
    const b = contact('touch', 3, false);
    a.down(surface(), px(400, 500));
    if (slid) a.move(surface(), px(420, 500));
    b.down(surface(), px(600, 500));
    a.move(surface(), px(350, 500));
    b.move(surface(), px(650, 500));
    a.up(surface(), px(350, 500));
    b.up(surface(), px(650, 500));
    expect(sentOf('token.move')).toEqual([]);

    tap(4, px(500, 400));
    expect(sentOf('token.move.end')).toEqual([expect.objectContaining({ tokenId: 'tok-goblin' })]);
  });

  it('stays held while the zoom buttons change the view', () => {
    render(<MapCanvas />);
    show(goblin());
    tap(1, square(0, 19));

    fireEvent.click(screen.getByTitle('Zoom In'));
    fireEvent.click(screen.getByTitle('Zoom Out'));
    tap(2, square(5, 19));

    expect(sentOf('token.move')).toEqual([]);
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 5, y: 19 }]);
  });
});

describe('where a held token is drawn', () => {
  const drawing = recordDrawing();
  const tokenLayer = () => document.querySelectorAll('canvas')[1];
  /** The circles the token layer drew in its last frame, in map pixels. */
  async function circles(): Promise<Array<[number, number, number]>> {
    drawing.take(tokenLayer());
    await nextFrame();
    return drawing.take(tokenLayer()).filter((c) => c.method === 'arc').map((c) => [c.args[0], c.args[1], c.args[2]] as [number, number, number]);
  }
  async function shown() {
    render(<MapCanvas />);
    pictures.find((p) => p.src === '/api/assets/maps/x')!.load();
    show(token('tok-goblin', 'Goblin', 0, 19));
    await nextFrame();
  }
  // Square (0, 19) is the top-left corner: its circle is centred on (25, 25).
  const onItsSquare: [number, number, number] = [25, 25, 25];

  it('stays drawn on its own square after the tap that took it lifts', async () => {
    await shown();
    tap(1, square(0, 19));

    expect(await circles()).toContainEqual(onItsSquare);
  });

  it('stays on its square while one finger pans the map', async () => {
    await shown();
    tap(1, square(0, 19));
    const finger = contact('touch', 2);
    finger.down(surface(), px(500, 500));
    finger.move(surface(), px(560, 500));

    expect(await circles()).toContainEqual(onItsSquare);
  });

  it('follows a finger that carries it', async () => {
    await shown();
    const finger = contact('touch', 1);
    finger.down(surface(), square(0, 19));
    finger.move(surface(), square(1, 19));
    finger.move(surface(), square(3, 19));

    const drawn = await circles();
    expect(drawn).toContainEqual([175, 25, 25]);
    expect(drawn).not.toContainEqual(onItsSquare);
  });

  // Drawn where the table is told it is: a mouse carrying it past the map's
  // edge leaves it at the edge.
  it('stays at the map\'s edge while a mouse carries it past the edge', async () => {
    await shown();
    mouse.down(surface(), square(0, 19));
    mouse.up(surface(), square(0, 19));
    mouse.move(surface(), square(19, 19));
    mouse.move(surface(), px(1040, 25));

    // Square (19, 19), the top-right corner, is centred on (975, 25).
    expect(await circles()).toContainEqual([975, 25, 25]);
  });

  it('goes back to its square, for the table too, when a pen that carried it goes out of range', async () => {
    await shown();
    const pen = contact('pen', 5);
    pen.down(surface(), square(0, 19));
    pen.up(surface(), square(0, 19));
    pen.move(surface(), square(3, 19), { buttons: 0 });
    expect(sentOf('token.move')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 3, y: 19 }]);

    pen.leave(surface());

    expect(sentOf('token.move').slice(-1)).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 0, y: 19 }]);
    expect(await circles()).toContainEqual(onItsSquare);
    // Still held: the pen's next tap puts it down.
    pen.down(surface(), square(6, 19));
    pen.up(surface(), square(6, 19));
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 6, y: 19 }]);
  });
});

describe('a long-press', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
  afterEach(() => { vi.useRealTimers(); });

  const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
  /** A finger pressed and held still at `at`; the caller lifts it. */
  function hold(id: number, at: { clientX: number; clientY: number }, ms = 500) {
    const finger = contact('touch', id);
    finger.down(surface(), at);
    wait(ms);
    return {
      lift() {
        finger.up(surface(), at);
        finger.leave(surface());
      },
      finger,
    };
  }
  /** The labels of the menu open over the map, in order. */
  const menuLabels = () => [...document.querySelectorAll<HTMLElement>('div.fixed.z-50 button')].map((b) => b.textContent);
  const goblin = () => token('tok-goblin', 'Goblin', 0, 19);
  const door = () => seg('d1', 100, 100, 200, 100, 'door-closed');

  it('opens the token menu on a token the viewer may move, picks nothing up and selects it, and the lift taps nothing', () => {
    render(<MapCanvas />);
    show(goblin());

    const press = hold(1, square(0, 19));
    expect(screen.getByText('Remove from Map')).toBeInTheDocument();
    expect(useGameStore.getState().selectedTokenId).toBe('tok-goblin');
    press.lift();

    expect(sentOf('token.move.start')).toEqual([]);
    expect(sentOf('map.ping')).toEqual([]);
    expect(screen.getByText('Remove from Map')).toBeInTheDocument();
  });

  // iOS may send a click, and the mouse events before it, after a long
  // press. The token menu closes on a click, the roster's menu on a mousedown.
  it('swallows the click and the mousedown that follow its lift, once', () => {
    render(<MapCanvas />);
    show(goblin());
    const heard = vi.fn();
    document.addEventListener('mousedown', heard);
    try {
      hold(1, square(0, 19)).lift();

      fireEvent.mouseDown(document.body, { detail: 1 });
      fireEvent.click(document.body, { detail: 1 });
      expect(heard).not.toHaveBeenCalled();
      expect(screen.getByText('Remove from Map')).toBeInTheDocument();

      // The next real press is the user's: its click closes the menu.
      fireEvent.pointerDown(document.body, { pointerType: 'touch', pointerId: 2 });
      fireEvent.mouseDown(document.body, { detail: 1 });
      fireEvent.click(document.body, { detail: 1 });
      expect(heard).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Remove from Map')).not.toBeInTheDocument();
    } finally {
      document.removeEventListener('mousedown', heard);
    }
  });

  // Enter or Space on a focused button clicks it with no pointer at all,
  // and a click count of 0: that click is the user's.
  it('lets a click from the keyboard through after the lift, and still swallows the pointer\'s', () => {
    render(<MapCanvas />);
    show(goblin());
    const heard = vi.fn();
    document.addEventListener('click', heard);
    try {
      hold(1, square(0, 19)).lift();

      fireEvent.click(document.body, { detail: 0 });
      expect(heard).toHaveBeenCalledTimes(1);
      fireEvent.click(document.body, { detail: 1 });
      expect(heard).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('click', heard);
    }
  });

  it('swallows nothing once the window has lost focus during the press', () => {
    render(<MapCanvas />);
    show(goblin());
    const press = hold(1, square(0, 19));
    expect(screen.getByText('Remove from Map')).toBeInTheDocument();

    act(() => { window.dispatchEvent(new Event('blur')); });
    press.lift();
    fireEvent.click(document.body, { detail: 1 });

    expect(screen.queryByText('Remove from Map')).not.toBeInTheDocument();
  });

  it.each([
    ['the DM, on a creature', 'DM', () => token('tok-goblin', 'Goblin', 0, 19)],
    ['a player, on their own character', 'PLAYER', () => token('tok-mine', 'Aldra', 0, 19, { type: TokenType.PLAYER, controlledBy: 'me', characterId: 'char-me' })],
    ['a spectator, on a character', 'SPECTATOR', () => token('tok-mara', 'Mara', 0, 19, { type: TokenType.PLAYER, controlledBy: 'other', characterId: 'char-other' })],
  ] as const)('offers %s what a right-click there offers, in the same order', (_who, userRole, which) => {
    h.set({
      userRole,
      memberships: [{ userId: 'me', role: userRole, user: { displayName: 'Me' } }],
      characters: [{ id: 'char-me', userId: 'me', name: 'Aldra' }, { id: 'char-other', userId: 'other', name: 'Mara' }],
    });
    render(<MapCanvas />);
    show(which());

    fireEvent.contextMenu(surface(), square(0, 19));
    const byRightClick = menuLabels();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(menuLabels()).toEqual([]);
    const press = hold(1, square(0, 19));
    const byLongPress = menuLabels();
    press.lift();

    expect(byRightClick.length).toBeGreaterThan(0);
    expect(byLongPress).toEqual(byRightClick);
  });

  it('opens the door menu on a door the map offers, and pings nothing', () => {
    h.set({ currentMap: mapWith({ wallSegments: [door()] }) });
    render(<MapCanvas />);

    fireEvent.contextMenu(surface(), px(150, 104));
    const byRightClick = menuLabels();
    fireEvent.keyDown(window, { key: 'Escape' });
    hold(1, px(150, 104)).lift();

    expect(byRightClick).toEqual(['Open Door', 'Lock Door']);
    expect(menuLabels()).toEqual(byRightClick);
    expect(sentOf('map.ping')).toEqual([]);
  });

  it('pings once on empty ground, at the map pixel under the finger', () => {
    render(<MapCanvas />);

    const press = hold(1, px(510, 260));
    wait(1000);
    press.lift();

    expect(sentOf('map.ping')).toEqual([{ mapId: 'map-a', x: 510, y: 260 }]);
    expect(menuLabels()).toEqual([]);
  });

  it('pings nothing off the edge of the map', () => {
    render(<MapCanvas />);

    hold(1, px(1010, 400)).lift();

    expect(sentOf('map.ping')).toEqual([]);
  });

  it("pings on a creature whose menu would be empty for the player", () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(goblin());

    fireEvent.contextMenu(surface(), square(0, 19));
    expect(menuLabels()).toEqual([]);
    hold(1, square(0, 19)).lift();

    expect(menuLabels()).toEqual([]);
    expect(sentOf('map.ping')).toEqual([{ mapId: 'map-a', x: 25, y: 25 }]);
  });

  it('puts a token held by a tap back, and opens the menu of the token it presses', () => {
    render(<MapCanvas />);
    show(goblin(), token('tok-wolf', 'Wolf', 4, 19));
    tap(1, square(0, 19));

    hold(2, square(4, 19)).lift();

    expect(sentOf('token.move')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 0, y: 19 }]);
    expect(sentOf('token.move.end')).toEqual([]);
    expect(useGameStore.getState().selectedTokenId).toBe('tok-wolf');
    expect(screen.getByText('Remove from Map')).toBeInTheDocument();
  });

  it('is still a long-press with a finger that jitters under the slop, and none with one that moves past it first', () => {
    render(<MapCanvas />);
    show(goblin());

    const finger = contact('touch', 1);
    finger.down(surface(), px(25, 25));
    wait(200);
    finger.move(surface(), px(30, 25));
    wait(300);
    expect(screen.getByText('Remove from Map')).toBeInTheDocument();
    finger.up(surface(), px(30, 25));
    fireEvent.keyDown(window, { key: 'Escape' });

    const other = contact('touch', 2);
    other.down(surface(), px(25, 25));
    wait(300);
    other.move(surface(), px(45, 25));
    wait(1000);
    expect(menuLabels()).toEqual([]);
    other.up(surface(), px(45, 25));
  });

  // A press under a DM tool is the tool's for as long as it is held.
  it('does not exist under a DM tool: a press held 600 ms then dragged draws a fog box', () => {
    h.set({ currentMap: mapWith({ fogEnabled: true }) });
    render(<MapCanvas />);
    show(goblin());
    fire('fog:updated', { mapId: 'map-a', fogState: { fogCols: 20, fogRows: 20, cellPx: 50, revealed: new Array(400).fill(false) } });
    fireEvent.click(screen.getByText('Fog of War'));
    fireEvent.click(screen.getByLabelText('Fog reveal box'));

    const finger = contact('touch', 1);
    finger.down(surface(), px(60, 60));
    wait(600);
    finger.move(surface(), px(120, 90));
    finger.move(surface(), px(160, 110));
    finger.up(surface(), px(160, 110));

    expect(menuLabels()).toEqual([]);
    expect(sentOf('map.ping')).toEqual([]);
    expect(sentOf('fog:operation')).toHaveLength(1);
  });

  it('makes nothing of a pen held still', () => {
    render(<MapCanvas />);

    const pen = contact('pen', 5);
    pen.down(surface(), px(510, 260));
    wait(800);
    pen.up(surface(), px(510, 260));

    expect(menuLabels()).toEqual([]);
    expect(sentOf('map.ping')).toEqual([]);
  });

  // A stylus makes no long-press of its own, but a browser may turn a
  // stylus held still into a right-click (Windows Ink does).
  it("opens nothing for the browser's right-click while a stylus tip is down", () => {
    render(<MapCanvas />);
    show(goblin());

    const pen = contact('pen', 5);
    pen.down(surface(), square(0, 19));
    const event = createEvent.contextMenu(surface(), { ...square(0, 19), button: 2 });
    fireEvent(surface(), event);

    expect(event.defaultPrevented).toBe(true);
    expect(menuLabels()).toEqual([]);
    pen.up(surface(), square(0, 19));
  });

  it.each([
    ['with nothing else on the glass', false],
    ['while a palm rests on the glass', true],
  ])("opens the menu for a stylus's barrel button, %s", (_how, palm) => {
    render(<MapCanvas />);
    show(goblin());

    const pen = contact('pen', 5);
    pen.down(surface(), square(0, 19), { button: 2, buttons: 2 });
    const hand = contact('touch', 7);
    if (palm) hand.down(surface(), px(600, 700));
    fireEvent.contextMenu(surface(), { ...square(0, 19), button: 2 });

    expect(screen.getByText('Remove from Map')).toBeInTheDocument();
    pen.up(surface(), square(0, 19), { button: 2 });
    if (palm) hand.up(surface(), px(600, 700));
  });

  describe("and the browser's own, which Android makes", () => {
    /** The context menu event a browser sends for a long press, as Chrome does with a pointer type or as a plain mouse event. */
    function browserLongPress(at: { clientX: number; clientY: number }, pointerType?: string): Event {
      const event = createEvent.contextMenu(surface(), at);
      if (pointerType) Object.defineProperty(event, 'pointerType', { value: pointerType });
      fireEvent(surface(), event);
      return event;
    }

    it.each([['with', 'touch'], ['without', undefined]])('opens one menu %s a pointer type on the event, picking nothing up, before the timer', (_how, pointerType) => {
      render(<MapCanvas />);
      show(goblin());

      const finger = contact('touch', 1);
      finger.down(surface(), square(0, 19));
      wait(400);
      const event = browserLongPress(square(0, 19), pointerType);
      expect(event.defaultPrevented).toBe(true);
      expect(screen.getByText('Remove from Map')).toBeInTheDocument();
      // Lifted at 450 ms, before the recogniser's own timer would run.
      wait(50);
      finger.up(surface(), square(0, 19));
      wait(500);

      expect(sentOf('token.move.start')).toEqual([]);
      expect(screen.getByText('Remove from Map')).toBeInTheDocument();
    });

    it.each([
      ['the timer after it', (finger: ReturnType<typeof contact>) => { wait(200); finger.up(surface(), px(510, 260)); }],
      ['a lift at 450 ms after it', (finger: ReturnType<typeof contact>) => { wait(50); finger.up(surface(), px(510, 260)); wait(500); }],
      ['the browser taking the pointer after it', (finger: ReturnType<typeof contact>) => { finger.cancel(surface()); wait(500); }],
    ])('pings once on empty ground, with %s', (_then, then) => {
      render(<MapCanvas />);

      const finger = contact('touch', 1);
      finger.down(surface(), px(510, 260));
      wait(400);
      browserLongPress(px(510, 260), 'touch');
      then(finger);

      expect(sentOf('map.ping')).toEqual([{ mapId: 'map-a', x: 510, y: 260 }]);
    });

    it('does nothing more after the timer, and the browser shows no menu of its own', () => {
      render(<MapCanvas />);

      const finger = contact('touch', 1);
      finger.down(surface(), px(510, 260));
      wait(500);
      const event = browserLongPress(px(510, 260));
      finger.up(surface(), px(510, 260));

      expect(event.defaultPrevented).toBe(true);
      expect(sentOf('map.ping')).toHaveLength(1);
    });

    it('opens nothing under a DM tool, and the press can still drag', () => {
      h.set({ currentMap: mapWith({ fogEnabled: true }) });
      render(<MapCanvas />);
      fire('fog:updated', { mapId: 'map-a', fogState: { fogCols: 20, fogRows: 20, cellPx: 50, revealed: new Array(400).fill(false) } });
      fireEvent.click(screen.getByText('Fog of War'));
      fireEvent.click(screen.getByLabelText('Fog reveal box'));

      const finger = contact('touch', 1);
      finger.down(surface(), px(60, 60));
      wait(400);
      const event = browserLongPress(px(60, 60), 'touch');
      finger.move(surface(), px(160, 110));
      finger.up(surface(), px(160, 110));

      expect(event.defaultPrevented).toBe(true);
      expect(menuLabels()).toEqual([]);
      expect(sentOf('fog:operation')).toHaveLength(1);
    });
  });
});

describe('Put back', () => {
  const goblin = () => token('tok-goblin', 'Goblin', 0, 19);
  const putBack = () => screen.queryByRole('button', { name: 'Put back' });

  it.each(['touch', 'pen'] as const)('shows while a %s holds a token, and puts it back as Esc does', (kind) => {
    render(<MapCanvas />);
    show(goblin());
    expect(putBack()).toBeNull();

    const pointer = contact(kind, 2);
    pointer.down(surface(), square(0, 19));
    pointer.up(surface(), square(0, 19));
    pointer.leave(surface());
    expect(putBack()!.parentElement).toHaveTextContent('Holding Goblin');
    fireEvent.click(putBack()!);

    expect(sentOf('token.move')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 0, y: 19 }]);
    expect(sentOf('token.move.end')).toEqual([]);
    expect(putBack()).toBeNull();
    // Nothing is held: a tap on empty ground puts nothing down.
    tap(3, square(9, 9));
    expect(sentOf('token.move.end')).toEqual([]);
  });

  // Leaving the map puts a mouse's hold back, so a bar beside it would go
  // as the pointer reached it.
  it("never shows for a mouse's hold", () => {
    render(<MapCanvas />);
    show(goblin());

    mouse.down(surface(), square(0, 19));
    mouse.up(surface(), square(0, 19));
    mouse.move(surface(), square(2, 19));

    expect(putBack()).toBeNull();
  });

  it('hides while a finger carries the token it holds, and shows again once it is held still', () => {
    render(<MapCanvas />);
    show(goblin());
    tap(1, square(0, 19));
    expect(putBack()).not.toBeNull();

    const finger = contact('touch', 2);
    finger.down(surface(), square(0, 19));
    finger.move(surface(), square(2, 19));
    expect(putBack()).toBeNull();
    finger.up(surface(), square(2, 19));

    tap(3, square(2, 19));
    expect(putBack()).not.toBeNull();
  });

  it('gives the map the keys back once it has put the token back', () => {
    render(<MapCanvas />);
    show(goblin());
    tap(1, square(0, 19));

    // A tap on the button gives it focus first, and then it goes.
    putBack()!.focus();
    fireEvent.click(putBack()!);

    expect(document.activeElement).toBe(screen.getByRole('application', { name: 'Map' }));
  });

  // A shared screen in Player Preview shows only what the previewed player
  // is sent.
  it('names no token the preview does not draw', () => {
    h.set({
      currentMap: mapWith({ fogEnabled: true }),
      memberships: [{ userId: 'alice', role: 'PLAYER', user: { displayName: 'Alice' } }],
    });
    render(<MapCanvas />);
    show(token('tok-a', 'Alya', 2, 10, { type: TokenType.PLAYER, controlledBy: 'alice' }), token('tok-wolf', 'Dire Wolf', 4, 19, { visible: false }));
    fire('fog:updated', { mapId: 'map-a', fogState: { fogCols: 20, fogRows: 20, cellPx: 50, revealed: new Array(400).fill(true) } });
    tap(1, square(4, 19));
    expect(putBack()!.parentElement).toHaveTextContent('Holding Dire Wolf');

    fireEvent.click(screen.getByLabelText('Toggle DM player view preview'));

    expect(putBack()!.parentElement).not.toHaveTextContent('Dire Wolf');
    expect(putBack()!.parentElement).toHaveTextContent('Holding Unknown creature');
  });

  it("does not show while a finger's drag carries a token, which its lift puts down", () => {
    render(<MapCanvas />);
    show(goblin());
    const finger = contact('touch', 1);
    finger.down(surface(), square(0, 19));
    finger.move(surface(), square(2, 19));

    expect(putBack()).toBeNull();
    finger.up(surface(), square(2, 19));
  });
});

describe('the Ping button', () => {
  const pingButton = () => screen.getByRole('button', { name: /^Ping/ });
  const goblin = () => token('tok-goblin', 'Goblin', 0, 19);

  it('arms one ping: the next tap pings there and picks nothing up, and the one after works as usual', () => {
    render(<MapCanvas />);
    show(goblin());

    fireEvent.click(pingButton());
    expect(pingButton()).toHaveAttribute('aria-pressed', 'true');
    tap(1, square(0, 19));

    expect(sentOf('map.ping')).toEqual([{ mapId: 'map-a', x: 25, y: 25 }]);
    expect(sentOf('token.move.start')).toEqual([]);
    expect(pingButton()).toHaveAttribute('aria-pressed', 'false');
    tap(2, square(0, 19));
    expect(sentOf('map.ping')).toHaveLength(1);
    expect(sentOf('token.move.start')).toHaveLength(1);
  });

  // The button is a way to do what Tab does without a keyboard.
  it('sends what Tab sends at the same point, by a click too', () => {
    render(<MapCanvas />);
    // Tab pings while the map has the keyboard and the pointer is over it.
    screen.getByRole('application', { name: 'Map' }).focus();
    mouse.move(surface(), px(510, 260));
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    const byTab = sentOf('map.ping');
    h.sent.length = 0;

    fireEvent.click(pingButton());
    mouse.down(surface(), px(510, 260));
    mouse.up(surface(), px(510, 260));

    expect(byTab).toEqual([{ mapId: 'map-a', x: 510, y: 260 }]);
    expect(sentOf('map.ping')).toEqual(byTab);
  });

  it('is put away by pressing it again, and pings nothing', () => {
    render(<MapCanvas />);

    fireEvent.click(pingButton());
    fireEvent.click(pingButton());
    tap(1, px(510, 260));

    expect(pingButton()).toHaveAttribute('aria-pressed', 'false');
    expect(sentOf('map.ping')).toEqual([]);
  });

  it('stays armed while one finger pans the map, and pings on the tap after', () => {
    render(<MapCanvas />);

    fireEvent.click(pingButton());
    swipe(1, px(500, 500), px(520, 500), px(550, 500));
    expect(sentOf('map.ping')).toEqual([]);
    tap(2, px(560, 260));

    // The map moved 50 pixels right.
    expect(sentOf('map.ping')).toEqual([{ mapId: 'map-a', x: 510, y: 260 }]);
  });

  it('is used up by a long-press that pings, and kept by one that opens a menu', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      render(<MapCanvas />);
      show(goblin());
      fireEvent.click(pingButton());

      const onToken = contact('touch', 1);
      onToken.down(surface(), square(0, 19));
      act(() => { vi.advanceTimersByTime(500); });
      onToken.up(surface(), square(0, 19));
      expect(screen.getByText('Remove from Map')).toBeInTheDocument();
      expect(pingButton()).toHaveAttribute('aria-pressed', 'true');
      fireEvent.keyDown(window, { key: 'Escape' });

      const onGround = contact('touch', 2);
      onGround.down(surface(), px(510, 260));
      act(() => { vi.advanceTimersByTime(500); });
      onGround.up(surface(), px(510, 260));
      expect(sentOf('map.ping')).toEqual([{ mapId: 'map-a', x: 510, y: 260 }]);
      expect(pingButton()).toHaveAttribute('aria-pressed', 'false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('takes a tap off the map without pinging, and is spent', () => {
    render(<MapCanvas />);

    fireEvent.click(pingButton());
    tap(1, px(1010, 400));
    tap(2, px(510, 260));

    expect(sentOf('map.ping')).toEqual([]);
  });

  // The Esc order: the menu open on the map, then the armed ping, then the
  // held token, then the tools and the selection.
  it('is put away by Esc after a menu open on the map, and before a held token is put back', async () => {
    render(<MapCanvas />);
    show(goblin());
    tap(1, square(0, 19));
    fireEvent.click(pingButton());
    // The tap gave the map the keys; Enter opens the held token's menu.
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(await screen.findByText('Remove from Map')).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByText('Remove from Map')).toBeNull();
    expect(pingButton()).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(pingButton()).toHaveAttribute('aria-pressed', 'false');
    expect(sentOf('token.move')).toEqual([]);

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(sentOf('token.move')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 0, y: 19 }]);
    expect(sentOf('map.ping')).toEqual([]);
  });
});

// A finger has no hover, so after a tap the hover card is gone with the
// finger: the selected token's details show instead.
describe('the details of the selected token', () => {
  const wolf = () => token('tok-wolf', 'Dire Wolf', 4, 19, { conditions: ['poisoned', 'prone'] });
  const card = () => screen.queryByText('Dire Wolf')?.closest('.glass-panel') ?? null;
  const close = () => screen.getByRole('button', { name: 'Close details' });

  it('show after a player taps a creature, conditions in full, and stay once the finger has gone', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(wolf());

    tap(1, square(4, 19));

    expect(card()).not.toBeNull();
    expect(within(card() as HTMLElement).getByText('poisoned')).toBeInTheDocument();
    expect(within(card() as HTMLElement).getByText('prone')).toBeInTheDocument();
    expect(within(card() as HTMLElement).getByText('(4, 19)')).toBeInTheDocument();
    expect(within(card() as HTMLElement).getByText('Not yours to move')).toBeInTheDocument();
  });

  it('show the token a finger has just put down, on its new square', () => {
    render(<MapCanvas />);
    show(wolf());

    swipe(1, square(4, 19), square(5, 19), square(7, 18));

    expect(within(card() as HTMLElement).getByText('(7, 18)')).toBeInTheDocument();
  });

  it("show after a pen's tap too", () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(wolf());

    const pen = contact('pen', 5);
    pen.down(surface(), square(4, 19));
    pen.up(surface(), square(4, 19));
    pen.leave(surface());

    expect(card()).not.toBeNull();
  });

  // With a mouse, the hover card is all there is, as before.
  it("do not show for a mouse's selection once the pointer has left the token", () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(wolf());

    mouse.move(surface(), square(4, 19));
    mouse.down(surface(), square(4, 19));
    mouse.up(surface(), square(4, 19));
    expect(useGameStore.getState().selectedTokenId).toBe('tok-wolf');
    expect(card()).not.toBeNull();
    mouse.leave(surface());

    expect(card()).toBeNull();
  });

  it('give way to the card of a token the mouse points at', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(wolf(), token('tok-bat', 'Bat', 8, 19));
    tap(1, square(4, 19));

    mouse.move(surface(), square(8, 19));

    expect(screen.getByText('Bat')).toBeInTheDocument();
    expect(card()).toBeNull();
  });

  // A tap on a token is a fresh act of selecting it, the same token too.
  it('close on Close details, and come back on the next tap on a token, the same one included', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(wolf(), token('tok-bat', 'Bat', 8, 19));
    tap(1, square(4, 19));

    fireEvent.click(close());
    expect(card()).toBeNull();
    expect(useGameStore.getState().selectedTokenId).toBe('tok-wolf');
    tap(2, square(4, 19));
    expect(card()).not.toBeNull();

    fireEvent.click(close());
    tap(3, square(8, 19));
    expect(screen.getByText('Bat')).toBeInTheDocument();
  });

  it('stay closed while nothing selects a token again', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(wolf());
    tap(1, square(4, 19));
    fireEvent.click(close());

    swipe(2, px(500, 500), px(520, 500), px(550, 500));

    expect(card()).toBeNull();
    expect(useGameStore.getState().selectedTokenId).toBe('tok-wolf');
  });

  // The card stays until it is closed, over the bottom-left of the map,
  // where a player may well want to put a token down.
  describe('over the squares under it', () => {
    const CARD = { left: 16, top: 800, right: 368, bottom: 984 };
    const CLOSE = { left: 330, top: 808, right: 362, bottom: 840 };
    const inside = (r: typeof CARD, p: { clientX: number; clientY: number }) =>
      p.clientX >= r.left && p.clientX <= r.right && p.clientY >= r.top && p.clientY <= r.bottom;
    /** Whether a hit test passes through an element, by the pointer-events class nearest it. */
    const passesThrough = (el: Element) => {
      for (let at: Element | null = el; at; at = at.parentElement) {
        if (at.classList.contains('pointer-events-auto')) return false;
        if (at.classList.contains('pointer-events-none')) return true;
      }
      return false;
    };
    /**
     * The element a browser's hit test finds at a page point, standing in for
     * the one jsdom does not do: the card's close button, the card, or the map.
     */
    function hitTest(p: { clientX: number; clientY: number }): Element {
      const button = screen.getByRole('button', { name: 'Close details' });
      const panel = button.closest('.glass-panel')!;
      if (inside(CLOSE, p) && !passesThrough(button)) return button;
      if (inside(CARD, p) && !passesThrough(panel)) return panel;
      return surface();
    }
    const mine = () => token('tok-mine', 'Aldra', 12, 10, { type: TokenType.PLAYER, controlledBy: 'me' });

    it('let a tap on a square under the card reach the map', () => {
      h.set({ userRole: 'PLAYER' });
      render(<MapCanvas />);
      show(mine());
      tap(1, square(12, 10));
      expect(screen.getByRole('button', { name: 'Close details' })).toBeInTheDocument();

      // Square (2, 1), centred on (125, 925), is under the card.
      const point = square(2, 1);
      const target = hitTest(point);
      const finger = contact('touch', 2);
      finger.down(target, point);
      finger.up(target, point);

      expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-mine', mapId: 'map-a', x: 2, y: 1 }]);
    });

    it('keep Close details for a tap on it', () => {
      h.set({ userRole: 'PLAYER' });
      render(<MapCanvas />);
      show(mine());
      tap(1, square(12, 10));

      const target = hitTest({ clientX: 346, clientY: 824 });
      fireEvent.click(target);

      expect(screen.queryByRole('button', { name: 'Close details' })).toBeNull();
    });
  });

  it('go when the selection is cleared by a tap on empty ground', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(wolf());
    tap(1, square(4, 19));

    tap(2, square(10, 10));

    expect(useGameStore.getState().selectedTokenId).toBeNull();
    expect(card()).toBeNull();
  });

  it('take the place of the square readout while a finger pans', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(wolf());
    tap(1, square(4, 19));

    const finger = contact('touch', 2);
    finger.down(surface(), px(500, 500));
    finger.move(surface(), px(560, 500));

    // The one square shown is the card's.
    const squares = screen.getAllByText(/^\(-?\d+, -?\d+\)$/);
    expect(squares).toHaveLength(1);
    expect(card()!.contains(squares[0])).toBe(true);
    finger.up(surface(), px(560, 500));
  });

  describe('for a selection the screen does not draw', () => {
    it('show nothing once the selection has gone under fog', () => {
      h.set({ userRole: 'PLAYER', currentMap: mapWith({ fogEnabled: true }) });
      render(<MapCanvas />);
      show(wolf());
      fire('fog:cells', { mapId: 'map-a', revealedCells: Array.from({ length: 400 }, (_, i) => i) });
      tap(1, square(4, 19));
      expect(card()).not.toBeNull();

      fire('fog:cells', { mapId: 'map-a', revealedCells: [] });

      expect(card()).toBeNull();
    });

    it('show nothing once spirit tokens are hidden from the DM', () => {
      render(<MapCanvas />);
      show(token('tok-wolf', 'Dire Wolf', 4, 19, { layer: TokenLayer.SPIRIT }));
      tap(1, square(4, 19));
      tap(2, square(4, 19));
      expect(card()).not.toBeNull();

      fireEvent.click(screen.getByTitle('Spirit tokens shown, click to hide'));

      expect(card()).toBeNull();
    });

    it('show nothing for a hidden creature in Player Preview', () => {
      h.set({
        currentMap: mapWith({ fogEnabled: true }),
        memberships: [{ userId: 'alice', role: 'PLAYER', user: { displayName: 'Alice' } }],
      });
      render(<MapCanvas />);
      show(token('tok-a', 'Alya', 2, 10, { type: TokenType.PLAYER, controlledBy: 'alice' }), token('tok-wolf', 'Dire Wolf', 4, 19, { visible: false }));
      fire('fog:updated', { mapId: 'map-a', fogState: { fogCols: 20, fogRows: 20, cellPx: 50, revealed: new Array(400).fill(true) } });
      // The DM taps the hidden creature, picking it up, and taps it down again.
      tap(1, square(4, 19));
      tap(2, square(4, 19));
      expect(card()).not.toBeNull();

      fireEvent.click(screen.getByLabelText('Toggle DM player view preview'));

      expect(card()).toBeNull();
    });
  });
});

// A finger landing on the map while the on-screen keyboard is up for the
// chat would close the keyboard: the map takes the keys only once the
// finger's gesture reaches it.
describe('the keys and a finger', () => {
  function withChatBox() {
    render(<><input aria-label="Chat message" /><MapCanvas /></>);
    const box = screen.getByLabelText('Chat message');
    box.focus();
    return box;
  }
  const theMap = () => screen.getByRole('application', { name: 'Map' });

  it('stay in the chat box through a pinch on the map', () => {
    const box = withChatBox();

    const a = contact('touch', 1);
    const b = contact('touch', 2, false);
    a.down(surface(), px(400, 500));
    expect(document.activeElement).toBe(box);
    b.down(surface(), px(600, 500));
    a.move(surface(), px(350, 500));
    b.move(surface(), px(650, 500));
    a.up(surface(), px(350, 500));
    b.up(surface(), px(650, 500));

    expect(document.activeElement).toBe(box);
  });

  it('go to the map on a tap', () => {
    withChatBox();
    tap(1, px(500, 500));
    expect(document.activeElement).toBe(theMap());
  });

  it('go to the map as a drag starts', () => {
    withChatBox();
    const finger = contact('touch', 1);
    finger.down(surface(), px(500, 500));
    finger.move(surface(), px(560, 500));
    expect(document.activeElement).toBe(theMap());
  });

  it('go to the map on a long-press', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      withChatBox();
      contact('touch', 1).down(surface(), px(510, 260));
      act(() => { vi.advanceTimersByTime(500); });
      expect(document.activeElement).toBe(theMap());
    } finally {
      vi.useRealTimers();
    }
  });

  it('go to the map at once on a mouse or a pen press, as before', () => {
    const box = withChatBox();
    mouse.down(surface(), px(500, 500));
    mouse.up(surface(), px(500, 500));
    expect(document.activeElement).toBe(theMap());

    box.focus();
    const pen = contact('pen', 5);
    pen.down(surface(), px(500, 500));
    expect(document.activeElement).toBe(theMap());
    pen.up(surface(), px(500, 500));
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

    // Pressed off the light's centre, so putting it back at the press would show.
    const first = contact('touch', 1);
    first.down(surface(), px(260, 255));
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

describe('choosing another DM tool', () => {
  // Leaving Select keeps a wall being moved, so the finger's lift under the
  // new tool dropped the wall where it was.
  it("drops a finger's drag under way, putting a moved wall back", () => {
    h.set({ currentMap: mapWith({ wallSegments: [WALL_A] }) });
    render(<MapCanvas />);
    wallTool('Wall select mode');

    const finger = contact('touch', 1);
    finger.down(surface(), px(150, 100));
    finger.move(surface(), px(150, 130));
    finger.move(surface(), px(150, 150));
    fireEvent.click(screen.getByLabelText('Wall draw mode'));
    finger.move(surface(), px(150, 170));
    finger.up(surface(), px(150, 170));

    expect(sentOf('walls:replace')).toEqual([]);
  });
});

describe('the square under the pointer', () => {
  // A finger or a pen still pressing keeps it as it leaves the map; a mouse
  // clears it on any leave, as it always has.
  it('stays shown while a pen presses as it leaves, and goes when it lifts', () => {
    render(<MapCanvas />);
    const pen = contact('pen', 5);

    pen.move(surface(), px(60, 10), { buttons: 0 });
    expect(readout()).toBe('(1, 19)');
    pen.down(surface(), px(60, 10));
    pen.leave(surface(), 1);
    expect(readout()).toBe('(1, 19)');
    pen.up(surface(), px(60, 10));
    pen.leave(surface());
    expect(readout()).toBeNull();

    mouse.move(surface(), px(60, 10), 0);
    mouse.down(surface(), px(60, 10));
    mouse.leave(surface(), 1);
    expect(readout()).toBeNull();
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

describe('the AoE template by touch', () => {
  const drawing = recordDrawing();
  const overlay = () => document.querySelectorAll('canvas')[2];
  /** The overlay's calls of a kind in its last frame. */
  async function drawn(method: string): Promise<number[][]> {
    drawing.take(overlay());
    await nextFrame();
    return drawing.take(overlay()).filter((c) => c.method === method).map((c) => c.args as number[]);
  }
  async function shown() {
    render(<MapCanvas />);
    pictures.find((p) => p.src === '/api/assets/maps/x')!.load();
    await nextFrame();
    fireEvent.click(screen.getByTitle('AoE Shape — area of effect overlay'));
  }
  /** A 20-foot circle is 4 squares, 200 pixels, across its radius. */
  const circles = (calls: number[][]) => calls.filter((a) => a[2] === 200).map((a) => [a[0], a[1]]);

  it('snaps a circle to the middle of the square it is placed in', async () => {
    await shown();

    tap(1, px(110, 110));

    expect(circles(await drawn('arc'))).toEqual([[125, 125]]);
  });

  it('places it where the finger tapped with Snap to grid off, as Alt+click does with a mouse', async () => {
    await shown();
    mouse.down(surface(), px(110, 110), 0, { altKey: true });
    mouse.up(surface(), px(110, 110));
    mouse.leave(surface());
    const byAlt = circles(await drawn('arc'));
    fireEvent.click(screen.getByText('× Clear placement'));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Snap to grid' }));
    tap(1, px(110, 110));

    expect(byAlt).toEqual([[110, 110]]);
    expect(circles(await drawn('arc'))).toEqual(byAlt);
  });

  it("tells a finger how to aim and place it, which has no hover and no Alt key", async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(pointer: coarse)', media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    }));
    await shown();
    fireEvent.click(screen.getByText('Cone'));
    expect(screen.getByText('Untick Snap to grid to place it freely, off the grid')).toBeInTheDocument();

    tap(1, px(125, 125));

    expect(screen.getByText('Drag from its square to aim it')).toBeInTheDocument();
  });

  // A finger has no hover to aim with: a drag sets the cone's square where it
  // lands and aims it at where it lifts, and the aim stays after the lift.
  it.each([
    ['east', 325, (x: number) => x > 150],
    ['west', -75, (x: number) => x < 100],
  ])('aims a cone by the drag, %s, and keeps the aim after the lift', async (_way, toX, onThatSide) => {
    await shown();
    fireEvent.click(screen.getByText('Cone'));

    swipe(1, px(125, 125), px(125 + (toX - 125) / 2, 125), px(toX, 125));

    const corners = await drawn('lineTo');
    expect(corners.length).toBeGreaterThanOrEqual(2);
    for (const [x] of corners) expect(onThatSide(x!)).toBe(true);
  });
});
