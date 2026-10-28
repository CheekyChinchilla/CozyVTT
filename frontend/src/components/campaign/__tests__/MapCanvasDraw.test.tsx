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

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import type { CampaignMap, Token } from '@/types';
import type { Drawing, DrawingAddAck, DrawingAddEvent, DrawingPreview, DrawingPreviewEvent } from '@/types/drawings';
import { recordDrawing, nextFrame, pictures, type Call } from '@/test/recordingCanvas';
import { contact, mouse } from '@/test/pointer';
import { DRAWING_LIMITS } from '@/constants/drawingLimits';

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


// ── The draw tool ────────────────────────────────────────────────────────────

/** Map pixel (x, y), which at 100% and no pan is the same screen pixel. */
const px = (x: number, y: number) => ({ clientX: x, clientY: y });
/** The centre of square (x, y); grid y counts up from the bottom row. */
const square = (x: number, y: number) => px(x * 50 + 25, (19 - y) * 50 + 25);

function surface(): HTMLCanvasElement {
  const input = document.querySelector<HTMLCanvasElement>('canvas[class*="cursor-"]');
  if (!input) throw new Error('no input canvas');
  return input;
}

const readout = () => screen.queryByText(/^\(-?\d+, -?\d+\)$/)?.textContent ?? null;
const added = () => sentOf('drawing:add') as DrawingAddEvent[];
const frames = () => (sentOf('drawing:preview') as DrawingPreviewEvent[]);
const ends = () => frames().filter((f) => f.preview.end);
/** Let the answers the stand-in gave resolve. */
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function token(id: string, name: string, x: number, y: number, extra: Partial<Token> = {}): Token {
  return {
    id, name, imageUrl: '', position: { x, y }, size: { width: 1, height: 1 },
    layer: 'token', visible: true, type: 'npc', conditions: [], ...extra,
  } as unknown as Token;
}

const drawButton = () => screen.queryByRole('button', { name: 'Draw' });
/** Open Draw from the toolbar and choose a tool from its panel. */
function draw(tool: string) {
  if (!screen.queryByRole('region', { name: 'Drawing tools' })) fireEvent.click(drawButton()!);
  fireEvent.click(within(screen.getByRole('region', { name: 'Drawing tools' })).getByRole('button', { name: tool }));
}

/** A mouse pressed at `from`, moved through `to` with the button held, and let go at the last. */
function stroke(from: { clientX: number; clientY: number }, ...to: Array<{ clientX: number; clientY: number }>) {
  mouse.down(surface(), from);
  for (const p of to) mouse.move(surface(), p, 1);
  mouse.up(surface(), to[to.length - 1] ?? from);
}

