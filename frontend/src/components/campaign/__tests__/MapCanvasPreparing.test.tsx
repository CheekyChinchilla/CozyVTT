/**
 * The canvas on a map the GM is preparing while the table is on another.
 *
 * Everything the canvas sends, asks for and applies is for the map it shows,
 * the viewed map, and never the table's: a request or an edit that named the
 * table's map would change the players' map, and an event for the table's
 * map applied here would move a token of the map being prepared that shares
 * its id. The switches that write the map's own flags change the map being
 * prepared and leave the table where it is. Rolls from its tokens go to the
 * GM alone, and Player Preview, which records a player's explored memory, is
 * off there.
 *
 * The stand-ins are those of MapCanvasTools.test.tsx, with the context's two
 * maps held apart: `tableMap` is the table's and `viewedMap` the one on
 * screen.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, createEvent, within } from '@testing-library/react';
import type { CampaignMap, Token } from '@/types';
import { mouse } from '@/test/pointer';
import { CHARACTER_TOKEN_DRAG } from '@/utils/characterTokenDrag';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    tableMap: null as unknown,
    viewedMap: null as unknown,
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
  const set = (patch: Partial<typeof state>) => {
    Object.assign(state, patch);
    version += 1;
    listeners.forEach((l) => l());
  };
  const idOf = (map: unknown) => (map as { id?: string } | null)?.id;
  return {
    state,
    handlers,
    sent,
    raw,
    set,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    snapshot: () => version,
    // The page is preparing, so a map.changed for the table's map moves the
    // table's map alone, as the context does.
    receiveTableMap: vi.fn((map: unknown) => { set({ tableMap: map }); return false; }),
    setCurrentMap: vi.fn(),
    updateMap: vi.fn((mapId: string, next: unknown) => {
      const apply = (map: unknown) => (typeof next === 'function' ? (next as (m: unknown) => unknown)(map) : next);
      if (idOf(state.viewedMap) === mapId) set({ viewedMap: apply(state.viewedMap) });
      if (idOf(state.tableMap) === mapId) set({ tableMap: apply(state.tableMap) });
    }),
    updateToken: vi.fn().mockResolvedValue({}),
    deleteToken: vi.fn().mockResolvedValue({}),
    addToken: vi.fn(),
    updateMapRequest: vi.fn().mockResolvedValue({}),
  };
});

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/CampaignContext', async () => {
  const { useSyncExternalStore } = await import('react');
  const noop = () => undefined;
  const campaign = { id: 'campaign-1', name: 'Test', status: 'ACTIVE', spiritLayerEnabled: false, memberships: [], characters: [], gameSystem: 'FIFTH_EDITION' };
  return {
    useCampaign: () => {
      useSyncExternalStore(h.subscribe, h.snapshot);
      return {
        currentMap: h.state.tableMap,
        viewedMap: h.state.viewedMap,
        isPreparing: h.state.viewedMap !== h.state.tableMap,
        setCurrentMap: h.setCurrentMap,
        receiveTableMap: h.receiveTableMap,
        updateMap: h.updateMap,
        registerViewedMapGuard: () => () => undefined,
        userRole: 'GM',
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
    onMapChanged: (cb: (data: never) => void) => { h.raw.on('map.changed', cb); },
    onTokenMoved: (cb: (data: never) => void) => { h.raw.on('token.moved', cb); },
    onSpiritLayerTokenToggled: (cb: (data: never) => void) => { h.raw.on('spirit_layer.token.toggled', cb); },
    off: (event: string, cb: (data: never) => void) => { h.raw.off(event, cb); },
    emitTokenMoveStart: record('token.move.start'),
    emitTokenMove: record('token.move'),
    emitTokenMoveEnd: record('token.move.end'),
    requestDrawings: record('drawings:request'),
    emitMapPing: record('map.ping'),
    emitInitiativeAdd: record('initiative.add'),
    sendDrawingPreview: record('drawing:preview'),
    addDrawing: (payload: unknown) => { h.sent.push(['drawing:add', payload]); return Promise.resolve({ ok: true, id: 'stored-1' }); },
    rollDice: (roll: unknown) => { h.sent.push(['dice.roll', roll]); return Promise.resolve({ ok: true, id: 'roll-1' }); },
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
  default: { updateMap: h.updateMapRequest, getMaps: vi.fn().mockResolvedValue([]), getMap: vi.fn() },
}));

vi.mock('@/services/api', () => {
  const client = new Proxy({}, {
    get: (_target, prop: string) =>
      prop === 'updateToken' ? h.updateToken
      : prop === 'deleteToken' ? h.deleteToken
      : prop === 'addToken' ? h.addToken
      : vi.fn().mockResolvedValue({}),
  });
  return { api: client, default: client };
});

import MapCanvas from '../MapCanvas';
import { useGameStore } from '@/stores/gameStore';

function mapOf(id: string, extra: Partial<CampaignMap> = {}): CampaignMap {
  return {
    id, campaignId: 'campaign-1', name: id, imageUrl: '/api/assets/maps/x', width: 20, height: 20, gridSize: 50,
    tokens: [], wallSegments: [], lights: [], fogEnabled: true, lightingEnabled: true, globalIllumination: true,
    explorationEnabled: true, ...extra,
  } as unknown as CampaignMap;
}
const TABLE = mapOf('map-table');
const PREPARED = mapOf('map-prepared');

function token(id: string, x: number, y: number, extra: Partial<Token> = {}): Token {
  return {
    id, name: 'Lich', imageUrl: '', position: { x, y }, size: { width: 1, height: 1 },
    layer: 'token', visible: true, type: 'npc', conditions: [], ...extra,
  } as unknown as Token;
}

const px = (x: number, y: number) => ({ clientX: x, clientY: y });
/** The centre of square (x, y); grid y counts up from the bottom row. */
const square = (x: number, y: number) => px(x * 50 + 25, (19 - y) * 50 + 25);

