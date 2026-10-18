/**
 * What each map tool sends, and which tool a click goes to, driven through
 * MapCanvas: the DM's wall, light and fog tools, doors, the ruler and the AoE
 * template, and the right button. These describe the current behaviour, so
 * moving the input handling into per-tool modules can be shown to change
 * nothing. A test marked "as it is" pins something known to be wrong; the fix
 * changes that test on purpose.
 *
 * The stand-ins are those of MapCanvasInput.test.tsx and
 * MapCanvasEditing.test.tsx: the role and current map live in a store the
 * test changes, and the socket records what the page sends and delivers
 * server events to the listeners the page registered. Canvas drawing is
 * switched off, so the view starts at 100% with no pan: screen pixel (x, y)
 * is map pixel (x, y), and a square is 50 pixels.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { Profiler } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TokenType, type Map as CampaignMap, type Token } from '@/types';
import type { LightSource, WallSegment } from '@/types/walls';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'DM' as string,
    currentMap: null as unknown,
  };
  const handlers = new Map<string, Set<(data: never) => void>>();
  const sent: Array<[string, unknown]> = [];
  const updateToken = vi.fn();
  const addToken = vi.fn();
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
    updateToken,
    addToken,
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
  const noop = () => undefined;
  const setCurrentMap = (next: unknown) => {
    h.set({ currentMap: typeof next === 'function' ? (next as (p: unknown) => unknown)(h.state.currentMap) : next });
  };
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
  const record = (event: string) => (payload: unknown) => { h.sent.push([event, payload]); };
  const client = new Proxy({
    getSocket: () => h.raw,
    onMapChanged: (cb: (data: never) => void) => { h.raw.on('map.changed', cb); },
    off: (event: string, cb: (data: never) => void) => { h.raw.off(event, cb); },
    onSpiritLayerToggled: (cb: (data: never) => void) => { h.raw.on('spirit_layer.toggled', cb); },
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
  const client = new Proxy({}, {
    get: (_target, prop: string) =>
      prop === 'updateToken' ? h.updateToken : prop === 'addToken' ? h.addToken : vi.fn().mockResolvedValue({}),
  });
  return { api: client, default: client };
});

import MapCanvas from '../MapCanvas';
import { useGameStore } from '@/stores/gameStore';

const seg = (id: string, x1: number, y1: number, x2: number, y2: number, type: WallSegment['type'] = 'wall'): WallSegment =>
  ({ id, x1, y1, x2, y2, type });

/** A plain wall along y 100 from x 100 to 200, and another from 300 to 400. */
const WALL_A = seg('a1', 100, 100, 200, 100);
const WALL_B = seg('a2', 300, 100, 400, 100);

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
    wallSegments: [WALL_A, WALL_B],
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

const down = (p: { clientX: number; clientY: number }, extra: Record<string, unknown> = {}) =>
  fireEvent.mouseDown(surface(), { ...p, button: 0, buttons: 1, detail: 1, ...extra });
const move = (p: { clientX: number; clientY: number }, buttons = 1) =>
  fireEvent.mouseMove(surface(), { ...p, buttons });
const up = (p: { clientX: number; clientY: number }, button = 0) =>
  fireEvent.mouseUp(surface(), { ...p, button });
function click(p: { clientX: number; clientY: number }, extra: Record<string, unknown> = {}) {
  down(p, extra);
  up(p);
}
function drag(from: { clientX: number; clientY: number }, ...to: Array<{ clientX: number; clientY: number }>) {
  down(from);
  for (const p of to) move(p);
  up(to[to.length - 1] ?? from);
}

function sentOf(event: string): unknown[] {
  return h.sent.filter(([e]) => e === event).map(([, p]) => p);
}
const lastOf = (event: string): unknown => sentOf(event).slice(-1)[0];
/** The walls the last bulk replace sent, without their generated ids. */
function lastWalls(): Array<Omit<WallSegment, 'id'> & { id?: string }> {
  const sentNow = lastOf('walls:replace') as { segments: WallSegment[] } | undefined;
  if (!sentNow) throw new Error('no walls:replace was sent');
  return sentNow.segments.map((s) => (['a1', 'a2', 'd1'].includes(s.id) ? s : { ...s, id: undefined }));
}
const press = (key: string, opts: { ctrlKey?: boolean; shiftKey?: boolean } = {}) =>
  fireEvent.keyDown(document.body, { key, ...opts });

function fire(event: string, payload: unknown) {
  act(() => {
    h.handlers.get(event)?.forEach((fn) => (fn as (data: unknown) => void)(payload));
  });
}

function show(...tokens: Token[]) {
  act(() => { useGameStore.getState().setTokens(tokens); });
}

function wallTool(label: string) {
  fireEvent.click(screen.getByText('Walls'));
  fireEvent.click(screen.getByLabelText(label));
}