describe('the Draw button', () => {
  it('is in the toolbar for the DM, beside Ping, in the group that wraps together, sized for a finger', () => {
    render(<MapCanvas />);

    const button = drawButton()!;
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.parentElement).toBe(screen.getByRole('button', { name: 'Ping' }).parentElement);
    expect(button.className.split(/\s+/)).toContain('touch-target');
  });

  it('is there for a player while Players may draw is on and the session is live', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    expect(drawButton()).toBeInTheDocument();
  });

  it.each([
    ['a player while the session is paused', { userRole: 'PLAYER', status: 'PAUSED' }],
    ['a player once the session has ended', { userRole: 'PLAYER', status: 'INACTIVE' }],
    ['a player with Players may draw off', { userRole: 'PLAYER', playersMayDraw: false }],
    ['a spectator', { userRole: 'SPECTATOR' }],
  ])('is not there for %s', (_who, patch) => {
    h.set(patch);
    render(<MapCanvas />);
    expect(drawButton()).not.toBeInTheDocument();
  });

  // Nothing is drawn on a map without its picture, so a stroke there would
  // be one nobody sees.
  it('is not there on a map whose picture is missing', () => {
    h.set({ currentMap: mapWith({ imageUrl: '' }) });
    render(<MapCanvas />);
    expect(drawButton()).not.toBeInTheDocument();
  });

  it('goes, and puts the tools away, when the session pauses, the setting goes off or the player is demoted', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    draw('Pen');

    act(() => { h.set({ status: 'PAUSED' }); });
    expect(drawButton()).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Drawing tools' })).not.toBeInTheDocument();

    act(() => { h.set({ status: 'ACTIVE' }); });
    draw('Pen');
    act(() => { h.set({ playersMayDraw: false }); });
    expect(screen.queryByRole('region', { name: 'Drawing tools' })).not.toBeInTheDocument();

    act(() => { h.set({ playersMayDraw: true }); });
    draw('Pen');
    act(() => { h.set({ userRole: 'SPECTATOR' }); });
    expect(screen.queryByRole('region', { name: 'Drawing tools' })).not.toBeInTheDocument();
  });

  it('opens the tools with the pen chosen, and closes them again', () => {
    render(<MapCanvas />);

    fireEvent.click(drawButton()!);
    const panel = screen.getByRole('region', { name: 'Drawing tools' });
    expect(within(panel).getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'true');
    expect(drawButton()).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(drawButton()!);
    expect(screen.queryByRole('region', { name: 'Drawing tools' })).not.toBeInTheDocument();
  });

  // One tool takes a press at a time: the ruler and the template would take
  // the clicks before the pen, and the pen the DM tools'.
  it('puts the ruler, the area template and a DM tool away, and is put away by them', () => {
    render(<MapCanvas />);
    fireEvent.click(screen.getByTitle('Ruler — measure distance'));
    fireEvent.click(drawButton()!);
    expect(screen.getByTitle('Ruler — measure distance').className).not.toContain('bg-moss-green/20');

    fireEvent.click(screen.getByTitle('AoE Shape — area of effect overlay'));
    expect(screen.queryByRole('region', { name: 'Drawing tools' })).not.toBeInTheDocument();

    fireEvent.click(drawButton()!);
    expect(screen.queryByText('AoE Shape')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Walls'));
    fireEvent.click(screen.getByLabelText('Wall draw mode'));
    expect(screen.queryByRole('region', { name: 'Drawing tools' })).not.toBeInTheDocument();
  });
});

// Erasing one's own drawings asks nothing of the session or the setting,
// on the server as here: a player who may not draw now keeps the eraser
// and Clear mine for their own.
describe('the eraser while drawing is off', () => {
  const mine = () => drawing({ id: 'mine', authorId: 'me', points: [[100, 100], [300, 100]] });
  const panelTools = () => within(screen.getByRole('region', { name: 'Drawing tools' })).queryAllByRole('button', { pressed: true });

  it.each([
    ['Players may draw is off', { playersMayDraw: false }],
    ['the session is paused', { status: 'PAUSED' }],
  ])('offers a player the eraser and Clear mine alone for their own drawings while %s', (_when, patch) => {
    h.set({ userRole: 'PLAYER', ...patch });
    render(<MapCanvas />);
    fire('drawings:state', { mapId: 'map-a', drawings: [mine()] });

    fireEvent.click(drawButton()!);
    const panel = screen.getByRole('region', { name: 'Drawing tools' });
    expect(within(panel).queryByRole('button', { name: 'Pen' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(panel).getByRole('button', { name: 'Clear mine' })).toBeEnabled();
    expect(panelTools().map((b) => b.getAttribute('aria-label'))).toEqual(['Eraser']);

    mouse.down(surface(), px(200, 100));
    mouse.up(surface(), px(200, 100));
    expect(sentOf('drawing:remove')).toEqual([{ mapId: 'map-a', drawingId: 'mine' }]);
  });

  it('turns the pen into the eraser when drawing goes off, and goes with the last of their drawings', async () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    fire('drawings:state', { mapId: 'map-a', drawings: [mine()] });
    draw('Pen');

    act(() => { h.set({ playersMayDraw: false }); });
    expect(within(screen.getByRole('region', { name: 'Drawing tools' })).getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
    stroke(px(500, 500), px(600, 520));
    expect(added()).toEqual([]);

    mouse.down(surface(), px(200, 100));
    mouse.up(surface(), px(200, 100));
    await settle();
    expect(drawButton()).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Drawing tools' })).not.toBeInTheDocument();
  });

  it('offers nothing to a player with no drawing of their own, nor to a spectator with one from before', () => {
    h.set({ userRole: 'PLAYER', playersMayDraw: false });
    const view = render(<MapCanvas />);
    fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ authorId: 'them' })] });
    expect(drawButton()).not.toBeInTheDocument();
    view.unmount();

    h.set({ userRole: 'SPECTATOR', playersMayDraw: true });
    render(<MapCanvas />);
    fire('drawings:state', { mapId: 'map-a', drawings: [mine()] });
    expect(drawButton()).not.toBeInTheDocument();
  });
});