function surface(): HTMLCanvasElement {
  const input = document.querySelector<HTMLCanvasElement>('canvas[class*="cursor-"]');
  if (!input) throw new Error('no input canvas');
  return input;
}
function click(p: { clientX: number; clientY: number }) {
  mouse.down(surface(), p, 0);
  mouse.up(surface(), p, 0);
}
function drag(from: { clientX: number; clientY: number }, to: { clientX: number; clientY: number }) {
  mouse.down(surface(), from, 0);
  mouse.move(surface(), to, 1);
  mouse.up(surface(), to, 0);
}
const sentOf = (event: string) => h.sent.filter(([e]) => e === event).map(([, p]) => p);
function fire(event: string, payload: unknown) {
  act(() => { h.handlers.get(event)?.forEach((fn) => (fn as (data: unknown) => void)(payload)); });
}
/** Tokens of the map on screen, as the page holds them once it has loaded. */
function show(...tokens: Token[]) {
  act(() => { useGameStore.getState().setTokens(tokens, (h.state.viewedMap as { id?: string } | null)?.id ?? null); });
}

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.sent.length = 0;
  h.handlers.clear();
  h.receiveTableMap.mockClear();
  h.setCurrentMap.mockClear();
  h.updateMap.mockClear();
  h.updateMapRequest.mockClear();
  h.updateToken.mockClear();
  h.deleteToken.mockClear();
  h.addToken.mockReset().mockImplementation((_c: string, _m: string, body: Partial<Token>) =>
    Promise.resolve({ token: { ...token('tok-new', 0, 0), ...body, id: 'tok-new' } }));
  act(() => { useGameStore.getState().clearGameState(); });
  h.set({ tableMap: TABLE, viewedMap: PREPARED });
});

/** What the GM does on the map, and the event it sends. */
const EDITS: Array<[string, string, () => void]> = [
  ['drawing a wall', 'wall:add', () => {
    fireEvent.click(screen.getByText('Walls'));
    fireEvent.click(screen.getByLabelText('Wall draw mode'));
    click(px(100, 100));
    click(px(200, 100));
  }],
  ['placing a light', 'light:add', () => {
    fireEvent.click(screen.getByText(/^Lights/));
    fireEvent.click(screen.getByText('Place'));
    click(px(260, 240));
  }],
  ['revealing fog', 'fog:operation', () => {
    fire('fog:updated', { mapId: 'map-prepared', fogState: { fogCols: 20, fogRows: 20, cellPx: 50, revealed: new Array(400).fill(false) } });
    fireEvent.click(screen.getByText('Fog of War'));
    fireEvent.click(screen.getByLabelText('Fog reveal box'));
    drag(px(60, 60), px(160, 110));
  }],
  ['picking up a token', 'token.move.start', () => { show(token('tok-lich', 0, 19)); click(square(0, 19)); }],
  ['carrying a token', 'token.move', () => {
    show(token('tok-lich', 0, 19));
    click(square(0, 19));
    mouse.move(surface(), square(3, 19), 0);
  }],
  ['putting a token down', 'token.move.end', () => {
    show(token('tok-lich', 0, 19));
    click(square(0, 19));
    mouse.move(surface(), square(3, 19), 0);
    click(square(3, 19));
  }],
];

/** The GM's choice from a token's menu, the token at square (0, 19). */
function fromMenu(item: string) {
  show(token('tok-lich', 0, 19));
  fireEvent.contextMenu(surface(), square(0, 19));
  fireEvent.click(screen.getByText(item));
}