const readout = () => screen.queryByText(/^\(-?\d+, -?\d+\)$/)?.textContent ?? null;
const rulerOn = () => screen.queryByTitle(/^Ruler color:/) !== null;
const aoeOn = () => screen.queryByText('AoE Shape') !== null;

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.sent.length = 0;
  h.handlers.clear();
  h.updateToken.mockReset().mockResolvedValue({});
  h.addToken.mockReset().mockResolvedValue({ token: token('tok-new', 'Aria', 2, 17) });
  useGameStore.getState().setTokens([]);
  h.set({ userRole: 'DM', currentMap: mapWith() });
});

describe('the wall draw tool', () => {
  it('sends a wall for each click after the first, snapped to the grid', () => {
    render(<MapCanvas />);
    wallTool('Wall draw mode');

    click(px(102, 98));
    expect(sentOf('wall:add')).toEqual([]);
    click(px(248, 252));
    click(px(248, 402));

    expect(sentOf('wall:add').map((p) => (p as { segment: WallSegment }).segment)).toEqual([
      expect.objectContaining({ x1: 100, y1: 100, x2: 250, y2: 250, type: 'wall' }),
      expect.objectContaining({ x1: 250, y1: 250, x2: 250, y2: 400, type: 'wall' }),
    ]);
  });

  it('ends the line on a double-click, so the next click starts a new one', () => {
    render(<MapCanvas />);
    wallTool('Wall draw mode');

    click(px(100, 300));
    click(px(200, 300));
    click(px(200, 300), { detail: 2 });
    click(px(400, 400));

    expect(sentOf('wall:add')).toHaveLength(1);
  });

  it('drops a half-drawn line on the first Escape and puts the tool away on the second', () => {
    render(<MapCanvas />);
    wallTool('Wall draw mode');

    click(px(100, 300));
    press('Escape');
    click(px(200, 300));
    expect(sentOf('wall:add')).toEqual([]);

    press('Escape');
    press('Escape');
    click(px(300, 300));
    click(px(400, 300));
    expect(sentOf('wall:add')).toEqual([]);
  });

  it('turns a door drawn along a wall into a section of that wall', () => {
    render(<MapCanvas />);
    fireEvent.click(screen.getByText('Walls'));
    fireEvent.click(screen.getByLabelText('Wall draw mode'));
    fireEvent.click(screen.getByLabelText('Wall type: Door'));

    click(px(100, 100));
    click(px(150, 100));

    expect(sentOf('wall:remove')).toEqual([expect.objectContaining({ mapId: 'map-a', segmentId: 'a1' })]);
    expect(sentOf('wall:add').map((p) => (p as { segment: WallSegment }).segment)).toEqual([
      expect.objectContaining({ x1: 100, y1: 100, x2: 150, y2: 100, type: 'door-closed' }),
      expect.objectContaining({ x1: 150, y1: 100, x2: 200, y2: 100, type: 'wall' }),
    ]);
  });
});

describe('the polygon tool', () => {
  it('sends the closed shape as one replace on a double-click', () => {
    render(<MapCanvas />);
    wallTool('Polygon wall mode');

    click(px(500, 500));
    click(px(700, 500));
    click(px(700, 700));
    click(px(700, 700), { detail: 2 });

    expect(lastWalls()).toEqual([
      WALL_A, WALL_B,
      { x1: 500, y1: 500, x2: 700, y2: 500, type: 'wall' },
      { x1: 700, y1: 500, x2: 700, y2: 700, type: 'wall' },
      { x1: 700, y1: 700, x2: 500, y2: 500, type: 'wall' },
    ]);
  });

  it('closes the shape on a click beside its first corner', () => {
    render(<MapCanvas />);
    wallTool('Polygon wall mode');

    click(px(500, 500));
    click(px(700, 500));
    click(px(700, 700));
    click(px(505, 505));

    expect(lastWalls()).toHaveLength(5);
  });

  it('takes back the last corner on Ctrl+Z, and the whole shape on Escape', () => {
    render(<MapCanvas />);
    wallTool('Polygon wall mode');

    click(px(500, 500));
    click(px(700, 500));
    click(px(900, 500));
    press('z', { ctrlKey: true });
    click(px(700, 700));
    click(px(700, 700), { detail: 2 });
    expect(lastWalls().slice(2)).toEqual([
      { x1: 500, y1: 500, x2: 700, y2: 500, type: 'wall' },
      { x1: 700, y1: 500, x2: 700, y2: 700, type: 'wall' },
      { x1: 700, y1: 700, x2: 500, y2: 500, type: 'wall' },
    ]);

    h.sent.length = 0;
    click(px(100, 500));
    click(px(300, 500));
    click(px(300, 700));
    press('Escape');
    click(px(300, 700), { detail: 2 });
    expect(sentOf('walls:replace')).toEqual([]);
  });
});