describe('each kind of drawing', () => {
  it('stores a pen stroke, its points kept to the corners of the line drawn, with its preview', () => {
    render(<MapCanvas />);
    draw('Pen');

    stroke(px(100, 100), px(150, 100), px(200, 100), px(200, 150), px(200, 200));

    expect(added()).toHaveLength(1);
    const [add] = added();
    expect(add).toMatchObject({ mapId: 'map-a', drawing: { kind: 'pen', color: '#d94f3d', width: 4, audience: 'ALL', points: [[100, 100], [200, 100], [200, 200]] } });
    expect(add.previewId).toBe(frames()[0].preview.previewId);
  });

  // A pen held down long enough would pass what one drawing may hold.
  it('stores a stroke as long as a drawing may be, and carries on with a new one from where it reached', () => {
    render(<MapCanvas />);
    draw('Pen');

    mouse.down(surface(), px(100, 100));
    // A zigzag, so no point of it is left out as lying on a straight line.
    for (let i = 1; i <= DRAWING_LIMITS.maxPoints + 10; i++) mouse.move(surface(), px(100 + (i % 2) * 3 + Math.floor(i / 2), 100 + (i % 2) * 3), 1);
    mouse.up(surface(), px(200, 200));

    expect(added()).toHaveLength(2);
    const [first, second] = added();
    expect(first.drawing.points.length).toBeLessThanOrEqual(DRAWING_LIMITS.maxPoints);
    expect(second.previewId).not.toBe(first.previewId);
    expect(second.drawing.points[0]).toEqual(first.drawing.points[first.drawing.points.length - 1]);
  });

  it('stores a tap of the pen as a dot', () => {
    render(<MapCanvas />);
    draw('Pen');

    stroke(px(120, 130));

    expect(added()[0].drawing.points).toEqual([[120, 130], [120, 130]]);
  });

  it.each([
    ['a line', 'Line', 'line'],
    ['an arrow', 'Arrow', 'arrow'],
    ['an ellipse', 'Ellipse', 'ellipse'],
  ])('stores %s from where the press began to where it lifted', (_name, tool, kind) => {
    render(<MapCanvas />);
    draw(tool);

    stroke(px(100, 100), px(160, 130), px(240, 180));

    expect(added().map((a) => a.drawing)).toEqual([{ kind, color: '#d94f3d', width: 4, audience: 'ALL', points: [[100, 100], [240, 180]] }]);
  });

  it('stores a rectangle filled with its colour when Fill is ticked, its corners on the grid with Snap to grid', () => {
    render(<MapCanvas />);
    draw('Rectangle');
    const panel = screen.getByRole('region', { name: 'Drawing tools' });
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Fill shapes' }));
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Snap to grid' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Blue' }));

    // To the nearest corner or middle of a square, 25 pixels apart.
    stroke(px(104, 96), px(212, 162));

    expect(added()[0].drawing).toEqual({ kind: 'rect', color: '#3d8bd9', width: 4, audience: 'ALL', points: [[100, 100], [200, 150]], fillColor: '#3d8bd9' });
  });

  // Rounding each axis to half a square also gave the middles of the sides.
  it('snaps to the nearest corner or middle of a square, never the middle of a side', () => {
    render(<MapCanvas />);
    draw('Line');
    fireEvent.click(within(screen.getByRole('region', { name: 'Drawing tools' })).getByRole('checkbox', { name: 'Snap to grid' }));

    // (125, 102) lies by the middle of a side, (125, 100); the square's middle is nearer than a corner.
    stroke(px(125, 102), px(240, 190));

    expect(added()[0].drawing.points).toEqual([[125, 125], [250, 200]]);
  });

  it('draws nothing for a shape of no size, and ends its preview', () => {
    render(<MapCanvas />);
    draw('Line');

    stroke(px(100, 100));

    expect(added()).toEqual([]);
    expect(ends()).toHaveLength(1);
  });

  it('takes the width the panel sets', () => {
    render(<MapCanvas />);
    draw('Line');
    fireEvent.change(screen.getByRole('slider', { name: 'Width' }), { target: { value: '12' } });

    stroke(px(100, 100), px(200, 100));

    expect(added()[0].drawing.width).toBe(12);
  });

  describe('a polygon', () => {
    it('is closed by a tap on its first corner once it has three', () => {
      render(<MapCanvas />);
      draw('Polygon');

      for (const p of [px(100, 100), px(300, 100), px(200, 250)]) { mouse.down(surface(), p); mouse.up(surface(), p); }
      expect(added()).toEqual([]);
      mouse.down(surface(), px(104, 103));
      mouse.up(surface(), px(104, 103));

      expect(added().map((a) => a.drawing)).toEqual([{ kind: 'polygon', color: '#d94f3d', width: 4, audience: 'ALL', points: [[100, 100], [300, 100], [200, 250]], fillColor: null }]);
    });

    it('is closed by Done, which waits for its third corner, and dropped by Cancel', () => {
      render(<MapCanvas />);
      draw('Polygon');
      for (const p of [px(100, 100), px(300, 100)]) { mouse.down(surface(), p); mouse.up(surface(), p); }
      expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
      mouse.down(surface(), px(200, 250));
      mouse.up(surface(), px(200, 250));

      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(added()).toHaveLength(1);

      for (const p of [px(10, 10), px(60, 10)]) { mouse.down(surface(), p); mouse.up(surface(), p); }
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(added()).toHaveLength(1);
      expect(ends().map((e) => e.preview.kind)).toEqual(['polygon']);
    });

    // A finger has no hover and lands where it will; between corners it
    // moves the map.
    it('lets a finger’s drag move the map between corners', () => {
      render(<MapCanvas />);
      draw('Polygon');
      const finger = contact('touch', 1);
      finger.down(surface(), px(100, 100));
      finger.up(surface(), px(100, 100));
      finger.leave(surface());

      const drag = contact('touch', 2);
      drag.down(surface(), px(500, 500));
      drag.move(surface(), px(530, 500));
      drag.move(surface(), px(550, 500));
      drag.up(surface(), px(550, 500));
      mouse.move(surface(), px(60, 10), 0);

      expect(readout()).toBe('(0, 19)');
      expect(frames().filter((f) => f.preview.kind === 'polygon')).toHaveLength(1);
    });
  });

  describe('a text label', () => {
    it('opens a box where the map is clicked, and Enter stores what was typed there', () => {
      render(<MapCanvas />);
      draw('Text label');

      mouse.down(surface(), px(140, 160));
      mouse.up(surface(), px(140, 160));
      const box = screen.getByRole('textbox', { name: 'Label' });
      expect(box).toHaveFocus();
      expect(box).toHaveAttribute('maxLength', String(DRAWING_LIMITS.maxTextLength));
      fireEvent.change(box, { target: { value: 'Ambush  ' } });
      fireEvent.keyDown(box, { key: 'Enter' });

      expect(added().map((a) => a.drawing)).toEqual([{ kind: 'text', color: '#d94f3d', width: 4, audience: 'ALL', points: [[140, 160]], text: 'Ambush' }]);
      expect(screen.queryByRole('textbox', { name: 'Label' })).not.toBeInTheDocument();
    });

    it('is dropped by Esc in its box, and the map keeps the next Esc', () => {
      render(<MapCanvas />);
      draw('Text label');
      mouse.down(surface(), px(140, 160));
      mouse.up(surface(), px(140, 160));

      fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), { target: { value: 'Gone' } });
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Label' }), { key: 'Escape' });

      expect(added()).toEqual([]);
      expect(screen.queryByRole('textbox', { name: 'Label' })).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Drawing tools' })).toBeInTheDocument();
    });

    // With a Japanese, Chinese or Korean input method, Enter confirms the
    // conversion and Esc cancels it, before the label is done.
    it('takes no Enter or Esc an input method is composing with', () => {
      render(<MapCanvas />);
      draw('Text label');
      mouse.down(surface(), px(140, 160));
      mouse.up(surface(), px(140, 160));
      const box = screen.getByRole('textbox', { name: 'Label' });
      fireEvent.change(box, { target: { value: 'きた' } });

      fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
      fireEvent.keyDown(box, { key: 'Escape', isComposing: true });

      expect(added()).toEqual([]);
      expect(screen.getByRole('textbox', { name: 'Label' })).toHaveValue('きた');
      fireEvent.keyDown(box, { key: 'Enter' });
      expect(added().map((a) => a.drawing.text)).toEqual(['きた']);
    });

    // The mouse's press on the map would take the keys back from the box.
    it('keeps the focus in its box through the press that opened it', () => {
      render(<MapCanvas />);
      draw('Text label');
      mouse.down(surface(), px(140, 160));
      mouse.up(surface(), px(140, 160));

      const mousedown = fireEvent.mouseDown(surface());

      expect(mousedown).toBe(false);
      expect(screen.getByRole('textbox', { name: 'Label' })).toHaveFocus();
    });

    // A finger's tap gives the map the keys, and the mousedown a browser
    // may send after it would too: the box keeps them.
    it('takes the keys after a finger’s tap opens it', () => {
      render(<MapCanvas />);
      draw('Text label');

      const finger = contact('touch', 1);
      finger.down(surface(), px(140, 160));
      finger.up(surface(), px(140, 160));
      const mousedown = fireEvent.mouseDown(surface());

      expect(mousedown).toBe(false);
      expect(screen.getByRole('textbox', { name: 'Label' })).toHaveFocus();
    });

    it('is stored by the next press on the map, which opens another', () => {
      render(<MapCanvas />);
      draw('Text label');
      mouse.down(surface(), px(140, 160));
      mouse.up(surface(), px(140, 160));
      fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), { target: { value: 'One' } });

      mouse.down(surface(), px(300, 300));
      mouse.up(surface(), px(300, 300));

      expect(added().map((a) => a.drawing.text)).toEqual(['One']);
      expect(screen.getByRole('textbox', { name: 'Label' })).toHaveValue('');
    });
  });
});

