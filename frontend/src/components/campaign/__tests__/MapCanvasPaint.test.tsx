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
import { memoryDraftStore, type MemoryDraftStore } from '@/test/memoryDraftStore';
import { draftKey, draftTime, DRAFT_INTERVAL_MS, DRAFTS_UNAVAILABLE } from '../map/paint/paintDrafts';
import { qoiEncode } from '../map/paint/qoi';
import { viewedMapGuards } from '@/test/viewedMapContext';
import { leavePageWith } from '@/services/pageLeave';
import { onSheetEntry } from '@/components/campaign/compact/sheetHistory';
import { hasUnsavedWork, reportSignedIn, reportSignedOut } from '@/services/unsavedWork';
import type { ViewedMapChange } from '@/contexts/CampaignContext';
import { LayoutProvider } from '@/contexts/LayoutContext';

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
    uploadAsset: vi.fn(),
    deleteAsset: vi.fn(),
    updateMap: vi.fn(),
    getMap: vi.fn(),
    /** The draft store Paint is given; a fresh one each test. */
    drafts: { store: null as unknown },
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
vi.mock('../map/paint/paintDrafts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../map/paint/paintDrafts')>()),
  paintDraftStore: () => h.drafts.store,
}));
vi.mock('@/contexts/CampaignContext', async () => {
  const { useSyncExternalStore } = await import('react');
  const mapActions = (await import('@/test/viewedMapContext')).mapActionsFor(() => h.state.currentMap, (map) => h.set({ currentMap: map }));
  const noop = () => undefined;
  const campaign = { id: 'campaign-1', name: 'Test', spiritLayerEnabled: false, characters: [], status: 'ACTIVE', playersMayDraw: true, memberships: [], maps: [{ id: 'map-a' }, { id: 'map-b' }] };
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
  default: { updateMap: h.updateMap, getMaps: vi.fn().mockResolvedValue([]), getMap: h.getMap },
}));