describe('the polygon tool on a page where the map does not start at the corner', () => {
  // In the app the canvas sits beside the sidebar and under the header. The
  // close compared the pointer's page position with the corner's canvas
  // position, so it never closed anywhere but the page's top-left (F350).
  const original = HTMLCanvasElement.prototype.getBoundingClientRect;
  beforeEach(() => {
    HTMLCanvasElement.prototype.getBoundingClientRect = () =>
      ({ left: 100, top: 50, right: 1100, bottom: 1050, width: 1000, height: 1000, x: 100, y: 50, toJSON: () => ({}) }) as DOMRect;
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getBoundingClientRect = original;
  });
  const onPage = (x: number, y: number) => px(x + 100, y + 50);

  it('closes the shape on a click beside its first corner', () => {
    render(<MapCanvas />);
    wallTool('Polygon wall mode');

    click(onPage(500, 500));
    click(onPage(700, 500));
    click(onPage(700, 700));
    click(onPage(505, 505));

    expect(lastWalls().slice(2)).toEqual([
      { x1: 500, y1: 500, x2: 700, y2: 500, type: 'wall' },
      { x1: 700, y1: 500, x2: 700, y2: 700, type: 'wall' },
      { x1: 700, y1: 700, x2: 500, y2: 500, type: 'wall' },
    ]);
  });
});

describe('the split tool', () => {
  it('cuts a wall in two where it is clicked', () => {
    render(<MapCanvas />);
    wallTool('Wall split mode');

    click(px(140, 103));

    expect(sentOf('wall:remove')).toEqual([expect.objectContaining({ segmentId: 'a1' })]);
    expect(sentOf('wall:add').map((p) => (p as { segment: WallSegment }).segment)).toEqual([
      expect.objectContaining({ x1: 100, y1: 100, x2: 140, y2: 100, type: 'wall' }),
      expect.objectContaining({ x1: 140, y1: 100, x2: 200, y2: 100, type: 'wall' }),
    ]);
  });

  it('does not cut within 10 pixels of an end', () => {
    render(<MapCanvas />);
    wallTool('Wall split mode');

    click(px(195, 100));

    expect(sentOf('wall:remove')).toEqual([]);
  });
});

describe('the erase tool', () => {
  it('removes every wall the stroke passes over, in one replace', () => {
    render(<MapCanvas />);
    wallTool('Wall erase mode');

    drag(px(150, 110), px(250, 110), px(350, 110));

    expect(lastWalls()).toEqual([]);
    expect(sentOf('walls:replace')).toHaveLength(1);
  });

  it('sends nothing for a stroke that touches no wall', () => {
    render(<MapCanvas />);
    wallTool('Wall erase mode');

    drag(px(150, 500), px(350, 500));

    expect(sentOf('walls:replace')).toEqual([]);
  });
});

describe('the brush tool', () => {
  it('turns a stroke into walls, simplified, in one replace', () => {
    render(<MapCanvas />);
    wallTool('Brush wall mode');

    drag(px(100, 300), px(150, 300), px(200, 300), px(250, 300), px(300, 300));

    expect(lastWalls().slice(2)).toEqual([{ x1: 100, y1: 300, x2: 300, y2: 300, type: 'wall' }]);
  });
});

describe('the wall select tool', () => {
  it('moves a wall dragged from its middle, in one replace', () => {
    render(<MapCanvas />);
    wallTool('Wall select mode');

    drag(px(150, 100), px(150, 120), px(150, 150));

    expect(lastWalls()).toEqual([{ ...WALL_A, y1: 150, y2: 150 }, WALL_B]);
    expect(sentOf('walls:replace')).toHaveLength(1);
  });

  it('moves the end of every wall that shares a dragged corner', () => {
    h.set({ currentMap: mapWith({ wallSegments: [WALL_A, seg('a3', 200, 100, 200, 300)] }) });
    render(<MapCanvas />);
    wallTool('Wall select mode');

    drag(px(200, 100), px(220, 100), px(250, 100));

    expect(lastWalls()).toEqual([
      { ...WALL_A, x2: 250 },
      { id: 'a3', x1: 250, y1: 100, x2: 200, y2: 300, type: 'wall' },
    ].map((s) => (s.id === 'a3' ? { ...s, id: undefined } : s)));
  });

  it('selects what a box touches, and Delete removes it', () => {
    render(<MapCanvas />);
    wallTool('Wall select mode');

    drag(px(250, 50), px(350, 120), px(450, 150));
    press('Delete');

    expect(lastWalls()).toEqual([WALL_A]);
  });

  it('adds to the selection with Shift, and nudges it with the arrow keys', () => {
    render(<MapCanvas />);
    wallTool('Wall select mode');

    click(px(150, 100));
    click(px(350, 100), { shiftKey: true });
    press('ArrowDown');

    expect(lastWalls()).toEqual([{ ...WALL_A, y1: 101, y2: 101 }, { ...WALL_B, y1: 101, y2: 101 }]);
  });

  it('drops the selection on the first Escape and keeps the tool', () => {
    render(<MapCanvas />);
    wallTool('Wall select mode');

    click(px(150, 100));
    press('Escape');
    press('Delete');
    expect(sentOf('walls:replace')).toEqual([]);

    press('a', { ctrlKey: true });
    press('Delete');
    expect(lastWalls()).toEqual([]);
  });
});

