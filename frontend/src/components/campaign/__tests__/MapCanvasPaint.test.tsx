/**
 * Paint, through MapCanvas: the DM painting the picture of a map drawn in
 * CozyVTT, or of a map with no picture.
 *
 * Paint is offered only to the DM, on a map whose picture is a campaign map
 * picture tagged drawn-map, or which has no picture; never on an uploaded
 * one. While it is on it owns the map: every press is a stroke, and the
 * keys the other tools take are its own, so no token is picked up, turned
 * or moved, no wall drawn, deleted or undone, nothing pinged, drawn or
 * measured. One finger or the mouse paints; a second finger drops the
 * stroke and pinches, and paints nothing. A stroke is drawn on the overlay
 * as it goes and painted into the picture on the lift, and the terrain
 * draws the picture being painted. Undo puts back the tiles a stroke
 * touched.
 *
 * The stand-ins are MapCanvasDraw.test.tsx's: the canvases record what is
 * drawn on them, pictures load when the test says, and the socket records
 * what the page sends. The view starts at 100% with no pan, so screen pixel
 * (x, y) is map pixel (x, y); the map is 20 by 20 squares of 50 pixels, and
 * its picture 1,000 pixels square, so a map pixel is a picture pixel.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { TokenLayer, TokenType, type CampaignMap, type Token } from '@/types';
import type { WallSegment } from '@/types/walls';
import { recordDrawing, nextFrame, pictures, type Call } from '@/test/recordingCanvas';
import { contact, mouse } from '@/test/pointer';
import { usePaintStore } from '@/stores/paintStore';

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
    getAsset: vi.fn(),
    updateToken: vi.fn(),
    addToken: vi.fn(),
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
  const mapActions = (await import('@/test/viewedMapContext')).mapActionsFor(() => h.state.currentMap, (map) => h.set({ currentMap: map }));
  const noop = () => undefined;
  const campaign = { id: 'campaign-1', name: 'Test', spiritLayerEnabled: false, characters: [], status: 'ACTIVE', playersMayDraw: true, memberships: [] };
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
  const listen = (event: string) => (cb: (data: never) => void) => { h.raw.on(event, cb); };
  const client = new Proxy({
    getSocket: () => h.raw,
    onMapChanged: listen('map.changed'),
    off: (event: string, cb: (data: never) => void) => { h.raw.off(event, cb); },
    emitTokenMoveStart: record('token.move.start'),
    emitTokenMove: record('token.move'),
    emitTokenMoveEnd: record('token.move.end'),
    emitMapPing: record('map.ping'),
    requestDrawings: record('drawings:request'),
    sendDrawingPreview: record('drawing:preview'),
    addDrawing: (payload: unknown) => { h.sent.push(['drawing:add', payload]); return Promise.resolve({ ok: true, id: 'd1' }); },
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
  const named: Record<string, unknown> = { getAsset: h.getAsset, updateToken: h.updateToken, addToken: h.addToken };
  const client = new Proxy({}, {
    get: (_target, prop: string) => named[prop] ?? vi.fn().mockResolvedValue({}),
  });
  return { api: client, default: client };
});

import MapCanvas from '../MapCanvas';
import { useGameStore } from '@/stores/gameStore';

const { recorded, take } = recordDrawing();

const wall = (id: string, x: number): WallSegment => ({ id, x1: x, y1: 100, x2: x + 100, y2: 100, type: 'wall' });

let mapCount = 0;
function mapWith(extra: Partial<CampaignMap> = {}): CampaignMap {
  mapCount += 1;
  return {
    id: 'map-a',
    campaignId: 'campaign-1',
    name: 'Map A',
    // A new address each test: the page asks for a picture's asset once a session.
    imageUrl: `/api/assets/maps/drawn-${mapCount}`,
    width: 20,
    height: 20,
    gridSize: 50,
    tokens: [],
    wallSegments: [wall('w1', 100), wall('w2', 300)],
    lights: [],
    fogEnabled: false,
    lightingEnabled: false,
    globalIllumination: true,
    explorationEnabled: false,
    ...extra,
  } as unknown as CampaignMap;
}

const drawnAsset = (tags = ['drawn-map']) => ({ asset: { id: 'drawn', type: 'MAP', scope: 'CAMPAIGN', campaignId: 'campaign-1', tags } });

/** A one-square token; grid y counts up from the bottom row, 0, to the top, 19. */
function token(id: string, x: number, y: number): Token {
  return {
    id, name: id, imageUrl: '', characterId: null, position: { x, y }, size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN, visible: true, type: TokenType.NPC, conditions: [], rotation: 0, controlledBy: null,
  } as unknown as Token;
}
/** The centre of square (x, y) on screen. */
const square = (x: number, y: number) => ({ clientX: x * 50 + 25, clientY: (19 - y) * 50 + 25 });