describe('a drawing for the DM alone', () => {
  it('is what the DM draws with Only I can see this ticked', () => {
    render(<MapCanvas />);
    draw('Line');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Only I can see this' }));

    stroke(px(100, 100), px(200, 100));

    expect(added()[0].drawing.audience).toBe('DM');
    expect(frames()[0].preview.audience).toBe('DM');
  });

  it('is not offered to a player', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    draw('Line');

    expect(screen.queryByRole('checkbox', { name: 'Only I can see this' })).not.toBeInTheDocument();
  });
});

describe('a refused drawing', () => {
  it('is taken off the map, says why, and ends its preview on every other screen', async () => {
    h.answers.add = async () => ({ ok: false, error: 'This map holds as many drawings as it can. Erase some first.' });
    render(<MapCanvas />);
    draw('Line');

    stroke(px(100, 100), px(200, 100));
    expect(useGameStore.getState().drawings).toHaveLength(1);
    await settle();

    expect(useGameStore.getState().drawings).toEqual([]);
    expect(screen.getByText('This map holds as many drawings as it can. Erase some first.')).toBeInTheDocument();
    expect(ends().map((e) => e.preview.previewId)).toEqual([added()[0].previewId]);
  });
});

describe('a stroke that does not finish', () => {
  // Each way ends it on every screen at once, unstored.
  it('is ended by Esc, and the next Esc puts the tools away', () => {
    render(<MapCanvas />);
    draw('Pen');
    mouse.down(surface(), px(100, 100));
    mouse.move(surface(), px(150, 120), 1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(ends()).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Drawing tools' })).toBeInTheDocument();
    mouse.up(surface(), px(150, 120));
    expect(added()).toEqual([]);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Drawing tools' })).not.toBeInTheDocument();
  });

  it('is ended by a second finger, which pinches instead', () => {
    render(<MapCanvas />);
    draw('Pen');
    const first = contact('touch', 1);
    first.down(surface(), px(100, 100));
    first.move(surface(), px(130, 100));
    first.move(surface(), px(160, 100));
    expect(frames().length).toBeGreaterThan(0);

    contact('touch', 2, false).down(surface(), px(400, 400));
    first.up(surface(), px(160, 100));

    expect(ends()).toHaveLength(1);
    expect(added()).toEqual([]);
  });

  it('is ended when the browser takes the pointer', () => {
    render(<MapCanvas />);
    draw('Pen');
    mouse.down(surface(), px(100, 100));
    mouse.move(surface(), px(150, 120), 1);

    mouse.cancel(surface());

    expect(ends()).toHaveLength(1);
  });

  it('is ended when the window loses focus', () => {
    render(<MapCanvas />);
    draw('Pen');
    mouse.down(surface(), px(100, 100));
    mouse.move(surface(), px(150, 120), 1);

    act(() => { window.dispatchEvent(new Event('blur')); });

    expect(ends()).toHaveLength(1);
  });

  it('is ended on its own map when the map switches', () => {
    render(<MapCanvas />);
    draw('Pen');
    mouse.down(surface(), px(100, 100));
    mouse.move(surface(), px(150, 120), 1);

    act(() => { h.set({ currentMap: mapWith({ id: 'map-b', name: 'Map B' }) }); });

    expect(ends().map((e) => e.mapId)).toEqual(['map-a']);
  });

  it('is ended when the map goes, as a change of layout makes it', () => {
    const view = render(<MapCanvas />);
    draw('Pen');
    mouse.down(surface(), px(100, 100));
    mouse.move(surface(), px(150, 120), 1);

    view.unmount();

    expect(ends()).toHaveLength(1);
  });
});

describe('the frames of a stroke on its way', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('go at most 20 a second, each carrying the points since the last, and one a second while held still', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    render(<MapCanvas />);
    draw('Pen');

    mouse.down(surface(), px(100, 100));
    for (let i = 1; i <= 10; i++) mouse.move(surface(), px(100 + i * 5, 100), 1);
    expect(frames()).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(50); });
    expect(frames().map((f) => f.preview.points.length)).toEqual([1, 10]);

    act(() => { vi.advanceTimersByTime(2100); });
    expect(frames().slice(2).map((f) => f.preview.points)).toEqual([[], []]);
    mouse.up(surface(), px(150, 100));
  });

  // The other screens fade a stroke 2 seconds after its last frame; a
  // polygon sends a frame per corner, which a DM placing them slowly can
  // leave further apart than that.
  it('keep a polygon alive between its corners, one a second, under one preview', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    render(<MapCanvas />);
    draw('Polygon');

    mouse.down(surface(), px(100, 100));
    mouse.up(surface(), px(100, 100));
    act(() => { vi.advanceTimersByTime(3500); });
    mouse.down(surface(), px(300, 100));
    mouse.up(surface(), px(300, 100));

    expect(frames().map((f) => f.preview.points)).toEqual([[[100, 100]], [], [], [], [[300, 100]]]);
    expect(new Set(frames().map((f) => f.preview.previewId)).size).toBe(1);
  });

  // A background tab holds timers back, so a page can go quiet longer than
  // the other screens keep a stroke: they have dropped its first corners.
  it('send every corner of a polygon again, as a new preview, after a silence the other screens fade', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    render(<MapCanvas />);
    draw('Polygon');
    for (const p of [px(100, 100), px(300, 100)]) { mouse.down(surface(), p); mouse.up(surface(), p); }
    const first = frames()[0].preview.previewId;

    vi.setSystemTime(Date.now() + 5000);
    mouse.down(surface(), px(200, 250));
    mouse.up(surface(), px(200, 250));

    expect(ends().map((e) => e.preview.previewId)).toEqual([first]);
    const last = frames()[frames().length - 1].preview;
    expect(last.previewId).not.toBe(first);
    expect(last.points).toEqual([[100, 100], [300, 100], [200, 250]]);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(added()[0].previewId).toBe(last.previewId);
  });

  it('carry a shape’s two points whole', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    render(<MapCanvas />);
    draw('Line');

    mouse.down(surface(), px(100, 100));
    mouse.move(surface(), px(180, 120), 1);
    act(() => { vi.advanceTimersByTime(50); });
    mouse.up(surface(), px(180, 120));

    expect(frames().map((f) => f.preview.points)).toEqual([[[100, 100], [100, 100]], [[100, 100], [180, 120]]]);
  });
});