describe('the light tools', () => {
  const lamp: LightSource = { id: 'l1', x: 250, y: 250, brightRadius: 4, dimRadius: 8, color: '#ffcc66', enabled: true };

  it('places a light with the panel settings where the map is clicked', () => {
    render(<MapCanvas />);
    fireEvent.click(screen.getByText('Lights'));
    fireEvent.click(screen.getByText('Place'));

    click(px(260, 240));

    expect(sentOf('light:add')).toEqual([expect.objectContaining({
      mapId: 'map-a',
      light: expect.objectContaining({ x: 260, y: 240, brightRadius: 4, dimRadius: 8, color: '#ffcc66', enabled: true }),
    })]);
  });

  it('moves a light dragged with the select tool, sending it once on release', () => {
    h.set({ currentMap: mapWith({ lights: [lamp] }) });
    render(<MapCanvas />);
    fireEvent.click(screen.getByText('Lights'));
    fireEvent.click(screen.getByText('Select'));

    drag(px(255, 250), px(280, 280), px(300, 310));

    expect(sentOf('light:update')).toEqual([expect.objectContaining({
      light: expect.objectContaining({ id: 'l1', x: 300, y: 310 }),
    })]);
  });

  // The keyboard listener was not registered again when the light tool was
  // chosen, so Escape read the tool as it had been before: none.
  it('puts the tool away on Escape', () => {
    render(<MapCanvas />);
    fireEvent.click(screen.getByText('Lights'));
    fireEvent.click(screen.getByText('Place'));

    press('Escape');
    click(px(260, 240));

    expect(sentOf('light:add')).toEqual([]);
  });
});

describe('the fog box tools', () => {
  const fogState = { fogCols: 20, fogRows: 20, cellPx: 50, revealed: new Array(400).fill(false) };

  function fogTool(label: string) {
    h.set({ currentMap: mapWith({ fogEnabled: true }) });
    render(<MapCanvas />);
    fire('fog:updated', { mapId: 'map-a', fogState });
    fireEvent.click(screen.getByText('Fog of War'));
    fireEvent.click(screen.getByLabelText(label));
  }

  it('reveals every square the box covers, in one operation', () => {
    fogTool('Fog reveal box');

    drag(px(60, 60), px(120, 90), px(160, 110));

    expect(sentOf('fog:operation')).toEqual([{
      mapId: 'map-a',
      operation: { op: 'reveal', cells: expect.arrayContaining([21, 22, 23, 41, 42, 43]) },
    }]);
    expect((sentOf('fog:operation')[0] as { operation: { cells: number[] } }).operation.cells).toHaveLength(6);
  });

  it('hides with the hide box', () => {
    fogTool('Fog hide box');

    drag(px(60, 60), px(70, 70));

    expect(sentOf('fog:operation')).toEqual([{ mapId: 'map-a', operation: { op: 'hide', cells: [21] } }]);
  });

  it('abandons a box on Escape', () => {
    fogTool('Fog reveal box');

    down(px(60, 60));
    move(px(160, 110));
    press('Escape');
    up(px(160, 110));

    expect(sentOf('fog:operation')).toEqual([]);
  });
});

describe('doors with no tool up', () => {
  const door = seg('d1', 100, 100, 200, 100, 'door-closed');

  it('open on a click for the DM', () => {
    h.set({ currentMap: mapWith({ wallSegments: [door] }) });
    render(<MapCanvas />);

    click(px(150, 104));

    expect(sentOf('wall:update')).toEqual([expect.objectContaining({ segment: { ...door, type: 'door-open' } })]);
  });

  it('say so when locked, and stay shut', async () => {
    h.set({ currentMap: mapWith({ wallSegments: [{ ...door, type: 'door-locked' }] }) });
    render(<MapCanvas />);

    click(px(150, 104));

    expect(await screen.findByText('This door is locked.')).toBeInTheDocument();
    expect(sentOf('wall:update')).toEqual([]);
  });

  it('take the click before the ruler does', () => {
    h.set({ currentMap: mapWith({ wallSegments: [door] }) });
    render(<MapCanvas />);
    fireEvent.click(screen.getByTitle('Ruler — measure distance'));

    click(px(150, 104));

    expect(sentOf('wall:update')).toHaveLength(1);
  });

  it('are not toggled while a wall tool is up', () => {
    h.set({ currentMap: mapWith({ wallSegments: [door] }) });
    render(<MapCanvas />);
    wallTool('Wall select mode');

    click(px(150, 104));

    expect(sentOf('wall:update')).toEqual([]);
  });

  it('open the door menu on a right-click', () => {
    h.set({ currentMap: mapWith({ wallSegments: [door] }) });
    render(<MapCanvas />);

    fireEvent.contextMenu(surface(), px(150, 104));

    expect(screen.getByText(/^Lock/)).toBeInTheDocument();
  });
});