vi.mock('@/services/api', () => {
  const named: Record<string, unknown> = {
    getAsset: h.getAsset, updateToken: h.updateToken, addToken: h.addToken, uploadAsset: h.uploadAsset, deleteAsset: h.deleteAsset,
    getServerConfig: () => Promise.resolve({}),
  };
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

/** The draft store of this test. */
const drafts = () => h.drafts.store as MemoryDraftStore;

beforeEach(() => {
  h.drafts.store = memoryDraftStore();
  h.sent.length = 0;
  h.handlers.clear();
  h.getAsset.mockReset().mockResolvedValue(drawnAsset());
  h.updateToken.mockReset().mockResolvedValue({});
  h.addToken.mockReset().mockResolvedValue({ token: token('placed', 1, 1) });
  h.uploadAsset.mockReset().mockResolvedValue({ message: 'ok', asset: { id: 'saved-1', type: 'MAP', scope: 'CAMPAIGN', campaignId: 'campaign-1', tags: ['drawn-map'] } });
  h.deleteAsset.mockReset().mockResolvedValue({ message: 'deleted' });
  h.getMap.mockReset().mockImplementation(() => Promise.resolve(h.state.currentMap));
  h.updateMap.mockReset().mockImplementation((_campaignId: string, mapId: string, data: { imageUrl: string }) =>
    Promise.resolve({ ...(h.state.currentMap as object), id: mapId, imageUrl: `/api/assets/maps/${data.imageUrl}` }));
  act(() => {
    useGameStore.getState().clearGameState();
    usePaintStore.setState({ mapId: null, unsaved: false, openOnMapId: null });
  });
  h.set({ userRole: 'DM' });
  // The picture's PNG, for Save.
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true, writable: true, value(done: BlobCallback) { done(new Blob(['picture'], { type: 'image/png' })); },
  });
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

  it('holds the picture in a canvas made to be read often, as undo, the fill and the eyedropper read it', async () => {
    const asked: Array<[HTMLCanvasElement, unknown]> = [];
    const making = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value(this: HTMLCanvasElement, ...args: Parameters<HTMLCanvasElement['getContext']>) {
        asked.push([this, args[1]]);
        return making.apply(this, args);
      },
    });
    await showMap();
    await paintOn();
    const canvas = pictureCanvas();
    expect(asked.find(([c]) => c === canvas)?.[1]).toEqual({ willReadFrequently: true });
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

  it('lands where the pointer is after the map\'s grid size changes, as Edit Map may change it while Paint is on', async () => {
    await showMap();
    await paintOn();
    // The picture, 1,000 pixels, is now stretched over 20 squares of 100.
    act(() => { h.set({ currentMap: { ...(h.state.currentMap as CampaignMap), gridSize: 100 } }); });
    drag({ clientX: 1000, clientY: 1000 }, { clientX: 1200, clientY: 1000 });
    const painted = callsOn(pictureCanvas());
    expect(painted.find((c) => c.method === 'moveTo')?.args).toEqual([500, 500]);
    expect(painted.filter((c) => c.method === 'lineTo').map((c) => c.args)).toContainEqual([600, 500]);
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

describe('lines, rectangles and ellipses', () => {
  const callsOfPicture = (method: string) => callsOn(pictureCanvas()).filter((c) => c.method === method);
  const choose = (tool: string) => fireEvent.click(within(screen.getByRole('region', { name: 'Paint' })).getByRole('button', { name: tool }));
  const last = (calls: Call[]) => calls[calls.length - 1];

  it('paint a line from the press to the lift, drawn on the overlay as it goes', async () => {
    await showMap();
    await paintOn();
    choose('Line');
    take(input());
    mouse.down(input(), { clientX: 100, clientY: 100 });
    mouse.move(input(), { clientX: 300, clientY: 180 }, 1);
    await nextFrame();
    expect(take(input()).some((c) => c.method === 'lineTo')).toBe(true);
    expect(callsOfPicture('stroke')).toEqual([]);
    mouse.up(input(), { clientX: 300, clientY: 180 });
    expect(last(callsOfPicture('moveTo'))?.args).toEqual([100, 100]);
    expect(last(callsOfPicture('lineTo'))?.args).toEqual([300, 180]);
  });

  it('hold a line to 15 degree steps with the toggle, or with Shift', async () => {
    await showMap();
    await paintOn();
    choose('Line');
    fireEvent.click(screen.getByRole('checkbox', { name: '15 degree steps' }));
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 110 });
    const [x, y] = last(callsOfPicture('lineTo'))!.args as [number, number];
    expect(x).toBeCloseTo(300.25, 1);
    expect(y).toBeCloseTo(100, 5);
    fireEvent.click(screen.getByRole('checkbox', { name: '15 degree steps' }));
    mouse.down(input(), { clientX: 100, clientY: 100 }, 0, { shiftKey: true });
    mouse.move(input(), { clientX: 200, clientY: 195 }, 1, { shiftKey: true });
    mouse.up(input(), { clientX: 200, clientY: 195 });
    const [x2, y2] = last(callsOfPicture('lineTo'))!.args as [number, number];
    expect(x2 - 100).toBeCloseTo(y2 - 100, 5);
  });

  it('put a rectangle\'s corners on the grid with Snap to grid, outlined in the colour', async () => {
    await showMap();
    await paintOn();
    choose('Rectangle');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Snap to grid' }));
    drag({ clientX: 52, clientY: 47 }, { clientX: 148, clientY: 104 });
    expect(last(callsOfPicture('rect'))?.args).toEqual([50, 50, 100, 50]);
    expect(callsOfPicture('stroke')).toHaveLength(1);
    expect(callsOfPicture('fill')).toHaveLength(0);
  });

  it('fill an ellipse with the second colour inside an outline of the colour', async () => {
    await showMap();
    await paintOn();
    choose('Ellipse');
    fireEvent.click(screen.getByRole('radio', { name: 'Outline and fill' }));
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    expect(last(callsOfPicture('ellipse'))?.args).toEqual([200, 150, 100, 50, 0, 0, Math.PI * 2]);
    expect(callsOfPicture('fill')).toHaveLength(1);
    expect(callsOfPicture('stroke')).toHaveLength(1);
  });

  it('paint nothing for a press that never moved, and choose themselves by L, R and O', async () => {
    await showMap();
    await paintOn();
    for (const [key, tool] of [['l', 'Line'], ['r', 'Rectangle'], ['o', 'Ellipse']]) {
      press(key);
      expect(screen.getByRole('button', { name: tool })).toHaveAttribute('aria-pressed', 'true');
      mouse.down(input(), { clientX: 120, clientY: 120 });
      mouse.up(input(), { clientX: 120, clientY: 120 });
    }
    expect(callsOfPicture('stroke')).toEqual([]);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});

describe('the fill bucket', () => {
  const choose = (tool: string) => fireEvent.click(within(screen.getByRole('region', { name: 'Paint' })).getByRole('button', { name: tool }));

  it('fills the area clicked with the colour, a tile at a time, never reading the whole picture, and undo keeps it', async () => {
    await showMap();
    await paintOn();
    choose('Fill');
    expect(screen.getByRole('slider', { name: 'Tolerance' })).toHaveValue('10');
    const canvas = pictureCanvas();
    take(canvas!);
    mouse.down(input(), { clientX: 300, clientY: 300 });
    mouse.up(input(), { clientX: 300, clientY: 300 });
    const calls = take(canvas!);
    // The stand-in picture is one empty colour throughout, so every tile of the 1,000 px picture is filled:
    // each read off the picture once, and written back.
    const tiles = [0, 256, 512, 768].flatMap((y) => [0, 256, 512, 768].map((x) => [x, y])).sort();
    const reads = calls.filter((c) => c.method === 'getImageData').map((c) => c.args as number[]);
    expect(reads.map(([x, y]) => [x, y]).sort()).toEqual(tiles);
    expect(reads.every(([, , w, h]) => w <= 256 && h <= 256)).toBe(true);
    const puts = calls.filter((c) => c.method === 'putImageData');
    expect(puts.map((c) => c.args.slice(1)).sort()).toEqual(tiles);
    const filled = puts[0].args[0] as ImageData;
    expect([...filled.data.subarray(0, 4)]).toEqual([26, 26, 26, 255]);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('says so when the device cannot read the picture to fill it, and changes nothing', async () => {
    await showMap();
    await paintOn();
    choose('Fill');
    const canvas = pictureCanvas();
    // The picture refuses to be read.
    Object.assign(canvas!.getContext('2d')!, { getImageData: () => { throw new RangeError('out of memory'); } });
    take(canvas!);
    mouse.down(input(), { clientX: 300, clientY: 300 });
    mouse.up(input(), { clientX: 300, clientY: 300 });
    expect(await screen.findByText('This device could not fill an area that large.')).toBeInTheDocument();
    expect(take(canvas!).filter((c) => c.method === 'putImageData')).toEqual([]);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('pans for a finger\'s drag, and fills on a tap', async () => {
    await showMap();
    await paintOn();
    press('f');
    expect(screen.getByRole('button', { name: 'Fill' })).toHaveAttribute('aria-pressed', 'true');
    const canvas = pictureCanvas();
    take(canvas!);
    const finger = contact('touch', 4);
    finger.down(input(), { clientX: 300, clientY: 300 });
    finger.move(input(), { clientX: 360, clientY: 340 });
    finger.up(input(), { clientX: 360, clientY: 340 });
    expect(take(canvas!).some((c) => c.method === 'getImageData')).toBe(false);
    finger.down(input(), { clientX: 300, clientY: 300 });
    finger.up(input(), { clientX: 300, clientY: 300 });
    expect(take(canvas!).some((c) => c.method === 'putImageData')).toBe(true);
  });
});

describe('text and the eyedropper', () => {
  const panel = () => screen.getByRole('region', { name: 'Paint' });

  it('paint a line of text where it is tapped, in the colour, once Enter is pressed', async () => {
    await showMap();
    await paintOn();
    press('t');
    expect(within(panel()).getByRole('button', { name: 'Text' })).toHaveAttribute('aria-pressed', 'true');
    const finger = contact('touch', 5);
    finger.down(input(), { clientX: 200, clientY: 300 });
    finger.up(input(), { clientX: 200, clientY: 300 });
    const box = screen.getByRole('textbox', { name: 'Text to paint' });
    fireEvent.change(box, { target: { value: 'Crypt' } });
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }); });
    await waitFor(() => expect(callsOn(pictureCanvas()).find((c) => c.method === 'fillText')?.args).toEqual(['Crypt', 200, 300]));
    const ctx = pictureCanvas()?.getContext('2d');
    expect(ctx?.font).toContain('24px');
    expect(ctx?.fillStyle).toBe('#1a1a1a');
    expect(screen.queryByRole('textbox', { name: 'Text to paint' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('paint no text when Esc closes its box, or it is left empty', async () => {
    await showMap();
    await paintOn();
    press('t');
    mouse.down(input(), { clientX: 200, clientY: 300 });
    mouse.up(input(), { clientX: 200, clientY: 300 });
    const box = screen.getByRole('textbox', { name: 'Text to paint' });
    fireEvent.change(box, { target: { value: 'Never' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Text to paint' })).toBeNull();
    mouse.down(input(), { clientX: 200, clientY: 300 });
    mouse.up(input(), { clientX: 200, clientY: 300 });
    await act(async () => { fireEvent.keyDown(screen.getByRole('textbox', { name: 'Text to paint' }), { key: 'Enter' }); });
    expect(callsOn(pictureCanvas()).some((c) => c.method === 'fillText')).toBe(false);
  });

  it('take the colour of the pixel tapped, reading that pixel alone, and go back to the tool before', async () => {
    await showMap();
    await paintOn();
    press('r');
    press('i');
    expect(within(panel()).getByRole('button', { name: 'Eyedropper' })).toHaveAttribute('aria-pressed', 'true');
    const canvas = pictureCanvas()!;
    const read: unknown[][] = [];
    Object.assign(canvas.getContext('2d')!, { getImageData: (...args: unknown[]) => {
      read.push(args);
      return { data: new Uint8ClampedArray([74, 52, 35, 255]) };
    } });
    mouse.down(input(), { clientX: 410, clientY: 220 });
    mouse.up(input(), { clientX: 410, clientY: 220 });
    expect(read).toEqual([[410, 220, 1, 1]]);
    expect(within(panel()).getByRole('button', { name: /^Colour:/ })).toHaveAccessibleName('Colour: Dark wood');
    expect(within(panel()).getByRole('button', { name: 'Rectangle' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('a picture changed elsewhere', () => {
  const changePictureTo = (imageUrl: string) => {
    act(() => { h.set({ currentMap: { ...(h.state.currentMap as CampaignMap), imageUrl } }); });
  };
  const question = () => screen.queryByRole('dialog', { name: 'This map\'s picture changed' });

  it('with paint not saved, shows the new picture and asks; Discard lets the paint go', async () => {
    await showMap();
    await paintOn();
    const canvas = pictureCanvas();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    // Edit Map gives the map an uploaded picture.
    h.getAsset.mockImplementation((id: string) => Promise.resolve(id === 'uploaded-1' ? drawnAsset(['dungeon']) : drawnAsset()));
    changePictureTo('/api/assets/maps/uploaded-1');
    await act(async () => { await Promise.resolve(); });
    expect(question()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'false');
    // The page loads the new picture, and draws it, not the paint.
    const fresh = pictures[pictures.length - 1];
    expect(fresh.src).toBe('/api/assets/maps/uploaded-1');
    fresh.load();
    take(terrain());
    await nextFrame();
    const drawn = take(terrain()).filter((c) => c.method === 'drawImage').map((c) => c.args[0]);
    expect(drawn).toContain(fresh);
    expect(drawn).not.toContain(canvas);
    fireEvent.click(within(question()!).getByRole('button', { name: 'Discard my painting' }));
    await waitFor(() => expect(question()).toBeNull());
    expect(usePaintStore.getState()).toMatchObject({ mapId: null, unsaved: false });
    expect(canvas?.width).toBe(0);
  });

  it('Save my painting over it saves, and deletes no uploaded picture', async () => {
    await showMap();
    await paintOn();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    h.getAsset.mockImplementation((id: string) => Promise.resolve(id === 'uploaded-2' ? drawnAsset(['dungeon']) : drawnAsset()));
    changePictureTo('/api/assets/maps/uploaded-2');
    await act(async () => { await Promise.resolve(); });
    await act(async () => { fireEvent.click(within(question()!).getByRole('button', { name: 'Save my painting over it' })); });
    await waitFor(() => expect(h.updateMap).toHaveBeenCalledWith('campaign-1', 'map-a', { imageUrl: 'saved-1' }));
    expect(h.deleteAsset).not.toHaveBeenCalled();
    expect(usePaintStore.getState().unsaved).toBe(false);
  });

  it('Not now keeps the paint, and Paint, still offered, asks again', async () => {
    await showMap();
    await paintOn();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    h.getAsset.mockImplementation((id: string) => Promise.resolve(id === 'uploaded-3' ? drawnAsset(['dungeon']) : drawnAsset()));
    changePictureTo('/api/assets/maps/uploaded-3');
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(within(question()!).getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(question()).toBeNull());
    expect(usePaintStore.getState().unsaved).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Paint' }));
    expect(question()).toBeInTheDocument();
  });

  it('with nothing to save, simply gives way to the new picture', async () => {
    await showMap();
    await paintOn();
    const canvas = pictureCanvas();
    changePictureTo('/api/assets/maps/other-drawn');
    await act(async () => { await Promise.resolve(); });
    expect(question()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Paint', pressed: true })).toBeNull();
    expect(canvas?.width).toBe(0);
  });

  it('keeps the paint through the map sent again with its picture unchanged', async () => {
    await showMap();
    await paintOn();
    const canvas = pictureCanvas();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    act(() => { h.set({ currentMap: { ...(h.state.currentMap as CampaignMap), name: 'Renamed' } }); });
    await act(async () => { await Promise.resolve(); });
    expect(question()).toBeNull();
    expect(usePaintStore.getState()).toMatchObject({ mapId: 'map-a', unsaved: true });
    take(terrain());
    await nextFrame();
    expect(take(terrain()).some((c) => c.method === 'drawImage' && c.args[0] === canvas)).toBe(true);
  });

  it('is found at Save, though this page was not told of it, and asked about before anything is uploaded', async () => {
    await showMap();
    await paintOn();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    // Another tab saved this map, which is being prepared: no map.changed came.
    h.getMap.mockResolvedValue({ ...(h.state.currentMap as CampaignMap), imageUrl: '/api/assets/maps/from-another-tab' });
    await act(async () => { fireEvent.click(within(screen.getByRole('region', { name: 'Paint' })).getByRole('button', { name: 'Save' })); });
    expect(await screen.findByRole('dialog', { name: 'This map\'s picture changed' })).toBeInTheDocument();
    expect(h.uploadAsset).not.toHaveBeenCalled();
  });
});

describe('the lift', () => {
  it('reads each tile as the stroke first reaches it, and on the lift only paints: no tile read then', async () => {
    await showMap();
    await paintOn();
    const canvas = pictureCanvas();
    /** Tiles read off the picture (not the one pixel read as Paint opens). */
    const copies = () => callsOn(canvas).filter((k) => k.method === 'getImageData' && k.args[2] !== 1).length;
    mouse.down(input(), { clientX: 100, clientY: 100 });
    expect(copies()).toBe(1);
    mouse.move(input(), { clientX: 400, clientY: 100 }, 1);
    expect(copies()).toBe(2);
    mouse.move(input(), { clientX: 600, clientY: 100 }, 1);
    expect(copies()).toBe(3);
    mouse.move(input(), { clientX: 610, clientY: 110 }, 1);
    expect(copies()).toBe(3);

    mouse.up(input(), { clientX: 610, clientY: 110 });
    expect(copies()).toBe(3);
    expect(strokesOn(canvas)).toHaveLength(1);
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
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});

describe('undo and redo', () => {
  it('put back the tiles a stroke touched, by Ctrl+Z and Ctrl+Y and the panel\'s buttons', async () => {
    await showMap();
    await paintOn();
    const canvas = pictureCanvas();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    // The two tiles across the stroke, 0 to 512 by 0 to 256, kept before it.
    const kept = callsOn(canvas).filter((c) => c.method === 'getImageData' && c.args[2] !== 1).map((c) => c.args);
    expect(kept).toEqual([[0, 0, 256, 256], [256, 0, 256, 256]]);

    /** Where tiles were put back. */
    const putBack = () => callsOn(canvas).filter((c) => c.method === 'putImageData').map((c) => c.args.slice(1, 3));
    take(canvas!);
    await act(async () => { press('z', { ctrlKey: true }); });
    await waitFor(() => expect(putBack()).toEqual([[0, 0], [256, 0]]));
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

    take(canvas!);
    await act(async () => { press('y', { ctrlKey: true }); });
    await waitFor(() => expect(putBack()).toHaveLength(2));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();

    take(canvas!);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Undo' })); });
    await waitFor(() => expect(putBack()).toHaveLength(2));
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

/**
 * Painting the map the table is on, while the players play. They are sent
 * nothing until Save, and the map sent again meanwhile (a token moved, the
 * DM's own save coming back) leaves the paint and the stroke under way as
 * they are.
 */
describe('on the table\'s map', () => {
  const question = () => screen.queryByRole('dialog', { name: 'This map\'s picture changed' });
  /** The server sending the table's map again, as it does after a token's REST change or a save. */
  const sendMap = (map: CampaignMap) => {
    act(() => {
      for (const handler of h.handlers.get('map.changed') ?? []) handler({ mapId: map.id, mapData: map } as never);
    });
  };

  it('sends the table nothing while the DM paints, fills and undoes', async () => {
    await showMap();
    await paintOn();
    h.sent.length = 0;
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    press('f');
    fireEvent.pointerDown(input(), { pointerId: 9, pointerType: 'mouse', button: 0, buttons: 1, isPrimary: true, clientX: 700, clientY: 700 });
    fireEvent.pointerUp(input(), { pointerId: 9, pointerType: 'mouse', button: 0, buttons: 0, isPrimary: true, clientX: 700, clientY: 700 });
    await act(async () => { press('z', { ctrlKey: true }); });
    expect(h.sent).toEqual([]);
    expect(h.updateMap).not.toHaveBeenCalled();
    expect(h.uploadAsset).not.toHaveBeenCalled();
  });

  it('keeps the stroke under way and the paint not saved when the map is sent again with a token moved', async () => {
    const goblin = token('goblin', 2, 15);
    await showMap(mapWith({ tokens: [goblin] }));
    act(() => { useGameStore.getState().setTokens([goblin], 'map-a'); });
    await paintOn();
    const canvas = pictureCanvas();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    mouse.down(input(), { clientX: 500, clientY: 500 });
    mouse.move(input(), { clientX: 600, clientY: 520 }, 1);
    // A player moved the goblin: the server sends the table's map again.
    sendMap({ ...(h.state.currentMap as CampaignMap), tokens: [{ ...goblin, position: { x: 4, y: 15 } }] });
    mouse.move(input(), { clientX: 700, clientY: 540 }, 1);
    mouse.up(input(), { clientX: 700, clientY: 540 });
    expect(strokesOn(canvas)).toHaveLength(2);
    expect(pictureCanvas()).toBe(canvas);
    expect(usePaintStore.getState()).toMatchObject({ mapId: 'map-a', unsaved: true });
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'true');
    expect(useGameStore.getState().tokens.goblin?.position).toEqual({ x: 4, y: 15 });
    expect(question()).toBeNull();
  });

  it('takes its own save sent back before the save has answered as the picture saved: Paint stays on, nothing asked', async () => {
    await showMap();
    await paintOn();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    // The server tells every page of the new picture before it answers the save.
    h.updateMap.mockImplementation((_campaignId: string, mapId: string, data: { imageUrl: string }) => {
      const saved = { ...(h.state.currentMap as CampaignMap), id: mapId, imageUrl: `/api/assets/maps/${data.imageUrl}` };
      sendMap(saved);
      return Promise.resolve(saved);
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole('region', { name: 'Paint' })).getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => expect(usePaintStore.getState().unsaved).toBe(false));
    expect(question()).toBeNull();
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'true');
    // And painting goes on, on the picture saved.
    drag({ clientX: 400, clientY: 400 }, { clientX: 500, clientY: 450 });
    expect(usePaintStore.getState()).toMatchObject({ mapId: 'map-a', unsaved: true });
  });
});

/**
 * Drafts: what is painted and not saved is kept in the browser, the tiles
 * changed only, so a reload or a closed tab does not take it, and is
 * offered back when Paint opens on the map again.
 */
describe('drafts', () => {
  const key = draftKey('me', 'campaign-1', 'map-a');
  /** Let the draft's write, queued behind any before it, land. */
  const settle = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });
  const restoreQuestion = () => screen.queryByRole('dialog', { name: 'Restore your painting?' });
  /** A draft kept for map-a, of the two tiles at the top left, as a reload would find it. */
  function keepDraft(baseUrl: string, savedAt = Date.now()) {
    const blank = qoiEncode(new Uint8ClampedArray(256 * 256 * 4));
    drafts().headers.set(key, { key, userId: 'me', campaignId: 'campaign-1', mapId: 'map-a', baseUrl, width: 1000, height: 1000, savedAt });
    drafts().kept.set(key, new Map([['0,0', { tx: 0, ty: 0, packed: blank }], ['1,0', { tx: 1, ty: 0, packed: blank }]]));
  }
  const putBack = () => callsOn(pictureCanvas()).filter((c) => c.method === 'putImageData').map((c) => c.args.slice(1, 3));

  it('writes the tiles painted within 10 seconds, then only those changed since', async () => {
    await showMap();
    await paintOn();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    expect(drafts().writes).toEqual([]);
    act(() => { vi.advanceTimersByTime(DRAFT_INTERVAL_MS); });
    await settle();
    expect(drafts().writes).toEqual([{ key, tiles: ['0,0', '1,0'], fresh: true, baseUrl: (h.state.currentMap as CampaignMap).imageUrl }]);
    drag({ clientX: 600, clientY: 600 }, { clientX: 620, clientY: 610 });
    act(() => { vi.advanceTimersByTime(DRAFT_INTERVAL_MS); });
    await settle();
    expect(drafts().writes[1]).toMatchObject({ tiles: ['2,2'], fresh: false });
    expect([...drafts().kept.get(key)!.keys()].sort()).toEqual(['0,0', '1,0', '2,2']);
  });

  it('writes at once when the page is hidden', async () => {
    await showMap();
    await paintOn();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      await settle();
    } finally {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    }
    expect(drafts().writes.map((w) => w.tiles)).toEqual([['0,0', '1,0']]);
  });

  it('writes what is not saved as another map is shown', async () => {
    await showMap();
    await paintOn();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    act(() => { h.set({ currentMap: mapWith({ id: 'map-b', name: 'Map B' }) }); });
    await settle();
    expect(drafts().writes.map((w) => [w.key, w.tiles])).toEqual([[key, ['0,0', '1,0']]]);
  });

  it('offers the draft back when Paint opens on the map again; Restore puts its tiles back, not saved', async () => {
    const map = mapWith();
    keepDraft(map.imageUrl ?? '', new Date(2026, 10, 2, 14, 5).getTime());
    await showMap(map);
    fireEvent.click(await screen.findByRole('button', { name: 'Paint' }));
    expect(restoreQuestion()).toBeInTheDocument();
    expect(within(restoreQuestion()!).getByText(`Restore your unsaved painting from ${draftTime(new Date(2026, 10, 2, 14, 5).getTime())}?`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'false');
    await act(async () => { fireEvent.click(within(restoreQuestion()!).getByRole('button', { name: 'Restore my painting' })); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'true'));
    expect(putBack()).toEqual([[0, 0], [256, 0]]);
    expect(usePaintStore.getState()).toMatchObject({ mapId: 'map-a', unsaved: true });
    expect(restoreQuestion()).toBeNull();
  });

  it('Discard drops the draft and opens Paint on the picture as saved', async () => {
    const map = mapWith();
    keepDraft(map.imageUrl ?? '');
    await showMap(map);
    fireEvent.click(await screen.findByRole('button', { name: 'Paint' }));
    await act(async () => { fireEvent.click(within(restoreQuestion()!).getByRole('button', { name: 'Discard it' })); });
    await settle();
    expect(drafts().headers.has(key)).toBe(false);
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'true');
    expect(putBack()).toEqual([]);
    expect(usePaintStore.getState().unsaved).toBe(false);
  });

  it('Not now keeps the draft, and leaves Paint off until it is pressed again', async () => {
    const map = mapWith();
    keepDraft(map.imageUrl ?? '');
    await showMap(map);
    fireEvent.click(await screen.findByRole('button', { name: 'Paint' }));
    fireEvent.click(within(restoreQuestion()!).getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(restoreQuestion()).toBeNull());
    expect(drafts().headers.has(key)).toBe(true);
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Paint' }));
    expect(restoreQuestion()).toBeInTheDocument();
  });

  it('says so when the draft was painted on a picture changed since', async () => {
    keepDraft('/api/assets/maps/an-older-picture');
    await showMap();
    fireEvent.click(await screen.findByRole('button', { name: 'Paint' }));
    expect(within(restoreQuestion()!).getByText(/was painted on an older picture of this map/)).toBeInTheDocument();
    expect(within(restoreQuestion()!).getByRole('button', { name: 'Restore it over this picture' })).toBeInTheDocument();
  });

  it('is cleared by Save, and by Discard', async () => {
    await showMap();
    await paintOn();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await settle();
    expect(drafts().headers.has(key)).toBe(true);
    await act(async () => {
      fireEvent.click(within(screen.getByRole('region', { name: 'Paint' })).getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => expect(usePaintStore.getState().unsaved).toBe(false));
    await settle();
    expect(drafts().headers.has(key)).toBe(false);

    // Paint on a picture changed elsewhere, discarded when asked.
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    await settle();
    expect(drafts().headers.has(key)).toBe(true);
    h.getAsset.mockImplementation((id: string) => Promise.resolve(id === 'uploaded-9' ? drawnAsset(['dungeon']) : drawnAsset()));
    act(() => { h.set({ currentMap: { ...(h.state.currentMap as CampaignMap), imageUrl: '/api/assets/maps/uploaded-9' } }); });
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'This map\'s picture changed' })).getByRole('button', { name: 'Discard my painting' }));
    await settle();
    expect(drafts().headers.has(key)).toBe(false);
  });

  it('in a browser that keeps none, says so once there is paint to keep, and painting goes on', async () => {
    drafts().failing = true;
    await showMap();
    await paintOn();
    await settle();
    expect(screen.queryByText(DRAFTS_UNAVAILABLE)).toBeNull();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    await settle();
    expect(screen.getByText(DRAFTS_UNAVAILABLE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close notification' }));
    await waitFor(() => expect(screen.queryByText(DRAFTS_UNAVAILABLE)).toBeNull());
    drag({ clientX: 400, clientY: 400 }, { clientX: 500, clientY: 500 });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    await settle();
    expect(screen.queryByText(DRAFTS_UNAVAILABLE)).toBeNull();
    expect(strokesOn(pictureCanvas())).toHaveLength(2);
    expect(usePaintStore.getState().unsaved).toBe(true);
  });

  it('of a map no longer in the campaign, deleted from another device, is dropped as the DM opens the campaign', async () => {
    const header = (mapId: string, userId = 'me') => ({ key: draftKey(userId, 'campaign-1', mapId), userId, campaignId: 'campaign-1', mapId, baseUrl: '', width: 10, height: 10, savedAt: 0 });
    await drafts().put(header('map-gone'), [], true);
    await drafts().put(header('map-b'), [], true);
    await drafts().put(header('map-gone', 'someone-else'), [], true);
    await showMap();
    await settle();
    expect([...drafts().headers.values()].map((d) => `${d.userId} ${d.mapId}`).sort()).toEqual(['me map-b', 'someone-else map-gone']);
  });

  it('is offered to no one but the DM', async () => {
    h.set({ userRole: 'PLAYER' });
    keepDraft('');
    await showMap();
    expect(screen.queryByRole('button', { name: 'Paint' })).toBeNull();
    expect(restoreQuestion()).toBeNull();
  });
});

/**
 * Paint not saved is asked about before anything takes it off the screen:
 * the campaign's map changes (Open to prepare, Back to the table, Set
 * Active, Bring everyone here, deleting the map), and leaving the page.
 * Each asks the same question: Save my painting, Discard my painting, or
 * Not now, which Esc is too.
 */
describe('paint not saved, asked about before it is left', () => {
  const question = () => screen.queryByRole('dialog', { name: 'Save your painting?' });
  const guard = () => {
    expect(viewedMapGuards.size).toBe(1);
    return [...viewedMapGuards][0];
  };
  async function painted() {
    await showMap();
    await paintOn();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
  }
  /** Ask the map's guard about a change, keeping its answer. */
  function askAbout(kind: ViewedMapChange['kind']) {
    const answer: { value?: boolean } = {};
    act(() => { void Promise.resolve(guard().mayLeave({ kind, toMapId: 'map-b' })).then((leave) => { answer.value = leave; }); });
    return answer;
  }
  const choose = async (name: string) => {
    await act(async () => { fireEvent.click(within(question()!).getByRole('button', { name })); });
    await act(async () => { await Promise.resolve(); });
  };

  it.each([
    ['open-other', 'Save it before you open another map?'],
    ['back-to-table', 'Save it before you go back to the table?'],
    ['set-active', 'Save it before the table moves to another map?'],
  ] as const)('%s asks the three-way question; Not now keeps the paint and stops the change', async (kind, words) => {
    await painted();
    const answer = askAbout(kind);
    await waitFor(() => expect(question()).toBeInTheDocument());
    expect(within(question()!).getByText(new RegExp(words.replace(/[.?]/g, '\\$&')))).toBeInTheDocument();
    expect(within(question()!).getAllByRole('button').map((b) => b.textContent)).toEqual(expect.arrayContaining(['Save my painting', 'Discard my painting', 'Not now']));
    await choose('Not now');
    expect(answer.value).toBe(false);
    await waitFor(() => expect(question()).toBeNull());
    expect(usePaintStore.getState()).toMatchObject({ mapId: 'map-a', unsaved: true });
  });

  it('asks before the map is deleted only whether to discard it: a picture saved now would go with the map', async () => {
    const discardQuestion = () => screen.queryByRole('dialog', { name: 'Discard your painting?' });
    await painted();
    const answer = askAbout('delete');
    await waitFor(() => expect(discardQuestion()).toBeInTheDocument());
    expect(within(discardQuestion()!).getByText('Your painting of Map A is not saved, and goes with the map.')).toBeInTheDocument();
    expect(within(discardQuestion()!).queryByRole('button', { name: 'Save my painting' })).toBeNull();
    await act(async () => { fireEvent.click(within(discardQuestion()!).getByRole('button', { name: 'Not now' })); });
    await waitFor(() => expect(answer.value).toBe(false));
    const second = askAbout('delete');
    await waitFor(() => expect(discardQuestion()).toBeInTheDocument());
    await act(async () => { fireEvent.click(within(discardQuestion()!).getByRole('button', { name: 'Discard my painting' })); });
    await waitFor(() => expect(second.value).toBe(true));
    expect(usePaintStore.getState().unsaved).toBe(false);
  });

  it('asks nothing for Bring everyone here: the map on screen stays, and its paint with it', async () => {
    await painted();
    const answer = askAbout('bring-everyone');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(answer.value).toBe(true);
    expect(question()).toBeNull();
    expect(usePaintStore.getState()).toMatchObject({ mapId: 'map-a', unsaved: true });
  });

  it('waits for a save under way before Bring everyone here, which then reads the picture saved', async () => {
    await painted();
    let land: (() => void) | null = null;
    h.updateMap.mockImplementation((_campaignId: string, mapId: string, data: { imageUrl: string }) => new Promise((resolve) => {
      land = () => resolve({ ...(h.state.currentMap as CampaignMap), id: mapId, imageUrl: `/api/assets/maps/${data.imageUrl}` });
    }));
    await act(async () => { fireEvent.click(within(screen.getByRole('region', { name: 'Paint' })).getByRole('button', { name: 'Save' })); });
    await waitFor(() => expect(land).not.toBeNull());
    const answer = askAbout('bring-everyone');
    await act(async () => { await Promise.resolve(); });
    expect(answer.value).toBeUndefined();
    await act(async () => { land!(); });
    await waitFor(() => expect(answer.value).toBe(true));
    expect(question()).toBeNull();
  });

  it('closes the question about a picture changed elsewhere when the paint is discarded from this one', async () => {
    await painted();
    act(() => { h.set({ currentMap: { ...(h.state.currentMap as CampaignMap), imageUrl: '/api/assets/maps/elsewhere-1' } }); });
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'This map\'s picture changed' })).toBeInTheDocument());
    askAbout('open-other');
    await waitFor(() => expect(question()).toBeInTheDocument());
    await choose('Discard my painting');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'This map\'s picture changed' })).toBeNull());
  });

  it('asks nothing, and lets the change go, with nothing to save', async () => {
    await showMap();
    await paintOn();
    const answer = askAbout('open-other');
    await act(async () => { await Promise.resolve(); });
    expect(answer.value).toBe(true);
    expect(question()).toBeNull();
  });

  it('Save my painting saves, then lets the change go', async () => {
    await painted();
    const answer = askAbout('back-to-table');
    await waitFor(() => expect(question()).toBeInTheDocument());
    await choose('Save my painting');
    await waitFor(() => expect(answer.value).toBe(true));
    expect(h.updateMap).toHaveBeenCalledWith('campaign-1', 'map-a', { imageUrl: 'saved-1' });
    expect(usePaintStore.getState().unsaved).toBe(false);
    await waitFor(() => expect(question()).toBeNull());
  });

  it('a save refused keeps the paint, and the change does not happen', async () => {
    await painted();
    h.uploadAsset.mockRejectedValue(new Error('refused'));
    const answer = askAbout('set-active');
    await waitFor(() => expect(question()).toBeInTheDocument());
    await choose('Save my painting');
    await waitFor(() => expect(answer.value).toBe(false));
    expect(usePaintStore.getState().unsaved).toBe(true);
  });

  it('Discard my painting lets it go, with its draft, and lets the change go', async () => {
    await painted();
    const canvas = pictureCanvas();
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    await act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });
    expect(drafts().headers.size).toBe(1);
    const answer = askAbout('open-other');
    await waitFor(() => expect(question()).toBeInTheDocument());
    await choose('Discard my painting');
    expect(answer.value).toBe(true);
    expect(canvas?.width).toBe(0);
    await act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });
    expect(drafts().headers.size).toBe(0);
  });

  it('takes Esc as Not now', async () => {
    await painted();
    const answer = askAbout('open-other');
    await waitFor(() => expect(question()).toBeInTheDocument());
    await act(async () => { fireEvent.keyDown(question()!, { key: 'Escape' }); });
    await waitFor(() => expect(answer.value).toBe(false));
    expect(usePaintStore.getState().unsaved).toBe(true);
  });

  it('holds the map on screen while paint is not saved, so the table moving on from elsewhere leaves it', async () => {
    await showMap();
    await paintOn();
    expect(guard().holds?.()).toBe(false);
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    expect(guard().holds?.()).toBe(true);
  });

  it('asks one question at a time: one asked meanwhile waits, and after a discard asks nothing', async () => {
    await painted();
    const first = askAbout('open-other');
    const second = askAbout('back-to-table');
    await waitFor(() => expect(question()).toBeInTheDocument());
    expect(screen.getAllByRole('dialog', { name: 'Save your painting?' })).toHaveLength(1);
    await choose('Discard my painting');
    await waitFor(() => expect(second.value).toBe(true));
    expect(first.value).toBe(true);
    await waitFor(() => expect(question()).toBeNull());
  });

  it('waits for a save under way, and asks nothing when it saved everything', async () => {
    await painted();
    let land: (() => void) | null = null;
    h.updateMap.mockImplementation((_campaignId: string, mapId: string, data: { imageUrl: string }) => new Promise((resolve) => {
      land = () => resolve({ ...(h.state.currentMap as CampaignMap), id: mapId, imageUrl: `/api/assets/maps/${data.imageUrl}` });
    }));
    await act(async () => { fireEvent.click(within(screen.getByRole('region', { name: 'Paint' })).getByRole('button', { name: 'Save' })); });
    await waitFor(() => expect(land).not.toBeNull());
    const answer = askAbout('open-other');
    await act(async () => { await Promise.resolve(); });
    expect(question()).toBeNull();
    expect(answer.value).toBeUndefined();
    await act(async () => { land!(); });
    await waitFor(() => expect(answer.value).toBe(true));
    expect(question()).toBeNull();
  });

  it('asks before the page is left by its own way out, keeps the session and the page through a lost sign-in, and holds the browser\'s Back and a reload', async () => {
    await showMap();
    await paintOn();
    expect(hasUnsavedWork()).toBe(false);
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    expect(hasUnsavedWork()).toBe(true);
    expect((window.history.state as Record<string, unknown> | null)?.cozyvttSheet).toBe(true);
    const reload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(reload);
    expect(reload.defaultPrevented).toBe(true);

    const left = vi.fn();
    act(() => { leavePageWith(left); });
    await waitFor(() => expect(question()).toBeInTheDocument());
    expect(within(question()!).getByText(/Save it before you leave this page\?/)).toBeInTheDocument();
    await choose('Not now');
    expect(left).not.toHaveBeenCalled();
    act(() => { leavePageWith(left); });
    await waitFor(() => expect(question()).toBeInTheDocument());
    await choose('Discard my painting');
    await waitFor(() => expect(left).toHaveBeenCalled());
    expect(hasUnsavedWork()).toBe(false);
  });
});

describe('Download picture', () => {
  it('saves the picture as it is now, painted or not, as a PNG named after the map, and keeps the paint', async () => {
    const saved: Blob[] = [];
    const names: string[] = [];
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: (blob: Blob) => { saved.push(blob); return 'blob:picture'; } });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: () => undefined });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    try {
      await showMap(mapWith({ name: 'Crypt: level 1' }));
      await paintOn();
      drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
      await act(async () => { fireEvent.click(within(screen.getByRole('region', { name: 'Paint' })).getByRole('button', { name: 'Download picture' })); });
      await waitFor(() => expect(saved).toHaveLength(1));
      expect(saved[0].type).toBe('image/png');
      expect(names).toEqual(['Crypt level 1.png']);
      expect(usePaintStore.getState()).toMatchObject({ mapId: 'map-a', unsaved: true });
    } finally {
      click.mockRestore();
    }
  });
});

describe('paint not saved through a lost sign-in', () => {
  it('stays, and the panel says to sign in again before saving', async () => {
    await showMap();
    await paintOn();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    act(() => { reportSignedOut(); });
    try {
      const panel = screen.getByRole('region', { name: 'Paint' });
      expect(within(panel).getByText('You\'ve been signed out.')).toBeInTheDocument();
      expect(usePaintStore.getState()).toMatchObject({ mapId: 'map-a', unsaved: true });
    } finally {
      act(() => { reportSignedIn(); });
    }
  });
});

/**
 * Leaving the page, with the history as the browser and the router keep
 * it: Discard drops the paint in its own click, and Save once it lands, and
 * the page must still be left, by Back past the page or by the header's way.
 */
describe('paint not saved, the page left after answering', () => {
  const question = () => screen.queryByRole('dialog', { name: 'Save your painting?' });
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 60)));
  /** The header's way out, moving as BrowserRouter does. */
  const header = () => leavePageWith(() => {
    if (onSheetEntry()) window.history.replaceState({}, '', '/characters');
    else window.history.pushState({}, '', '/characters');
  });

  it.each([
    ['Back', 'Discard my painting'],
    ['Back', 'Save my painting'],
    ['the header', 'Discard my painting'],
    ['the header', 'Save my painting'],
  ])('leaves by %s on %s', async (way, answer) => {
    // The history left by the tests before, settled first: a page they
    // left with paint not saved took its entry back off.
    await settle();
    window.history.pushState({}, '', '/dashboard');
    window.history.pushState({}, '', '/campaigns/c1');
    await showMap();
    await paintOn();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    if (way === 'Back') {
      act(() => { window.history.back(); });
      await settle();
    } else {
      act(() => { header(); });
    }
    await waitFor(() => expect(question()).toBeInTheDocument());
    await act(async () => { fireEvent.click(within(question()!).getByRole('button', { name: answer })); });
    await waitFor(() => expect(usePaintStore.getState().unsaved).toBe(false));
    await settle();
    expect(window.location.pathname).toBe(way === 'Back' ? '/dashboard' : '/characters');
  });
});

/**
 * Paint not saved on a map that leaves the screen without asking: the map
 * deleted from elsewhere, or the viewer no longer the DM. The painting is
 * kept as a draft and offered as a picture to download, never let go of
 * unsaid.
 */
describe('paint not saved, its map gone without asking', () => {
  const offer = () => screen.queryByRole('dialog', { name: 'Your painting was not saved' });

  it('is offered as a picture to download, and kept as a draft', async () => {
    const saved: Blob[] = [];
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: (blob: Blob) => { saved.push(blob); return 'blob:painting'; } });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: () => undefined });
    await showMap();
    await paintOn();
    const canvas = pictureCanvas();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    // Deleted from another tab while it was being prepared: the page shows the table's map.
    act(() => { h.set({ currentMap: mapWith({ id: 'map-b', name: 'Map B' }) }); });
    await waitFor(() => expect(offer()).toBeInTheDocument());
    expect(within(offer()!).getByText(/Map A is no longer on your screen, so your painting of it was not saved/)).toBeInTheDocument();
    expect(drafts().writes).toHaveLength(1);
    expect(canvas?.width).toBe(1000);
    await act(async () => { fireEvent.click(within(offer()!).getByRole('button', { name: 'Download my painting' })); });
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].type).toBe('image/png');
    await waitFor(() => expect(offer()).toBeNull());
    expect(canvas?.width).toBe(0);
  });

  it('opens with the keyboard on Download my painting', async () => {
    await showMap();
    await paintOn();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    act(() => { h.set({ currentMap: mapWith({ id: 'map-b', name: 'Map B' }) }); });
    await waitFor(() => expect(offer()).toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(within(offer()!).getByRole('button', { name: 'Download my painting' })));
  });

  it('is held as paint not saved is, until it is downloaded or discarded: a reload asks, the session is kept, Back stays', async () => {
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    window.history.pushState({}, '', '/dashboard');
    window.history.pushState({}, '', '/campaigns/c1');
    await showMap();
    await paintOn();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    act(() => { h.set({ currentMap: mapWith({ id: 'map-b', name: 'Map B' }) }); });
    await waitFor(() => expect(offer()).toBeInTheDocument());
    const reload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(reload()).toBe(true);
    expect(hasUnsavedWork()).toBe(true);
    act(() => { window.history.back(); });
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(window.location.pathname).toBe('/campaigns/c1');
    expect(offer()).toBeInTheDocument();
    await act(async () => { fireEvent.click(within(offer()!).getByRole('button', { name: 'Discard my painting' })); });
    await waitFor(() => expect(hasUnsavedWork()).toBe(false));
    expect(reload()).toBe(false);
  });

  it('says why when the viewer is no longer the DM, and Discard drops it and its draft', async () => {
    await showMap();
    await paintOn();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    act(() => { h.set({ userRole: 'PLAYER' }); });
    await waitFor(() => expect(offer()).toBeInTheDocument());
    expect(within(offer()!).getByText(/You are no longer the DM, so your painting of Map A cannot be saved/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Paint' })).toBeNull();
    await act(async () => { fireEvent.click(within(offer()!).getByRole('button', { name: 'Discard my painting' })); });
    await waitFor(() => expect(offer()).toBeNull());
    expect(drafts().headers.size).toBe(0);
  });

  it('is not offered when everything was saved', async () => {
    await showMap();
    await paintOn();
    act(() => { h.set({ currentMap: mapWith({ id: 'map-b', name: 'Map B' }) }); });
    await act(async () => { await Promise.resolve(); });
    expect(offer()).toBeNull();
  });
});