/** What the GM does on the map that goes over REST, and the request it sends: its map id is the second argument. */
const REQUESTS: Array<[string, () => ReturnType<typeof vi.fn>, () => Promise<void> | void]> = [
  ['hiding a token', () => h.updateToken, () => fromMenu('Hide from Players')],
  ['obscuring a token', () => h.updateToken, () => fromMenu('Obscure Identity')],
  ['turning a token', () => h.updateToken, () => fromMenu('Rotate Right')],
  ['duplicating a token', () => h.addToken, () => fromMenu('Duplicate Token')],
  ['removing a token', () => h.deleteToken, async () => {
    fromMenu('Remove from Map');
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Remove/ })); });
  }],
  ['dropping a character on the map', () => h.addToken, async () => {
    const dataTransfer = {
      getData: () => JSON.stringify({ type: CHARACTER_TOKEN_DRAG, characterId: 'char-1', name: 'Brannoc', imageUrl: '', userId: 'alice' }),
      dropEffect: 'none',
    };
    const event = createEvent.drop(surface(), { dataTransfer, clientX: 25, clientY: 25 });
    await act(async () => { fireEvent(surface(), event); });
  }],
];

describe('on a map being prepared', () => {
  it.each(REQUESTS)('%s names the map being prepared', async (_what, request, act) => {
    render(<MapCanvas />);
    await act();
    expect(request()).toHaveBeenCalled();
    expect(request().mock.calls.map((call) => call[1])).toEqual(request().mock.calls.map(() => 'map-prepared'));
  });

  it('pinging names the map being prepared', () => {
    render(<MapCanvas />);
    click(px(500, 500));
    mouse.move(surface(), px(500, 500), 0);
    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(sentOf('map.ping')).toEqual([expect.objectContaining({ mapId: 'map-prepared' })]);
  });

  it('adding a token to the initiative order names the map being prepared', () => {
    render(<MapCanvas />);
    fromMenu('Add to Initiative');
    expect(sentOf('initiative.add')).toEqual([{ tokenId: 'tok-lich', mapId: 'map-prepared' }]);
  });

  it('drawing names the map being prepared, the stroke on its way included', async () => {
    render(<MapCanvas />);
    fireEvent.click(screen.getByRole('button', { name: 'Draw' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Drawing tools' })).getByRole('button', { name: 'Pen' }));
    mouse.down(surface(), px(100, 100), 0);
    mouse.move(surface(), px(200, 150), 1);
    mouse.move(surface(), px(300, 200), 1);
    await act(async () => { mouse.up(surface(), px(300, 200), 0); });
    const added = sentOf('drawing:add') as Array<{ mapId: string }>;
    const previews = sentOf('drawing:preview') as Array<{ mapId: string }>;
    expect(added.map((p) => p.mapId)).toEqual(['map-prepared']);
    expect(previews.length).toBeGreaterThan(0);
    expect(previews.every((p) => p.mapId === 'map-prepared')).toBe(true);
  });

  it.each(['walls:request', 'lights:request', 'fog:request_state', 'drawings:request'])(
    'asks for its own %s', (request) => {
      render(<MapCanvas />);
      const asked = sentOf(request) as Array<{ mapId: string }>;
      expect(asked.length).toBeGreaterThan(0);
      expect(asked.every((p) => p.mapId === 'map-prepared')).toBe(true);
    }
  );

  it.each(EDITS)('%s names the map being prepared', (_what, event, act) => {
    render(<MapCanvas />);
    act();
    const payloads = sentOf(event) as Array<{ mapId: string }>;
    expect(payloads.length).toBeGreaterThan(0);
    expect(payloads.map((p) => p.mapId)).toEqual(payloads.map(() => 'map-prepared'));
  });

  it("switching fog on changes that map and leaves the table's", async () => {
    h.set({ viewedMap: mapOf('map-prepared', { fogEnabled: false }) });
    render(<MapCanvas />);
    fireEvent.click(screen.getByText('Fog of War'));
    await act(async () => { fireEvent.click(screen.getByLabelText('Fog of war on this map')); });
    expect(h.updateMapRequest).toHaveBeenCalledWith('campaign-1', 'map-prepared', { fogEnabled: true });
    expect((h.state.viewedMap as CampaignMap).fogEnabled).toBe(true);
    expect(h.state.tableMap).toBe(TABLE);
    expect(h.setCurrentMap).not.toHaveBeenCalled();
  });

  it("switching Global Illumination changes that map and leaves the table's", async () => {
    render(<MapCanvas />);
    fireEvent.click(screen.getByText(/^Lights/));
    await act(async () => { fireEvent.click(screen.getByLabelText('Global Illumination')); });
    expect(h.updateMapRequest).toHaveBeenCalledWith('campaign-1', 'map-prepared', { globalIllumination: false });
    expect(h.state.tableMap).toBe(TABLE);
    expect(h.setCurrentMap).not.toHaveBeenCalled();
  });

  it("does not apply a move on the table's map to a token of the same id", () => {
    render(<MapCanvas />);
    show(token('tok-lich', 1, 1));
    fire('token.moved', { tokenId: 'tok-lich', mapId: 'map-table', x: 7, y: 7, movedBy: 'someone' });
    expect(useGameStore.getState().tokens['tok-lich'].position).toEqual({ x: 1, y: 1 });
    fire('token.moved', { tokenId: 'tok-lich', mapId: 'map-prepared', x: 7, y: 7, movedBy: 'someone' });
    expect(useGameStore.getState().tokens['tok-lich'].position).toEqual({ x: 7, y: 7 });
  });

  it('keeps a drop, and no drag frame, for a read of the map on screen still out', () => {
    render(<MapCanvas />);
    show(token('tok-lich', 1, 1));
    act(() => { useGameStore.getState().expectTokensOf('map-prepared'); });
    fire('token.moved', { tokenId: 'tok-lich', mapId: 'map-prepared', x: 3, y: 3, movedBy: 'someone', dragging: true });
    expect(useGameStore.getState().heldTokenEvents).toHaveLength(0);
    fire('token.moved', { tokenId: 'tok-lich', mapId: 'map-prepared', x: 4, y: 4, movedBy: 'someone' });
    expect(useGameStore.getState().heldTokenEvents).toHaveLength(1);
    expect(useGameStore.getState().tokens['tok-lich'].position).toEqual({ x: 4, y: 4 });
  });

  it("does not apply a spirit-layer toggle on another map to a token of the same id", () => {
    render(<MapCanvas />);
    show(token('tok-lich', 1, 1, { visible: false }));
    fire('spirit_layer.token.toggled', { mapId: 'map-table', tokenId: 'tok-lich', visible: true, toggledBy: 'dm', timestamp: '' });
    expect(useGameStore.getState().tokens['tok-lich'].visible).toBe(false);
  });

  it("hands a map.changed to the context, and keeps its own map's tokens", () => {
    render(<MapCanvas />);
    show(token('tok-lich', 1, 1));
    const moved = mapOf('map-table', { tokens: [token('tok-hero', 4, 4)] });
    fire('map.changed', { mapId: 'map-table', mapData: moved });
    expect(h.receiveTableMap).toHaveBeenCalledWith(moved);
    expect(Object.keys(useGameStore.getState().tokens)).toEqual(['tok-lich']);
  });

  it('offers no Player Preview, and says why', () => {
    render(<MapCanvas />);
    const button = screen.getByRole('button', { name: 'Preview Player View' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Preview Player View is off while you prepare a map the table is not on');
    // Said in words too: a touch screen shows no title.
    expect(screen.getByText('Off while you prepare a map')).toBeInTheDocument();
  });

  it("rolls from a token's Roll... for the GM alone", async () => {
    render(<MapCanvas />);
    show(token('tok-lich', 0, 19));
    fireEvent.contextMenu(surface(), square(0, 19));
    fireEvent.click(screen.getByText('Roll...'));
    fireEvent.change(screen.getByPlaceholderText('e.g. 2d6+3'), { target: { value: '1d20' } });
    await act(async () => { fireEvent.click(screen.getByTitle('Roll')); });
    expect(sentOf('dice.roll')).toEqual([expect.objectContaining({ expression: '1d20', secret: true })]);
  });
});

describe("on the table's map", () => {
  beforeEach(() => { h.set({ tableMap: TABLE, viewedMap: TABLE }); });

  it("rolls from a token's Roll... for the whole table, as before", async () => {
    render(<MapCanvas />);
    show(token('tok-lich', 0, 19));
    fireEvent.contextMenu(surface(), square(0, 19));
    fireEvent.click(screen.getByText('Roll...'));
    fireEvent.change(screen.getByPlaceholderText('e.g. 2d6+3'), { target: { value: '1d20' } });
    await act(async () => { fireEvent.click(screen.getByTitle('Roll')); });
    const [roll] = sentOf('dice.roll') as Array<{ secret?: boolean }>;
    expect(roll.secret).toBeUndefined();
  });

  it('offers Player Preview', () => {
    render(<MapCanvas />);
    expect(screen.getByRole('button', { name: 'Preview Player View' })).toBeEnabled();
  });
});