describe('the ruler and the AoE template', () => {
  it('are never on together', () => {
    render(<MapCanvas />);

    fireEvent.click(screen.getByTitle('Ruler — measure distance'));
    expect(rulerOn()).toBe(true);
    fireEvent.click(screen.getByTitle('AoE Shape — area of effect overlay'));
    expect(aoeOn()).toBe(true);
    expect(rulerOn()).toBe(false);
    fireEvent.click(screen.getByTitle('Ruler — measure distance'));
    expect(aoeOn()).toBe(false);
  });

  it('turn the ruler off when a player picks up their token', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(token('tok-mine', 'Aldra', 0, 19, { type: TokenType.PLAYER, controlledBy: 'me' }));
    fireEvent.click(screen.getByTitle('Ruler — measure distance'));

    click(square(0, 19));

    expect(sentOf('token.move.start')).toHaveLength(1);
    expect(rulerOn()).toBe(false);
  });

  it("take the DM's click with the ruler up, so no token is picked up", () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));
    fireEvent.click(screen.getByTitle('Ruler — measure distance'));

    click(square(0, 19));

    expect(sentOf('token.move.start')).toEqual([]);
  });

  it('take the click with the AoE template up, before a held token is put down', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));
    click(square(0, 19));
    fireEvent.click(screen.getByTitle('AoE Shape — area of effect overlay'));

    click(square(3, 19));

    expect(sentOf('token.move.end')).toEqual([]);
  });

  it('stay armed while a wall is half-drawn: Escape drops the wall first', () => {
    render(<MapCanvas />);
    fireEvent.click(screen.getByTitle('AoE Shape — area of effect overlay'));
    wallTool('Wall draw mode');
    click(px(100, 300));

    press('Escape');
    expect(aoeOn()).toBe(true);
    click(px(200, 300));
    expect(sentOf('wall:add')).toEqual([]);
  });
});

describe('the right button', () => {
  it('pans while a DM tool is up', () => {
    render(<MapCanvas />);
    wallTool('Wall draw mode');

    fireEvent.mouseDown(surface(), { clientX: 500, clientY: 500, button: 2, buttons: 2 });
    fireEvent.mouseMove(surface(), { clientX: 550, clientY: 500, buttons: 2 });
    fireEvent.mouseUp(surface(), { clientX: 550, clientY: 500, button: 2 });

    fireEvent.mouseMove(surface(), { clientX: 60, clientY: 10, buttons: 0 });
    expect(readout()).toBe('(0, 19)');
  });

  it('opens no token menu while a wall tool is up', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));
    wallTool('Wall draw mode');

    fireEvent.contextMenu(surface(), square(0, 19));

    expect(screen.queryByText('Remove from Map')).not.toBeInTheDocument();
  });

  // A pan with the right button ended in the token menu (F353).
  it('opens no token menu while the fog tool is up', () => {
    h.set({ currentMap: mapWith({ fogEnabled: true }) });
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));
    fire('fog:updated', { mapId: 'map-a', fogState: { fogCols: 20, fogRows: 20, cellPx: 50, revealed: new Array(400).fill(false) } });
    fireEvent.click(screen.getByText('Fog of War'));
    fireEvent.click(screen.getByLabelText('Fog reveal box'));

    fireEvent.contextMenu(surface(), square(0, 19));

    expect(screen.queryByText('Remove from Map')).not.toBeInTheDocument();
  });

  it('opens no token or door menu while the light tool is up', () => {
    h.set({ currentMap: mapWith({ wallSegments: [seg('d1', 100, 100, 200, 100, 'door-closed')] }) });
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));
    fireEvent.click(screen.getByText('Lights'));
    fireEvent.click(screen.getByText('Place'));

    fireEvent.contextMenu(surface(), square(0, 19));
    fireEvent.contextMenu(surface(), px(150, 104));

    expect(screen.queryByText('Remove from Map')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Lock/)).not.toBeInTheDocument();
  });
});