describe('the laser pointer', () => {
  it('sends its trail to the table and stores nothing', () => {
    render(<MapCanvas />);
    draw('Laser pointer');

    stroke(px(100, 100), px(200, 150), px(300, 150));

    expect(added()).toEqual([]);
    expect(frames().every((f) => f.preview.laser && f.preview.audience === 'ALL')).toBe(true);
    expect(frames().flatMap((f) => f.preview.points)).toEqual([[100, 100], [200, 150], [300, 150]]);
    expect(ends()).toEqual([]);
  });

  it('goes to everyone though Only I can see this was ticked for the pen', () => {
    render(<MapCanvas />);
    draw('Pen');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Only I can see this' }));
    draw('Laser pointer');
    expect(screen.queryByRole('checkbox', { name: 'Only I can see this' })).not.toBeInTheDocument();

    stroke(px(100, 100), px(200, 150));

    expect(frames().every((f) => f.preview.audience === 'ALL')).toBe(true);
  });
});

describe('the eraser', () => {
  it('erases a player’s own drawing for everyone that is tapped', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ id: 'mine', authorId: 'me', points: [[100, 100], [300, 100]] })] });
    draw('Eraser');

    const finger = contact('touch', 1);
    finger.down(surface(), px(200, 108));
    finger.up(surface(), px(200, 108));

    expect(sentOf('drawing:remove')).toEqual([{ mapId: 'map-a', drawingId: 'mine' }]);
    expect(useGameStore.getState().drawings).toEqual([]);
  });

  it('offers a player nothing of anyone else’s, and says so', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ id: 'theirs', authorId: 'them', points: [[100, 100], [300, 100]] })] });
    draw('Eraser');

    mouse.down(surface(), px(200, 100));
    mouse.up(surface(), px(200, 100));

    expect(sentOf('drawing:remove')).toEqual([]);
    expect(screen.getByText('You can erase only your own drawings')).toBeInTheDocument();
  });

  it('erases anyone’s for the DM, the topmost where two cross', () => {
    render(<MapCanvas />);
    fire('drawings:state', {
      mapId: 'map-a',
      drawings: [drawing({ id: 'under', authorId: 'mara', points: [[100, 100], [300, 100]] }), drawing({ id: 'over', authorId: 'tom', points: [[200, 0], [200, 300]] })],
    });
    draw('Eraser');

    mouse.down(surface(), px(200, 100));
    mouse.up(surface(), px(200, 100));

    expect(sentOf('drawing:remove')).toEqual([{ mapId: 'map-a', drawingId: 'over' }]);
  });

  // Player Preview shows what a player is sent: the eraser finds only that.
  it('passes over a drawing for the DM alone in Preview Player View', () => {
    h.set({ currentMap: mapWith({ fogEnabled: true }), memberships: [{ userId: 'p1', role: 'PLAYER', user: { displayName: 'Mara' } }] });
    render(<MapCanvas />);
    fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ id: 'secret', audience: 'DM', points: [[100, 100], [300, 100]] })] });
    fireEvent.click(screen.getByRole('button', { name: 'Toggle DM player view preview' }));
    draw('Eraser');

    mouse.down(surface(), px(200, 100));
    mouse.up(surface(), px(200, 100));

    expect(sentOf('drawing:remove')).toEqual([]);
  });

  it('puts back a drawing the server would not erase, and says why', async () => {
    h.answers.done = async () => ({ ok: false, error: 'Failed to erase the drawing' });
    render(<MapCanvas />);
    fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ id: 'a', points: [[100, 100], [300, 100]] })] });
    draw('Eraser');

    mouse.down(surface(), px(200, 100));
    mouse.up(surface(), px(200, 100));
    await settle();

    expect(useGameStore.getState().drawings.map((d) => d.id)).toEqual(['a']);
    expect(screen.getByText('Failed to erase the drawing')).toBeInTheDocument();
  });
});