/**
 * On the compact layout Paint is in the map's More, so the band stays one
 * row, and its tools are a strip at the map's foot (PaintStrip), the map
 * live above it: the stack has no Paint panel there. A tablet turned across
 * the layouts keeps the paint, since the map stays mounted.
 */
describe('on the compact layout', () => {
  function Table({ compact }: { compact: boolean }) {
    return <LayoutProvider compact={compact}><MapCanvas /></LayoutProvider>;
  }
  async function showCompact(map = mapWith()) {
    h.set({ currentMap: map });
    const view = render(<Table compact />);
    pictures[0]?.load();
    await act(async () => { await Promise.resolve(); });
    return view;
  }
  const band = () => screen.getByRole('group', { name: 'Map tools' });
  const moreSheet = () => screen.getByRole('dialog', { name: 'Map controls' });
  const pressRow = (label: string) => {
    if (!screen.queryByRole('dialog', { name: 'Map controls' })) fireEvent.click(screen.getByRole('button', { name: 'More map controls' }));
    fireEvent.click(within(moreSheet()).getByRole('button', { name: label }));
  };
  const strip = () => screen.queryByRole('region', { name: 'Paint' });

  it('offers Paint in More, not in the band, and opens its strip at the map\'s foot', async () => {
    await showCompact();
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: 'More map controls' }));
      expect(within(moreSheet()).getByRole('button', { name: 'Paint' })).toBeInTheDocument();
    });
    expect(within(band()).queryByRole('button', { name: 'Paint' })).toBeNull();
    pressRow('Paint');
    await waitFor(() => expect(strip()).toBeInTheDocument());
    expect(strip()!.closest('[data-map-dock]')).not.toBeNull();
    expect(strip()!.querySelector('[role="group"][aria-label="Tools"]')).not.toBeNull();
    // While it is on, More puts it away.
    pressRow('Put Paint away');
    await waitFor(() => expect(strip()).toBeNull());
  });

  it('paints with one finger under the strip, and Done in the strip puts it away, the paint kept', async () => {
    await showCompact();
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: 'More map controls' }));
      expect(within(moreSheet()).getByRole('button', { name: 'Paint' })).toBeInTheDocument();
    });
    pressRow('Paint');
    await waitFor(() => expect(strip()).toBeInTheDocument());
    const finger = contact('touch', 3);
    finger.down(input(), { clientX: 100, clientY: 100 });
    finger.move(input(), { clientX: 200, clientY: 140 });
    finger.move(input(), { clientX: 260, clientY: 160 });
    finger.up(input(), { clientX: 260, clientY: 160 });
    expect(strokesOn(pictureCanvas())).toHaveLength(1);
    fireEvent.click(within(strip()!).getByRole('button', { name: 'Done painting' }));
    await waitFor(() => expect(strip()).toBeNull());
    expect(usePaintStore.getState()).toMatchObject({ mapId: 'map-a', unsaved: true });
  });

  it('keeps the paint, the picture and Paint on as the layout changes, a tablet turned', async () => {
    const view = await showCompact();
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: 'More map controls' }));
      expect(within(moreSheet()).getByRole('button', { name: 'Paint' })).toBeInTheDocument();
    });
    pressRow('Paint');
    await waitFor(() => expect(strip()).toBeInTheDocument());
    const canvas = pictureCanvas();
    drag({ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 200 });
    view.rerender(<Table compact={false} />);
    expect(pictureCanvas()).toBe(canvas);
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Paint' }).closest('[data-map-dock]')).toBeNull();
    view.rerender(<Table compact />);
    expect(pictureCanvas()).toBe(canvas);
    expect(strip()!.closest('[data-map-dock]')).not.toBeNull();
    expect(usePaintStore.getState()).toMatchObject({ mapId: 'map-a', unsaved: true });
  });
});