describe('switching tools', () => {
  it('puts the wall tool away when the light tool is chosen', () => {
    render(<MapCanvas />);
    wallTool('Wall draw mode');
    fireEvent.click(screen.getByText('Lights'));
    fireEvent.click(screen.getByText('Place'));

    click(px(100, 300));
    click(px(200, 300));

    expect(sentOf('wall:add')).toEqual([]);
    expect(sentOf('light:add')).toHaveLength(2);
  });

  it('keeps a half-drawn wall across a switch to the fog tool and back (as it is)', () => {
    h.set({ currentMap: mapWith({ fogEnabled: true }) });
    render(<MapCanvas />);
    fire('fog:updated', { mapId: 'map-a', fogState: { fogCols: 20, fogRows: 20, cellPx: 50, revealed: new Array(400).fill(false) } });
    wallTool('Wall draw mode');
    click(px(100, 300));

    fireEvent.click(screen.getByText('Fog of War'));
    fireEvent.click(screen.getByLabelText('Fog reveal box'));
    fireEvent.click(screen.getByLabelText('Wall draw mode'));
    click(px(200, 300));

    expect(sentOf('wall:add').map((p) => (p as { segment: WallSegment }).segment)).toEqual([
      expect.objectContaining({ x1: 100, y1: 300, x2: 200, y2: 300 }),
    ]);
  });
});

describe("the DM's spirit token button", () => {
  it('says what a click will do', () => {
    render(<MapCanvas />);

    fireEvent.click(screen.getByTitle('Spirit tokens shown, click to hide'));

    expect(screen.getByTitle('Spirit tokens hidden — click to show')).toBeInTheDocument();
  });
});

describe('Preview Player View', () => {
  const previewButton = () => screen.queryByLabelText('Toggle DM player view preview');

  it('can still be ended after fog and lighting are both turned off', () => {
    h.set({ currentMap: mapWith({ fogEnabled: true }) });
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));
    fireEvent.click(previewButton()!);
    expect(previewButton()).toHaveTextContent('DM View');

    fireEvent.click(screen.getByText('Fog of War'));
    fireEvent.click(screen.getByLabelText('Fog of war on this map'));

    expect(previewButton()).toHaveTextContent('DM View');
    fireEvent.click(previewButton()!);
    expect(previewButton()).toBeNull();
  });

  it('still places a light, so the DM sees its effect as the player does', () => {
    h.set({ currentMap: mapWith({ lightingEnabled: true }) });
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));
    fireEvent.click(screen.getByText('Lights'));
    fireEvent.click(screen.getByText('Place'));
    fireEvent.click(previewButton()!);
    expect(previewButton()).toHaveTextContent('DM View');

    click(px(400, 400));

    expect(sentOf('light:add')).toHaveLength(1);
  });

  it('does not select or drag a light, since the light markers are hidden', () => {
    const lamp: LightSource = { id: 'l1', x: 250, y: 250, brightRadius: 4, dimRadius: 8, color: '#ffcc66', enabled: true };
    h.set({ currentMap: mapWith({ lightingEnabled: true, lights: [lamp] }) });
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));
    fireEvent.click(screen.getByText('Lights'));
    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(previewButton()!);
    expect(previewButton()).toHaveTextContent('DM View');

    drag(px(255, 250), px(280, 280), px(300, 310));

    expect(sentOf('light:update')).toEqual([]);
  });
});

describe("the token menu's Hide, Obscure and Spirit Realm actions", () => {
  const refused = (message?: string) => Object.assign(new Error('refused'), { response: { status: 409, data: message ? { message } : {} } });

  it.each([
    ['Hide from Players', {}],
    ['Obscure Identity', {}],
    ['Send to Spirit Realm', {}],
    ['Return to Material Plane', { layer: 'spirit' }],
  ] as const)('say why when %s is refused', async (item, extra) => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19, extra as Partial<Token>));
    h.updateToken.mockRejectedValue(refused('The map is being changed by someone else'));

    fireEvent.contextMenu(surface(), square(0, 19));
    fireEvent.click(screen.getByText(item));

    expect(await screen.findByText('The map is being changed by someone else')).toBeInTheDocument();
  });

  it('say so in plain words when the server gives no reason', async () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));
    h.updateToken.mockRejectedValue(refused());

    fireEvent.contextMenu(surface(), square(0, 19));
    fireEvent.click(screen.getByText('Hide from Players'));

    expect(await screen.findByText('Could not hide the token from players')).toBeInTheDocument();
  });
});

describe('a character dropped from the roster', () => {
  const drag = JSON.stringify({ type: 'character-token', characterId: 'char-1', name: 'Aria', imageUrl: '', userId: 'player-1' });
  const drop = () => {
    const container = surface().parentElement!.parentElement!;
    fireEvent.drop(container, { clientX: 125, clientY: 125, dataTransfer: { getData: () => drag } });
  };

  it('says why when the map refuses it', async () => {
    render(<MapCanvas />);
    h.addToken.mockRejectedValue(Object.assign(new Error('refused'), { response: { status: 400, data: { message: 'This map already has the most tokens it can hold' } } }));

    drop();

    expect(await screen.findByText('This map already has the most tokens it can hold')).toBeInTheDocument();
  });

  it('says so in plain words when the server gives no reason', async () => {
    render(<MapCanvas />);
    h.addToken.mockRejectedValue(new Error('network down'));

    drop();

    expect(await screen.findByText('Could not place Aria on the map')).toBeInTheDocument();
  });
});