describe('a finger, a pen and the mouse under the Draw tool', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('draws with one finger, from where it landed', () => {
    render(<MapCanvas />);
    draw('Line');

    const finger = contact('touch', 1);
    finger.down(surface(), px(100, 100));
    finger.move(surface(), px(130, 100));
    finger.move(surface(), px(200, 140));
    finger.up(surface(), px(200, 140));

    expect(added().map((a) => a.drawing.points)).toEqual([[[100, 100], [200, 140]]]);
  });

  it('opens no menu and pings nothing for a finger held still', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    render(<MapCanvas />);
    act(() => { useGameStore.getState().setTokens([token('tok-goblin', 'Goblin', 2, 17)]); });
    draw('Pen');

    const finger = contact('touch', 1);
    finger.down(surface(), square(2, 17));
    act(() => { vi.advanceTimersByTime(800); });
    finger.up(surface(), square(2, 17));

    expect(screen.queryByText('Edit Token')).not.toBeInTheDocument();
    expect(sentOf('map.ping')).toEqual([]);
    expect(sentOf('token.move.start')).toEqual([]);
  });

  it('draws nothing for a pen hovering over the glass, and draws with its tip', () => {
    render(<MapCanvas />);
    draw('Pen');
    const pen = contact('pen', 5);

    pen.move(surface(), px(100, 100), { buttons: 0 });
    pen.move(surface(), px(150, 100), { buttons: 0 });
    expect(frames()).toEqual([]);

    pen.down(surface(), px(150, 100));
    pen.move(surface(), px(200, 120));
    pen.up(surface(), px(200, 120));
    pen.move(surface(), px(260, 160), { buttons: 0 });

    expect(added().map((a) => a.drawing.points)).toEqual([[[150, 100], [200, 120]]]);
  });

  it('pans with the right button and opens no menu', () => {
    render(<MapCanvas />);
    act(() => { useGameStore.getState().setTokens([token('tok-goblin', 'Goblin', 0, 19)]); });
    draw('Pen');

    mouse.down(surface(), px(500, 500), 2);
    mouse.move(surface(), px(550, 500), 2);
    mouse.up(surface(), px(550, 500), 2);
    fireEvent.contextMenu(surface(), square(0, 19));
    mouse.move(surface(), px(60, 10), 0);

    expect(readout()).toBe('(0, 19)');
    expect(screen.queryByText('Edit Token')).not.toBeInTheDocument();
    expect(added()).toEqual([]);
  });

  it('picks up no token and opens no door', () => {
    h.set({ currentMap: mapWith({ wallSegments: [{ id: 'd1', x1: 100, y1: 100, x2: 200, y2: 100, type: 'door-closed' }] }) });
    render(<MapCanvas />);
    act(() => { useGameStore.getState().setTokens([token('tok-goblin', 'Goblin', 0, 19)]); });
    draw('Pen');

    stroke(square(0, 19), square(1, 19));
    stroke(px(150, 100));

    expect(sentOf('token.move.start')).toEqual([]);
    expect(h.sent.filter(([e]) => e.startsWith('wall:'))).toEqual([]);
  });
});