const input = (): HTMLCanvasElement => {
  const el = document.querySelector<HTMLCanvasElement>('canvas[class*="cursor-"]');
  if (!el) throw new Error('no input canvas');
  return el;
};
const terrain = (): HTMLCanvasElement => document.querySelectorAll<HTMLCanvasElement>('canvas')[0];
const theMap = () => screen.getByRole('application', { name: 'Map' });
const sentOf = (prefix: string) => h.sent.filter(([e]) => e.startsWith(prefix));

/** The canvas holding the picture being painted: the one the picture's size. */
function pictureCanvas(): HTMLCanvasElement | undefined {
  return [...recorded.keys()].find((c) => c.width === 1000 && c.height === 1000);
}
const callsOn = (canvas: HTMLCanvasElement | undefined): Call[] => (canvas ? recorded.get(canvas) ?? [] : []);
const strokesOn = (canvas: HTMLCanvasElement | undefined) => callsOn(canvas).filter((c) => c.method === 'stroke' || c.method === 'arc');

function press(key: string, opts: { shiftKey?: boolean; ctrlKey?: boolean } = {}) {
  const map = theMap();
  if (document.activeElement !== map) map.focus();
  return fireEvent.keyDown(map, { key, ...opts });
}

async function showMap(map = mapWith(), { load = true } = {}) {
  h.set({ currentMap: map });
  render(<MapCanvas />);
  if (load && map.imageUrl) pictures[0]?.load();
  await act(async () => { await Promise.resolve(); });
}

async function paintOn() {
  await screen.findByRole('button', { name: 'Paint' });
  fireEvent.click(screen.getByRole('button', { name: 'Paint' }));
  expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'true');
}

/** A mouse drag from `from` to `to`, through the middle. */
function drag(from: { clientX: number; clientY: number }, to: { clientX: number; clientY: number }) {
  mouse.down(input(), from);
  mouse.move(input(), { clientX: (from.clientX + to.clientX) / 2, clientY: (from.clientY + to.clientY) / 2 }, 1);
  mouse.move(input(), to, 1);
  mouse.up(input(), to);
}

beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.sent.length = 0;
  h.handlers.clear();
  h.getAsset.mockReset().mockResolvedValue(drawnAsset());
  h.updateToken.mockReset().mockResolvedValue({});
  h.addToken.mockReset().mockResolvedValue({ token: token('placed', 1, 1) });
  act(() => {
    useGameStore.getState().clearGameState();
    usePaintStore.setState({ mapId: null, unsaved: false, openOnMapId: null });
  });
  h.set({ userRole: 'DM' });
  // A tile's PNG, made at once, and its decoding.
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true, writable: true, value(done: BlobCallback) { done(new Blob(['tile'], { type: 'image/png' })); },
  });
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: () => undefined }));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('where Paint is offered', () => {
  it('on a drawn map, to the DM', async () => {
    await showMap();
    expect(await screen.findByRole('button', { name: 'Paint' })).toBeInTheDocument();
  });

  it.each([
    ['an uploaded picture', drawnAsset(['dungeon'])],
    ['a picture tagged in another case', drawnAsset(['Drawn-Map'])],
    ['another campaign\'s picture', { asset: { ...drawnAsset().asset, campaignId: 'campaign-2' } }],
  ])('never on %s', async (_what, answer) => {
    h.getAsset.mockResolvedValue(answer);
    await showMap();
    await act(async () => { await Promise.resolve(); });
    expect(h.getAsset).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Paint' })).toBeNull();
  });

  it('never to a player, who is not even asked about the picture', async () => {
    h.set({ userRole: 'PLAYER' });
    await showMap();
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('button', { name: 'Paint' })).toBeNull();
    expect(h.getAsset).not.toHaveBeenCalled();
  });

  it('on a map with no picture, which it opens blank at the map\'s size, its notice out of the way', async () => {
    await showMap(mapWith({ imageUrl: '' }), { load: false });
    expect(screen.getByText('This map has no picture.')).toBeInTheDocument();
    expect(screen.getByText(/or paint one with Paint/)).toBeInTheDocument();
    await paintOn();
    const canvas = pictureCanvas();
    expect(canvas).toBeDefined();
    expect(callsOn(canvas)).toContainEqual({ method: 'fillRect', args: [0, 0, 1000, 1000] });
    expect(screen.queryByText('This map has no picture.')).toBeNull();
  });

  it('paints at the map\'s squares and grid size, whatever the picture\'s own size: a new drawn map\'s is a pixel a square', async () => {
    h.set({ currentMap: mapWith() });
    render(<MapCanvas />);
    pictures[0].width = 20;
    pictures[0].height = 20;
    pictures[0].load();
    await act(async () => { await Promise.resolve(); });
    await paintOn();
    const canvas = pictureCanvas();
    expect(canvas).toBeDefined();
    const copied = callsOn(canvas).find((c) => c.method === 'drawImage');
    expect(copied?.args.slice(1)).toEqual([0, 0, 1000, 1000]);
  });

  it('opens by itself on a map just made with Draw a map, once it is on screen', async () => {
    const map = mapWith();
    act(() => { usePaintStore.getState().openWhenShown(map.id); });
    await showMap(map);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'true'));
    expect(usePaintStore.getState().openOnMapId).toBeNull();
  });
});