describe("a player's right-click on a token", () => {
  // The token menu's box, drawn whether or not anything in it applies.
  const tokenMenu = () => document.querySelector('.glass-panel.fixed');

  it('opens nothing for a creature, where the menu would offer them nothing (F354)', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19), token('tok-crate', 'Crate', 2, 19, { type: TokenType.OBJECT }));

    fireEvent.contextMenu(surface(), square(0, 19));
    expect(tokenMenu()).toBeNull();
    fireEvent.contextMenu(surface(), square(2, 19));
    expect(tokenMenu()).toBeNull();
  });

  it('still opens the menu for the DM', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));

    fireEvent.contextMenu(surface(), square(0, 19));

    expect(tokenMenu()).not.toBeNull();
  });
});

describe('letting go of the mouse outside the map (F352)', () => {
  const releaseOutside = (button = 0) => fireEvent.mouseUp(document.body, { button });

  it('finishes an erase stroke', () => {
    render(<MapCanvas />);
    wallTool('Wall erase mode');

    down(px(150, 110));
    move(px(350, 110));
    fireEvent.mouseLeave(surface());
    releaseOutside();

    expect(lastWalls()).toEqual([]);
    h.sent.length = 0;
    fireEvent.mouseMove(surface(), { ...px(150, 110), buttons: 0 });
    expect(sentOf('walls:replace')).toEqual([]);
  });

  it('finishes a brush stroke', () => {
    render(<MapCanvas />);
    wallTool('Brush wall mode');

    down(px(100, 300));
    move(px(200, 300));
    move(px(300, 300));
    fireEvent.mouseLeave(surface());
    releaseOutside();

    expect(lastWalls().slice(2)).toEqual([{ x1: 100, y1: 300, x2: 300, y2: 300, type: 'wall' }]);
  });

  // A right-button pan left on blocked the select tool's hover, so a wall
  // under the pointer no longer showed it could be picked.
  it('ends a right-button pan', () => {
    render(<MapCanvas />);
    wallTool('Wall select mode');

    fireEvent.mouseDown(surface(), { clientX: 500, clientY: 500, button: 2, buttons: 2 });
    fireEvent.mouseLeave(surface());
    releaseOutside(2);
    fireEvent.mouseMove(surface(), { ...px(150, 102), buttons: 0 });

    expect(surface().className).toContain('cursor-pointer');
  });
});

describe('switching maps (F349)', () => {
  const mapB = () => ({ ...mapWith({ wallSegments: [seg('b1', 100, 500, 200, 500)] }), id: 'map-b', name: 'Map B' }) as unknown as CampaignMap;
  const switchMap = () => act(() => { h.set({ currentMap: mapB() }); });

  it('puts a held token back on the map it came from', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));
    click(square(0, 19));
    move(square(3, 19), 0);

    switchMap();

    expect(lastOf('token.move')).toEqual({ tokenId: 'tok-goblin', mapId: 'map-a', x: 0, y: 19 });
    click(square(5, 10));
    expect(sentOf('token.move.end')).toEqual([]);
  });

  it('drops a half-drawn wall', () => {
    render(<MapCanvas />);
    wallTool('Wall draw mode');
    click(px(100, 300));

    switchMap();
    click(px(200, 300));

    expect(sentOf('wall:add')).toEqual([]);
  });

  it('drops the corners of a half-drawn polygon', () => {
    render(<MapCanvas />);
    wallTool('Polygon wall mode');
    click(px(500, 500));
    click(px(700, 500));

    switchMap();
    click(px(700, 700));
    click(px(700, 700), { detail: 2 });

    expect(sentOf('walls:replace')).toEqual([]);
  });

  it('drops the wall selection', () => {
    render(<MapCanvas />);
    wallTool('Wall select mode');
    press('a', { ctrlKey: true });

    switchMap();
    press('Delete');

    expect(sentOf('walls:replace')).toEqual([]);
  });
});

describe('Escape with a token held (F349)', () => {
  it('puts the token back where it was picked up', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));
    click(square(0, 19));
    move(square(3, 19), 0);

    press('Escape');

    expect(lastOf('token.move')).toEqual({ tokenId: 'tok-goblin', mapId: 'map-a', x: 0, y: 19 });
    click(square(5, 19));
    expect(sentOf('token.move.end')).toEqual([]);
  });
});