describe('Clear mine and Clear drawings', () => {
  it('lets a player clear their own drawings', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ id: 'mine', authorId: 'me' }), drawing({ id: 'theirs' })] });
    draw('Pen');

    fireEvent.click(screen.getByRole('button', { name: 'Clear mine' }));

    expect(sentOf('drawing:clear_mine')).toEqual([{ mapId: 'map-a' }]);
    expect(useGameStore.getState().drawings.map((d) => d.id)).toEqual(['theirs']);
    expect(screen.queryByRole('button', { name: 'Clear drawings' })).not.toBeInTheDocument();
  });

  it('lets the DM clear one player’s drawings, by name, and nobody else’s', () => {
    h.set({ memberships: [{ userId: 'p1', role: 'PLAYER', user: { displayName: 'Mara' } }, { userId: 'p2', role: 'PLAYER', user: { displayName: 'Tom' } }] });
    render(<MapCanvas />);
    fire('drawings:state', {
      mapId: 'map-a',
      drawings: [drawing({ id: 'm1', authorId: 'p1' }), drawing({ id: 'm2', authorId: 'p1' }), drawing({ id: 't1', authorId: 'p2' }), drawing({ id: 'mine', authorId: 'me' })],
    });
    draw('Pen');

    expect(screen.queryByRole('button', { name: /Clear Me's/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "Clear Mara's drawings (2)" }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: "Clear Mara's drawings" }));

    expect(sentOf('drawing:clear')).toEqual([{ mapId: 'map-a', layer: 'MARKUP', authorId: 'p1' }]);
    expect(useGameStore.getState().drawings.map((d) => d.id)).toEqual(['t1', 'mine']);
  });

  it('names a member who has left by what they were', () => {
    render(<MapCanvas />);
    fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ authorId: 'gone' })] });
    draw('Pen');

    expect(screen.getByRole('button', { name: 'Clear the drawings of someone who has left (1)' })).toBeInTheDocument();
  });

  it('asks the DM before clearing every drawing on the map', () => {
    render(<MapCanvas />);
    fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ id: 'a' })] });
    draw('Pen');

    fireEvent.click(screen.getByRole('button', { name: 'Clear drawings' }));
    expect(sentOf('drawing:clear')).toEqual([]);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear drawings' }));

    expect(sentOf('drawing:clear')).toEqual([{ mapId: 'map-a', layer: 'MARKUP' }]);
    expect(useGameStore.getState().drawings).toEqual([]);
  });
});