describe('the brush', () => {
  it('draws the stroke on the overlay as it goes, and paints it into the picture on the lift', async () => {
    await showMap();
    await paintOn();
    const canvas = pictureCanvas();
    // The picture as it was is copied in first.
    expect(callsOn(canvas).some((c) => c.method === 'drawImage')).toBe(true);
    take(input());
    mouse.down(input(), { clientX: 100, clientY: 100 });
    mouse.move(input(), { clientX: 200, clientY: 150 }, 1);
    await nextFrame();
    expect(take(input()).some((c) => c.method === 'lineTo')).toBe(true);
    expect(strokesOn(canvas)).toEqual([]);

    mouse.up(input(), { clientX: 200, clientY: 150 });
    const painted = callsOn(canvas);
    expect(painted.find((c) => c.method === 'moveTo')?.args).toEqual([100, 100]);
    expect(painted.find((c) => c.method === 'lineTo')?.args).toEqual([200, 150]);
    expect(strokesOn(canvas)).toHaveLength(1);
  });

  it('is drawn on the map in the picture\'s place', async () => {
    await showMap();
    await paintOn();
    await nextFrame();
    const canvas = pictureCanvas();
    expect(take(terrain()).some((c) => c.method === 'drawImage' && c.args[0] === canvas)).toBe(true);
  });

  it('paints a dot for a tap of a finger', async () => {
    await showMap();
    await paintOn();
    const finger = contact('touch', 7);
    finger.down(input(), { clientX: 300, clientY: 320 });
    finger.up(input(), { clientX: 300, clientY: 320 });
    expect(callsOn(pictureCanvas()).find((c) => c.method === 'arc')?.args.slice(0, 3)).toEqual([300, 320, 3]);
  });

  it('paints nothing when a second finger lands, and nothing as two fingers pinch', async () => {
    await showMap();
    await paintOn();
    const one = contact('touch', 1);
    const two = contact('touch', 2, false);
    one.down(input(), { clientX: 100, clientY: 100 });
    one.move(input(), { clientX: 160, clientY: 130 });
    two.down(input(), { clientX: 400, clientY: 400 });
    one.move(input(), { clientX: 60, clientY: 60 });
    two.move(input(), { clientX: 480, clientY: 480 });
    one.up(input(), { clientX: 60, clientY: 60 });
    two.up(input(), { clientX: 480, clientY: 480 });
    expect(strokesOn(pictureCanvas())).toEqual([]);
  });

  it('drops a stroke under way on Esc, then puts Paint away on the next', async () => {
    await showMap();
    await paintOn();
    mouse.down(input(), { clientX: 100, clientY: 100 });
    mouse.move(input(), { clientX: 200, clientY: 150 }, 1);
    press('Escape');
    mouse.up(input(), { clientX: 200, clientY: 150 });
    expect(strokesOn(pictureCanvas())).toEqual([]);
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'true');
    press('Escape');
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('changes width with [ and ], in the panel too', async () => {
    await showMap();
    await paintOn();
    const panel = screen.getByRole('region', { name: 'Paint' });
    expect(within(panel).getByText('6 px')).toBeInTheDocument();
    press(']');
    expect(within(panel).getByText('8 px')).toBeInTheDocument();
    press('[');
    press('[');
    expect(within(panel).getByText('4 px')).toBeInTheDocument();
  });

  it('keeps paint not saved on the map after Done, and lets go of a picture with nothing painted once the map\'s own is back', async () => {
    await showMap();
    await paintOn();
    let canvas = pictureCanvas();
    fireEvent.click(screen.getByRole('button', { name: 'Done painting' }));
    // Paint's copy stays on screen while the map's own picture loads again.
    expect(pictures).toHaveLength(2);
    expect(canvas?.width).toBe(1000);
    pictures[1].load();
    expect([canvas?.width, canvas?.height]).toEqual([0, 0]);
    expect(usePaintStore.getState()).toMatchObject({ mapId: null, unsaved: false });

    await paintOn();
    canvas = pictureCanvas();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    expect(usePaintStore.getState()).toMatchObject({ mapId: 'map-a', unsaved: true });
    fireEvent.click(screen.getByRole('button', { name: 'Done painting' }));
    expect(canvas?.width).toBe(1000);
    // Nothing is loaded again: the paint is what the map shows.
    expect(pictures).toHaveLength(2);
    take(terrain());
    await nextFrame();
    expect(take(terrain()).some((c) => c.method === 'drawImage' && c.args[0] === canvas)).toBe(true);
    expect(usePaintStore.getState()).toMatchObject({ mapId: 'map-a', unsaved: true });
  });

  it('lets go of a picture with nothing painted when the map\'s own fails to load again, and says so', async () => {
    await showMap();
    await paintOn();
    const canvas = pictureCanvas();
    press('Escape');
    expect(canvas?.width).toBe(1000);
    pictures[1].fail();
    expect(canvas?.width).toBe(0);
    expect(screen.getByText('Failed to load map image')).toBeInTheDocument();
  });

  it('lets go of the map\'s decoded picture while it holds its copy, and draws only the copy', async () => {
    await showMap();
    const picture = pictures[0];
    await paintOn();
    take(terrain());
    await nextFrame();
    const drawn = take(terrain()).filter((c) => c.method === 'drawImage').map((c) => c.args[0]);
    expect(drawn).toContain(pictureCanvas());
    expect(drawn).not.toContain(picture);
    // Asked for again only when Paint is put away: the page no longer holds it.
    expect(pictures).toHaveLength(1);
    press('Escape');
    expect(pictures).toHaveLength(2);
    expect(pictures[1].src).toBe(picture.src);
  });
});

describe('the eraser', () => {
  /** The style the picture's last stroke was drawn in. */
  const lastStrokeStyle = () => pictureCanvas()?.getContext('2d')?.strokeStyle;

  it('paints the second colour, the map\'s own at first, in the brush\'s place', async () => {
    await showMap();
    await paintOn();
    drag({ clientX: 100, clientY: 100 }, { clientX: 200, clientY: 120 });
    expect(lastStrokeStyle()).toBe('#1a1a1a');
    fireEvent.click(screen.getByRole('button', { name: 'Eraser' }));
    expect(screen.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
    drag({ clientX: 100, clientY: 100 }, { clientX: 200, clientY: 120 });
    // A picture whose top-left pixel holds nothing erases to parchment.
    expect(lastStrokeStyle()).toBe('#e8dcc4');
  });

  it('paints the second colour chosen, and the brush keeps its own', async () => {
    await showMap();
    await paintOn();
    const panel = screen.getByRole('region', { name: 'Paint' });
    fireEvent.click(within(panel).getByRole('button', { name: /^Second colour/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Stone' }));
    expect(within(panel).getByRole('button', { name: /^Second colour/ })).toHaveAccessibleName('Second colour: Stone');
    press('e');
    drag({ clientX: 100, clientY: 100 }, { clientX: 200, clientY: 120 });
    expect(lastStrokeStyle()).toBe('#9b958a');
    press('b');
    drag({ clientX: 100, clientY: 100 }, { clientX: 200, clientY: 120 });
    expect(lastStrokeStyle()).toBe('#1a1a1a');
  });
});

describe('the lift', () => {
  it('copies each tile as the stroke first reaches it, and on the lift only paints: no tile copied or packed then', async () => {
    const packed = vi.fn();
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true, writable: true, value(done: BlobCallback) { packed(); done(new Blob(['tile'], { type: 'image/png' })); },
    });
    await showMap();
    await paintOn();
    const canvas = pictureCanvas();
    /** Tiles copied off the picture: drawImage of it onto any canvas but the map's own layers. */
    const copies = () => [...recorded.entries()]
      .filter(([c]) => c !== canvas && c !== terrain())
      .flatMap(([, calls]) => calls.filter((k) => k.method === 'drawImage' && k.args[0] === canvas)).length;
    mouse.down(input(), { clientX: 100, clientY: 100 });
    expect(copies()).toBe(1);
    mouse.move(input(), { clientX: 400, clientY: 100 }, 1);
    expect(copies()).toBe(2);
    mouse.move(input(), { clientX: 600, clientY: 100 }, 1);
    expect(copies()).toBe(3);
    mouse.move(input(), { clientX: 610, clientY: 110 }, 1);
    expect(copies()).toBe(3);
    const packedBefore = packed.mock.calls.length;

    mouse.up(input(), { clientX: 610, clientY: 110 });
    expect(copies()).toBe(3);
    expect(packed.mock.calls.length).toBe(packedBefore);
    expect(strokesOn(canvas)).toHaveLength(1);
    // Packed afterwards, while the page is idle.
    await waitFor(() => expect(packed).toHaveBeenCalledTimes(3));
  });

  it('copies nothing for a stroke dropped by a second finger, and keeps nothing of it', async () => {
    await showMap();
    await paintOn();
    const one = contact('touch', 1);
    const two = contact('touch', 2, false);
    one.down(input(), { clientX: 100, clientY: 100 });
    one.move(input(), { clientX: 400, clientY: 100 });
    two.down(input(), { clientX: 600, clientY: 600 });
    one.up(input(), { clientX: 400, clientY: 100 });
    two.up(input(), { clientX: 600, clientY: 600 });
    expect(screen.getByRole('button', { name: 'Undo stroke' })).toBeDisabled();
  });
});

describe('undo and redo', () => {
  it('put back the tiles a stroke touched, by Ctrl+Z and Ctrl+Y and the panel\'s buttons', async () => {
    await showMap();
    await paintOn();
    const canvas = pictureCanvas();
    expect(screen.getByRole('button', { name: 'Undo stroke' })).toBeDisabled();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    expect(screen.getByRole('button', { name: 'Undo stroke' })).toBeEnabled();
    // The two tiles across the stroke, 0 to 512 by 0 to 256, kept before it.
    const kept = [...recorded.entries()]
      .filter(([c]) => c !== canvas)
      .flatMap(([, calls]) => calls.filter((c) => c.method === 'drawImage' && c.args[0] === canvas).map((c) => c.args.slice(1, 5)));
    expect(kept).toEqual([[0, 0, 256, 256], [256, 0, 256, 256]]);

    take(canvas!);
    await act(async () => { press('z', { ctrlKey: true }); });
    await waitFor(() => expect(callsOn(canvas).filter((c) => c.method === 'clearRect').map((c) => c.args)).toEqual([[0, 0, 256, 256], [256, 0, 256, 256]]));
    expect(screen.getByRole('button', { name: 'Redo stroke' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Undo stroke' })).toBeDisabled();

    take(canvas!);
    await act(async () => { press('y', { ctrlKey: true }); });
    await waitFor(() => expect(callsOn(canvas).filter((c) => c.method === 'clearRect')).toHaveLength(2));
    expect(screen.getByRole('button', { name: 'Undo stroke' })).toBeEnabled();

    take(canvas!);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Undo stroke' })); });
    await waitFor(() => expect(callsOn(canvas).filter((c) => c.method === 'clearRect')).toHaveLength(2));
  });
});

/**
 * With Paint on, what each other tool and key would have done does not
 * happen. Each row arranges what the tool needs, turns Paint on, and acts.
 */
describe('Paint owns the map', () => {
  const rows: Array<{ what: string; arrange?: () => void; act: () => void | Promise<void>; nothing: () => void }> = [
    {
      what: '] and [ turn no token',
      act: () => {
        act(() => { useGameStore.getState().selectToken('goblin'); });
        press(']');
        press('[');
      },
      nothing: () => expect(h.updateToken).not.toHaveBeenCalled(),
    },
    {
      what: 'the arrow keys move no token',
      act: () => {
        act(() => { useGameStore.getState().selectToken('goblin'); });
        press('ArrowUp');
        press('ArrowLeft', { shiftKey: true });
      },
      nothing: () => expect(sentOf('token.move')).toEqual([]),
    },
    {
      what: 'Delete and Backspace delete no wall',
      arrange: () => {
        fireEvent.click(screen.getByText('Walls'));
        fireEvent.click(screen.getByLabelText('Wall select mode'));
        press('a', { ctrlKey: true });
      },
      act: () => {
        press('Delete');
        press('Backspace');
      },
      nothing: () => expect(sentOf('walls:')).toEqual([]),
    },
    {
      what: 'Ctrl+Z undoes no wall change',
      arrange: () => {
        fireEvent.click(screen.getByText('Walls'));
        fireEvent.click(screen.getByLabelText('Wall select mode'));
        press('a', { ctrlKey: true });
        press('Delete');
        expect(sentOf('walls:replace')).toHaveLength(1);
        h.sent.length = 0;
      },
      act: () => {
        press('z', { ctrlKey: true });
        press('y', { ctrlKey: true });
      },
      nothing: () => expect(sentOf('walls:')).toEqual([]),
    },
    {
      what: 'a double tap pings nothing',
      act: () => {
        const finger = contact('touch', 3);
        finger.down(input(), { clientX: 600, clientY: 600 });
        finger.up(input(), { clientX: 600, clientY: 600 });
        finger.down(input(), { clientX: 602, clientY: 601 });
        finger.up(input(), { clientX: 602, clientY: 601 });
      },
      nothing: () => expect(sentOf('map.ping')).toEqual([]),
    },
    {
      what: 'Draw is put away and draws nothing',
      arrange: () => {
        fireEvent.click(screen.getByRole('button', { name: 'Draw' }));
      },
      act: () => {
        expect(screen.queryByRole('button', { name: 'Draw' })).toBeNull();
        drag({ clientX: 100, clientY: 600 }, { clientX: 300, clientY: 700 });
      },
      nothing: () => expect(sentOf('drawing')).toEqual([]),
    },
    {
      what: 'a wall tool is put away and draws no wall',
      arrange: () => {
        fireEvent.click(screen.getByText('Walls'));
        fireEvent.click(screen.getByLabelText('Wall draw mode'));
      },
      act: () => {
        mouse.down(input(), { clientX: 100, clientY: 600 });
        mouse.up(input(), { clientX: 100, clientY: 600 });
        mouse.down(input(), { clientX: 300, clientY: 600 });
        mouse.up(input(), { clientX: 300, clientY: 600 });
        press('Enter');
      },
      nothing: () => expect(sentOf('wall')).toEqual([]),
    },
    {
      what: 'the ruler is put away, and not offered while Paint is on',
      arrange: () => {
        fireEvent.click(screen.getByRole('button', { name: /^Ruler/ }));
      },
      act: () => {
        expect(screen.queryByRole('button', { name: /^Ruler/ })).toBeNull();
        drag({ clientX: 100, clientY: 600 }, { clientX: 300, clientY: 700 });
      },
      nothing: () => {
        fireEvent.click(screen.getByRole('button', { name: 'Paint' }));
        expect(screen.getByRole('button', { name: /^Ruler/ }).className).not.toMatch(/bg-moss-green\/20/);
      },
    },
    {
      what: 'a press on a token picks it up and carries it nowhere',
      act: () => {
        mouse.down(input(), square(2, 15));
        mouse.move(input(), square(6, 15), 1);
        mouse.up(input(), square(6, 15));
        mouse.down(input(), square(8, 15));
        mouse.up(input(), square(8, 15));
      },
      nothing: () => {
        expect(sentOf('token.')).toEqual([]);
        expect(useGameStore.getState().tokens.goblin.position).toEqual({ x: 2, y: 15 });
      },
    },
  ];

  it.each(rows)('$what', async ({ arrange, act: doIt, nothing }) => {
    await showMap(mapWith({ tokens: [token('goblin', 2, 15)] }));
    act(() => { useGameStore.getState().setTokens([token('goblin', 2, 15)], 'map-a'); });
    arrange?.();
    // What the map asked for as it opened is not a tool's.
    h.sent.length = 0;
    await paintOn();
    await doIt();
    nothing();
  });

  it('opens no menu on a right-click, where one opens without it', async () => {
    await showMap(mapWith({ tokens: [token('goblin', 2, 15)] }));
    act(() => { useGameStore.getState().setTokens([token('goblin', 2, 15)], 'map-a'); });
    const menus = () => document.querySelectorAll('div.fixed.z-50.glass-panel');
    fireEvent.contextMenu(input(), square(2, 15));
    expect(menus()).toHaveLength(1);
    press('Escape');
    expect(menus()).toHaveLength(0);
    await paintOn();
    fireEvent.contextMenu(input(), square(2, 15));
    expect(menus()).toHaveLength(0);
  });

  it('puts itself away when a DM tool is armed from the stack', async () => {
    await showMap();
    await paintOn();
    fireEvent.click(screen.getByText('Walls'));
    fireEvent.click(screen.getByLabelText('Wall draw mode'));
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('places nothing dropped on the map from the roster', async () => {
    await showMap();
    const data = { getData: () => JSON.stringify({ type: 'character-token', characterId: 'c1', name: 'Aldra', imageUrl: '', userId: 'p1' }), types: ['text/plain'] };
    const drop = async () => {
      await act(async () => { fireEvent.drop(input(), { dataTransfer: data, clientX: 100, clientY: 100 }); });
    };
    await drop();
    expect(h.addToken).toHaveBeenCalledTimes(1);
    await paintOn();
    await drop();
    expect(h.addToken).toHaveBeenCalledTimes(1);
  });
});