describe("a player's door under manual fog", () => {
  // The door's middle is (150, 100): the squares beside it are cells 23 and 43.
  const door = seg('d1', 100, 100, 200, 100, 'door-closed');
  function asPlayer(revealed: number[]) {
    h.set({ userRole: 'PLAYER', currentMap: mapWith({ fogEnabled: true, wallSegments: [door] }) });
    render(<MapCanvas />);
    fire('fog:cells', { mapId: 'map-a', revealedCells: revealed, fogCols: 20, fogRows: 20, cellPx: 50 });
  }

  it('opens one beside a revealed square', () => {
    asPlayer([23]);
    click(px(150, 104));
    expect(sentOf('wall:update')).toHaveLength(1);
  });

  it('leaves one wholly under fog alone, as the server would refuse it', () => {
    asPlayer([0]);
    click(px(150, 104));
    expect(sentOf('wall:update')).toEqual([]);
  });
});

describe('a click on a token beside a door', () => {
  // Square (2, 17) runs from x 100 to 150 and y 100 to 150; the door is its
  // left edge. The door's reach is 12 screen pixels, which at the zoom that
  // fits a map to the screen covers most of a square.
  const door = seg('d1', 100, 100, 100, 150, 'door-closed');

  it('picks the token up, leaving the door', () => {
    h.set({ currentMap: mapWith({ wallSegments: [door] }) });
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 2, 17));

    click(px(105, 125));

    expect(sentOf('token.move.start')).toHaveLength(1);
    expect(sentOf('wall:update')).toEqual([]);
  });

  it('puts a held token down there, leaving the door', () => {
    h.set({ currentMap: mapWith({ wallSegments: [door] }) });
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 5, 17));
    click(square(5, 17));

    click(px(105, 125));

    expect(sentOf('token.move.end')).toEqual([expect.objectContaining({ tokenId: 'tok-goblin', x: 2, y: 17 })]);
    expect(sentOf('wall:update')).toEqual([]);
  });

  it('still opens the door from an empty square', () => {
    h.set({ currentMap: mapWith({ wallSegments: [door] }) });
    render(<MapCanvas />);

    click(px(105, 125));

    expect(sentOf('wall:update')).toHaveLength(1);
  });
});

describe("a player's door toggle during the DM's wall drag", () => {
  const door = seg('d1', 500, 500, 600, 500, 'door-closed');
  const opened = { ...door, type: 'door-open' as const };

  it('survives the drop of a moved selection', () => {
    h.set({ currentMap: mapWith({ wallSegments: [WALL_A, door] }) });
    render(<MapCanvas />);
    wallTool('Wall select mode');

    down(px(150, 100));
    move(px(150, 120));
    fire('wall:updated', { mapId: 'map-a', segment: opened });
    move(px(150, 150));
    up(px(150, 150));

    expect(lastWalls()).toEqual([{ ...WALL_A, y1: 150, y2: 150 }, opened]);
  });

  it("survives the undo of an endpoint drag", () => {
    h.set({ currentMap: mapWith({ wallSegments: [WALL_A, door] }) });
    render(<MapCanvas />);
    wallTool('Wall select mode');

    down(px(200, 100));
    move(px(220, 100));
    fire('wall:updated', { mapId: 'map-a', segment: opened });
    move(px(250, 100));
    up(px(250, 100));
    press('z', { ctrlKey: true });

    expect(lastWalls()).toEqual([WALL_A, opened]);
  });
});

describe('the spirit crossing sound (F459)', () => {
  it('closes its audio context when the map goes away', () => {
    const close = vi.fn().mockResolvedValue(undefined);
    class FakeAudioContext {
      state = 'running';
      close = close;
      resume() {}
      createOscillator(): never { throw new Error('no audio here'); }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    try {
      const { unmount } = render(<MapCanvas />);
      fire('spirit_layer.toggled', { campaignId: 'campaign-1', visible: true });

      unmount();

      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('moving the pointer (F351)', () => {
  // Each move stored the square under the pointer as a new object, so the
  // whole canvas re-rendered for every pixel of movement, and each render
  // put the wheel listener on again.
  it('renders again only when the pointer reaches another square', () => {
    let commits = 0;
    render(<Profiler id="map" onRender={() => { commits += 1; }}><MapCanvas /></Profiler>);
    fireEvent.mouseMove(surface(), { ...px(110, 110), buttons: 0 });
    // React may render once more right after a state change before it can
    // skip an update that leaves the state as it is; a second move settles it.
    fireEvent.mouseMove(surface(), { ...px(111, 110), buttons: 0 });
    const before = commits;

    for (const x of [112, 115, 120, 130, 140]) fireEvent.mouseMove(surface(), { ...px(x, 110), buttons: 0 });

    expect(commits).toBe(before);
  });

  it('puts the wheel listener on once', () => {
    const attach = vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener');
    try {
      render(<MapCanvas />);
      for (const x of [60, 160, 260, 360]) fireEvent.mouseMove(surface(), { ...px(x, 110), buttons: 0 });
      expect(attach.mock.calls.filter(([type]) => type === 'wheel')).toHaveLength(1);
    } finally {
      attach.mockRestore();
    }
  });
});
