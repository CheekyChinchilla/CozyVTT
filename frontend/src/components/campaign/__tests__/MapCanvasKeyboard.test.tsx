/**
 * The selected token and the keys that act on it, driven through MapCanvas:
 * what a click selects, the arrows, the turn keys, stepping through tokens,
 * Enter's menu, Escape's order, where keys belong to the map, and Follow my
 * selection in Player Preview.
 *
 * The stand-ins are those of MapCanvasInput.test.tsx and
 * MapCanvasEditing.test.tsx, with the session's status and the members kept
 * in the store the test changes: the socket records what the page sends and
 * delivers server events to the listeners the page registered. Canvas drawing
 * is switched off, so the view starts at 100% with no pan: screen pixel (x, y)
 * is map pixel (x, y), and a square is 50 pixels.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, createEvent } from '@testing-library/react';
import { TokenLayer, TokenType, type CampaignMap, type Token } from '@/types';
import { mouse, contact } from '@/test/pointer';

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
  const updateToken = vi.fn();
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
  const setCurrentMap = (next: unknown) => {
    h.set({ currentMap: typeof next === 'function' ? (next as (p: unknown) => unknown)(h.state.currentMap) : next });
  };
  const noop = () => undefined;
  const campaign = {
    id: 'campaign-1', name: 'Test', spiritLayerEnabled: false,
    get characters() { return h.state.characters; },
    get status() { return h.state.status; },
    get memberships() { return h.state.memberships; },
  };
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
    emitTokenMoveStart: record('token.move.start'),
    emitTokenMove: record('token.move'),
    emitTokenMoveEnd: record('token.move.end'),
    emitMapPing: record('map.ping'),
    onMapChanged: (cb: (data: never) => void) => { h.raw.on('map.changed', cb); },
    onTokenMoved: (cb: (data: never) => void) => { h.raw.on('token.moved', cb); },
    onServerRefusal: (cb: (data: never) => void) => { h.raw.on('error', cb); },
    off: (event: string, cb: (data: never) => void) => { h.raw.off(event, cb); },
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
  default: { updateMap: vi.fn(), getMaps: vi.fn().mockResolvedValue([]), getMap: vi.fn() },
}));

vi.mock('@/services/api', () => {
  const client = new Proxy({}, {
    get: (_target, prop: string) => (prop === 'updateToken' ? h.updateToken : vi.fn().mockResolvedValue({})),
  });
  return { api: client, default: client };
});

import MapCanvas from '../MapCanvas';
import { useGameStore } from '@/stores/gameStore';

function mapNamed(id: string, extra: Partial<CampaignMap> = {}): CampaignMap {
  return {
    id,
    campaignId: 'campaign-1',
    name: `Map ${id}`,
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
    id, name, imageUrl: '', characterId: null, position: { x, y }, size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN, visible: true, type: TokenType.NPC, conditions: [], rotation: 0, controlledBy: null, ...extra,
  } as unknown as Token;
}

const goblin = () => token('tok-goblin', 'Goblin Scout', 0, 19);
const wolf = () => token('tok-wolf', 'Wolf', 4, 19);
const mine = (x = 2, y = 10) => token('tok-mine', 'Aldra', x, y, { type: TokenType.PLAYER, controlledBy: 'me' });

/** The centre of square (x, y) on screen, at 100% and no pan. */
const at = (x: number, y: number) => ({ clientX: x * 50 + 10, clientY: (19 - y) * 50 + 10 });

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

/** Deliver a server event to every listener the page registered for it. */
function fire(event: string, payload: unknown) {
  act(() => {
    h.handlers.get(event)?.forEach((fn) => (fn as (data: unknown) => void)(payload));
  });
}

function click(point: { clientX: number; clientY: number }) {
  mouse.down(surface(), point);
  mouse.up(surface(), point);
}

const selected = () => useGameStore.getState().selectedTokenId;
const announced = () => screen.getByRole('status').textContent;

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.sent.length = 0;
  h.handlers.clear();
  h.updateToken.mockReset().mockResolvedValue({});
  act(() => {
    useGameStore.getState().clearGameState();
  });
  h.set({ userRole: 'DM', status: 'ACTIVE', memberships: [], characters: [], currentMap: mapNamed('map-a') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('what a click selects', () => {
  it('picks up a token you may move, as before, and selects it too', () => {
    render(<MapCanvas />);
    show(goblin());

    click(at(0, 19));

    expect(sentOf('token.move.start')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a' }]);
    expect(selected()).toBe('tok-goblin');
    expect(announced()).toBe('Selected Goblin Scout, square 0, 19');
  });

  it('only selects a token you may not move', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(goblin(), mine());

    click(at(0, 19));

    expect(sentOf('token.move.start')).toEqual([]);
    expect(selected()).toBe('tok-goblin');
  });

  it('keeps the token selected where it is put down, and says the new square', () => {
    render(<MapCanvas />);
    show(goblin());

    click(at(0, 19));
    mouse.move(surface(), at(3, 17));
    click(at(3, 17));

    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 3, y: 17 }]);
    expect(selected()).toBe('tok-goblin');
    expect(announced()).toBe('Selected Goblin Scout, square 3, 17');
  });

  it('clears the selection on a click on empty ground', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(goblin());
    click(at(0, 19));

    click(at(10, 10));

    expect(selected()).toBeNull();
    expect(announced()).toBe('');
  });

  it('keeps the selection while the map is dragged about', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(goblin());
    click(at(0, 19));

    mouse.down(surface(), at(10, 10));
    mouse.move(surface(), { clientX: 560, clientY: 510 }, 1);
    mouse.up(surface(), { clientX: 560, clientY: 510 });

    expect(selected()).toBe('tok-goblin');
  });

  it('selects the token a right-click opens the menu of', () => {
    render(<MapCanvas />);
    show(goblin(), wolf());

    fireEvent.contextMenu(surface(), at(4, 19));

    expect(screen.getByText('Remove from Map')).toBeInTheDocument();
    expect(selected()).toBe('tok-wolf');
  });

  it('selects a token tapped on a touch screen, and leaves the selection alone on a drag', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(goblin(), wolf());
    const finger = contact('touch', 7);

    finger.down(surface(), at(4, 19));
    finger.up(surface(), at(4, 19));
    expect(selected()).toBe('tok-wolf');

    // A drag that starts on the goblin pans the map and selects nothing.
    finger.down(surface(), at(0, 19));
    finger.move(surface(), at(3, 15));
    finger.move(surface(), at(5, 12));
    finger.up(surface(), at(5, 12));
    expect(selected()).toBe('tok-wolf');
  });

  it('leaves the selection as it is while a DM tool takes the click', () => {
    render(<MapCanvas />);
    show(goblin(), wolf());
    fireEvent.contextMenu(surface(), at(4, 19));
    fireEvent.click(document.body);

    fireEvent.click(screen.getByText('Walls'));
    fireEvent.click(screen.getByLabelText('Wall draw mode'));
    click(at(0, 19));

    expect(sentOf('token.move.start')).toEqual([]);
    expect(selected()).toBe('tok-wolf');
  });
});

/**
 * In Player Preview the DM's canvas shows what the previewed viewer is sent,
 * so a click selects only what the preview draws: a selection there decides
 * what Follow my selection puts on a shared screen.
 */
describe('selecting in Player Preview', () => {
  const alya = () => token('tok-a', 'Alya', 2, 10, { type: TokenType.PLAYER, controlledBy: 'alice' });
  const lurker = () => token('tok-h', 'Lurker', 3, 10, { visible: false });

  beforeEach(() => {
    h.set({
      currentMap: mapNamed('map-a', { lightingEnabled: true, globalIllumination: true }),
      memberships: [{ userId: 'alice', role: 'PLAYER', user: { displayName: 'Alice' } }],
    });
  });

  const previewAsAlice = () => fireEvent.click(screen.getByLabelText('Toggle DM player view preview'));

  it('selects nothing the preview does not draw, by a click or a right-click', () => {
    render(<MapCanvas />);
    show(alya(), lurker());
    previewAsAlice();

    click(at(3, 10));
    expect(selected()).toBeNull();
    fireEvent.contextMenu(surface(), at(3, 10));
    expect(selected()).toBeNull();
    fireEvent.click(document.body);

    click(at(2, 10));
    expect(selected()).toBe('tok-a');
  });

  it('picks up only a token the preview draws, and drags the view on any other square', () => {
    render(<MapCanvas />);
    show(alya(), lurker());
    previewAsAlice();

    click(at(3, 10));
    expect(sentOf('token.move.start')).toEqual([]);
    // Nothing is held, so the next click picks Alya up.
    click(at(2, 10));
    expect(sentOf('token.move.start')).toEqual([{ tokenId: 'tok-a', mapId: 'map-a' }]);
  });

  it('says nothing of a selected token the preview does not draw', () => {
    render(<MapCanvas />);
    show(alya(), lurker());
    act(() => { useGameStore.getState().selectToken('tok-h'); });
    expect(announced()).toBe('Selected Lurker, square 3, 10');

    previewAsAlice();

    expect(announced()).toBe('');
  });
});

describe('the selection and the map', () => {
  it('survives the map being sent again with the token on it', () => {
    render(<MapCanvas />);
    show(goblin(), wolf());
    fireEvent.contextMenu(surface(), at(4, 19));

    fire('map.changed', { mapId: 'map-a', mapData: mapNamed('map-a', { tokens: [goblin(), { ...wolf(), rotation: 45 }] }) });

    expect(selected()).toBe('tok-wolf');
  });

  it('goes when the map is sent again without the token', () => {
    render(<MapCanvas />);
    show(goblin(), wolf());
    fireEvent.contextMenu(surface(), at(4, 19));

    fire('map.changed', { mapId: 'map-a', mapData: mapNamed('map-a', { tokens: [goblin()] }) });

    expect(selected()).toBeNull();
  });

  it('goes when the table switches to another map', () => {
    render(<MapCanvas />);
    show(goblin(), wolf());
    fireEvent.contextMenu(surface(), at(4, 19));

    // The same token id on the next map is still a fresh start there.
    fire('map.changed', { mapId: 'map-b', mapData: mapNamed('map-b', { tokens: [wolf()] }) });

    expect(selected()).toBeNull();
  });

  it('goes when its token leaves the player\'s sight', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(goblin(), mine());
    click(at(0, 19));

    fire('token:disappeared', { tokenId: 'tok-goblin', mapId: 'map-a' });

    expect(selected()).toBeNull();
  });
});

describe('an Escape something else on the page used', () => {
  it('closes the creature roll picker and leaves the area template up', () => {
    render(<MapCanvas />);
    show(goblin());
    fireEvent.click(screen.getByTitle('AoE Shape — area of effect overlay'));
    fireEvent.contextMenu(surface(), at(0, 19));
    fireEvent.click(screen.getByText('Roll...'));
    expect(screen.getByPlaceholderText('e.g. 2d6+3')).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(screen.queryByPlaceholderText('e.g. 2d6+3')).not.toBeInTheDocument();
    expect(screen.getByText('AoE Shape')).toBeInTheDocument();
  });

  it('leaves a held token held', () => {
    render(<MapCanvas />);
    show(goblin());
    click(at(0, 19));
    const usesEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') e.preventDefault(); };
    document.addEventListener('keydown', usesEscape);
    try {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    } finally {
      document.removeEventListener('keydown', usesEscape);
    }

    expect(sentOf('token.move')).toEqual([]);
    click(at(2, 19));
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 2, y: 19 }]);
  });
});

/** A key pressed on the map, as after a click on it: the map's focus stop has the keyboard. */
function press(key: string, opts: { shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; repeat?: boolean } = {}) {
  const map = theMap();
  if (document.activeElement !== map) map.focus();
  return fireEvent.keyDown(map, { key, ...opts });
}

/** A key pressed with `el` focused; whether something on the page used it. */
function pressOn(el: Element, key: string, opts: { repeat?: boolean } = {}): boolean {
  const event = createEvent.keyDown(el, { key, ...opts });
  fireEvent(el, event);
  return event.defaultPrevented;
}

function select(id: string) {
  act(() => { useGameStore.getState().selectToken(id); });
}

const positionOf = (id: string) => useGameStore.getState().tokens[id].position;
const rotationOf = (id: string) => useGameStore.getState().tokens[id].rotation;
const theMap = () => screen.getByRole('application', { name: 'Map' });

describe('the arrow keys', () => {
  it('move the selected token a square, with a pick-up and a drop as a click would send', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 5, 10));
    select('tok-goblin');

    press('ArrowRight');

    expect(sentOf('token.move.start')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a' }]);
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 6, y: 10 }]);
    expect(positionOf('tok-goblin')).toEqual({ x: 6, y: 10 });
    expect(announced()).toBe('Selected Goblin Scout, square 6, 10');
  });

  it('move it five squares with Shift, up towards the top of the map', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 5, 10));
    select('tok-goblin');

    press('ArrowUp', { shiftKey: true });

    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 5, y: 15 }]);
  });

  it('end the hold of a token picked up by a click one square over from where it stood', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 5, 10));
    click(at(5, 10));
    mouse.move(surface(), at(9, 4));

    press('ArrowLeft');

    expect(sentOf('token.move.start')).toHaveLength(1);
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 4, y: 10 }]);
    // Nothing is held now, so the next click puts nothing down.
    click(at(12, 12));
    expect(sentOf('token.move.end')).toHaveLength(1);
  });

  it('keep a large token whole on the map, and send nothing when it is already at the edge', () => {
    render(<MapCanvas />);
    show(token('tok-ogre', 'Ogre', 17, 3, { size: { width: 2, height: 2 } }));
    select('tok-ogre');

    press('ArrowRight', { shiftKey: true });
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-ogre', mapId: 'map-a', x: 18, y: 3 }]);

    press('ArrowRight');
    expect(sentOf('token.move.end')).toHaveLength(1);
    expect(sentOf('token.move.start')).toHaveLength(1);
  });

  it("move a player's own token while the session is live", () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(mine(2, 10));
    select('tok-mine');

    press('ArrowDown');

    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-mine', mapId: 'map-a', x: 2, y: 9 }]);
  });

  it.each(['PAUSED', 'INACTIVE'])("send nothing for a player's token while the session is %s", (status) => {
    h.set({ userRole: 'PLAYER', status });
    render(<MapCanvas />);
    show(mine(2, 10));
    click(at(2, 10));
    expect(selected()).toBe('tok-mine');

    press('ArrowDown');

    expect(sentOf('token.move.start')).toEqual([]);
    expect(sentOf('token.move.end')).toEqual([]);
  });

  it('send nothing for a token the player does not control', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(goblin(), mine());
    click(at(0, 19));

    press('ArrowDown');

    expect(sentOf('token.move.end')).toEqual([]);
  });

  it("refuse a player's move onto a square another creature stands on, as a click does", async () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(mine(2, 10), token('tok-wolf', 'Wolf', 3, 10));
    select('tok-mine');

    press('ArrowRight');

    expect(await screen.findByText('Wolf is already standing there.')).toBeInTheDocument();
    expect(sentOf('token.move.start')).toEqual([]);
    expect(sentOf('token.move.end')).toEqual([]);
    expect(positionOf('tok-mine')).toEqual({ x: 2, y: 10 });
  });

  it('show the token back where it was when the server puts it back', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(mine(2, 10));
    select('tok-mine');
    press('ArrowRight');
    expect(positionOf('tok-mine')).toEqual({ x: 3, y: 10 });

    // The drop was refused (the DM paused in between): the server says where it is.
    fire('token.moved', { tokenId: 'tok-mine', mapId: 'map-a', x: 2, y: 10, movedBy: null });

    expect(positionOf('tok-mine')).toEqual({ x: 2, y: 10 });
  });

  it('nudge the walls while the wall select tool holds some, and leave the token alone', () => {
    h.set({ currentMap: mapNamed('map-a', { wallSegments: [{ id: 'w1', x1: 100, y1: 100, x2: 200, y2: 100, type: 'wall' }] }) });
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 5, 10));
    select('tok-goblin');
    fireEvent.click(screen.getByText('Walls'));
    fireEvent.click(screen.getByLabelText('Wall select mode'));
    press('a', { ctrlKey: true });

    press('ArrowRight');

    expect(sentOf('token.move.end')).toEqual([]);
    expect(sentOf('walls:replace').length + sentOf('wall:update').length).toBeGreaterThan(0);
  });

  it('send a bounded number of moves while one is held down', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T12:00:00Z'));
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 0, 10));
    select('tok-goblin');

    // A second of key repeat, about 30 a second.
    press('ArrowRight');
    for (let i = 0; i < 30; i++) {
      vi.setSystemTime(Date.now() + 33);
      press('ArrowRight', { repeat: true });
    }

    const drops = sentOf('token.move.end').length;
    expect(drops).toBeGreaterThan(1);
    expect(drops).toBeLessThanOrEqual(9);
    expect(positionOf('tok-goblin')).toEqual({ x: drops, y: 10 });
  });
});

describe('the turn keys', () => {
  it('turn the selected token 45 degrees clockwise with ], and anticlockwise with [', async () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 5, 10));
    select('tok-goblin');

    await act(async () => { press(']'); });
    expect(h.updateToken).toHaveBeenLastCalledWith('campaign-1', 'map-a', 'tok-goblin', { rotation: 45 });
    await act(async () => { press('['); });
    await act(async () => { press('['); });
    expect(h.updateToken).toHaveBeenLastCalledWith('campaign-1', 'map-a', 'tok-goblin', { rotation: 315 });
    expect(rotationOf('tok-goblin')).toBe(315);
  });

  it('turn a token while it is held', async () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 5, 10));
    click(at(5, 10));

    await act(async () => { press(']'); });

    expect(h.updateToken).toHaveBeenCalledWith('campaign-1', 'map-a', 'tok-goblin', { rotation: 45 });
    expect(sentOf('token.move.end')).toEqual([]);
  });

  it('turn once for a key held down', async () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 5, 10));
    select('tok-goblin');

    await act(async () => {
      press(']');
      for (let i = 0; i < 10; i++) press(']', { repeat: true });
    });

    expect(h.updateToken).toHaveBeenCalledTimes(1);
  });

  it("turn a player's own token, and never one they do not control", async () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(goblin(), mine());
    select('tok-mine');
    await act(async () => { press(']'); });
    expect(h.updateToken).toHaveBeenCalledWith('campaign-1', 'map-a', 'tok-mine', { rotation: 45 });

    click(at(0, 19));
    await act(async () => { press(']'); });
    expect(h.updateToken).toHaveBeenCalledTimes(1);
  });
});

describe('stepping through tokens with , and .', () => {
  const row = () => [token('c', 'Cultist', 8, 12), token('a', 'Archer', 1, 15), token('b', 'Bandit', 6, 15)];

  it('selects the tokens by row from the top, then by column, wrapping round', () => {
    render(<MapCanvas />);
    show(...row());

    press('.');
    expect(selected()).toBe('a');
    press('.');
    expect(selected()).toBe('b');
    press('.');
    expect(selected()).toBe('c');
    press('.');
    expect(selected()).toBe('a');
    press(',');
    expect(selected()).toBe('c');
  });

  it('takes < and >, the same keys with Shift on a US keyboard', () => {
    render(<MapCanvas />);
    show(...row());

    press('>', { shiftKey: true });
    press('>', { shiftKey: true });
    expect(selected()).toBe('b');
    press('<', { shiftKey: true });
    expect(selected()).toBe('a');
  });

  it('follows the turn order during a fight', () => {
    render(<MapCanvas />);
    show(...row());
    act(() => {
      useGameStore.getState().setCombatState({
        active: true, round: 1, currentTokenId: 'c',
        combatants: ['c', 'b'].map((tokenId) => ({ tokenId, mapId: 'map-a', name: tokenId, imageUrl: '', initiative: 12, hp: null, type: 'npc' as const, disposition: null })),
      });
    });

    press('.');
    expect(selected()).toBe('c');
    press('.');
    expect(selected()).toBe('b');
    press('.');
    expect(selected()).toBe('a');
  });

  it("steps a player through their own tokens only, paused or not", () => {
    h.set({ userRole: 'PLAYER', status: 'PAUSED' });
    render(<MapCanvas />);
    show(...row(), mine(2, 3), token('tok-pet', 'Hound', 9, 9, { controlledBy: 'me' }));

    press('.');
    expect(selected()).toBe('tok-pet');
    press('.');
    expect(selected()).toBe('tok-mine');
    press('.');
    expect(selected()).toBe('tok-pet');
  });

  it('steps once for a key held down', () => {
    render(<MapCanvas />);
    show(...row());

    press('.');
    for (let i = 0; i < 5; i++) press('.', { repeat: true });

    expect(selected()).toBe('a');
  });

  describe('on a map wider than the view', () => {
    const originalRect = HTMLDivElement.prototype.getBoundingClientRect;
    beforeEach(() => {
      HTMLDivElement.prototype.getBoundingClientRect = () =>
        ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    });
    afterEach(() => {
      HTMLDivElement.prototype.getBoundingClientRect = originalRect;
    });

    it('pans the view to keep the selected token in sight', () => {
      render(<MapCanvas />);
      // Square (18, 10) has its centre at x 925 on the map, past the view's right edge at 800.
      show(token('far', 'Far Scout', 18, 10));

      press('.');

      // Panned left until the centre is one square inside the edge, at 750.
      mouse.move(surface(), { clientX: 750, clientY: 475 });
      expect(screen.getByText('Far Scout')).toBeInTheDocument();
      expect(screen.getByText('(18, 10)')).toBeInTheDocument();
    });
  });
});

describe('Enter', () => {
  it("opens the selected token's menu at the token, with the cursor on its first item", async () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 2, 18));
    select('tok-goblin');

    await act(async () => { press('Enter'); });

    const first = screen.getByText('Rotate Left');
    const menu = first.parentElement as HTMLElement;
    // The token's centre: x 2.5 squares, and 1.5 squares down from the top.
    expect(menu.style.left).toBe('125px');
    expect(menu.style.top).toBe('75px');
    expect(document.activeElement).toBe(first);
  });

  it('does not press the first item when Enter is held down', async () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 2, 18));
    select('tok-goblin');
    await act(async () => { press('Enter'); });
    const first = screen.getByText('Rotate Left');

    expect(pressOn(first, 'Enter', { repeat: true })).toBe(true);
    expect(pressOn(first, 'Enter')).toBe(false);
  });

  it('opens nothing for a token whose menu would be empty', async () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(goblin(), mine());
    click(at(0, 19));

    await act(async () => { press('Enter'); });

    expect(screen.queryByText('Rotate Left')).not.toBeInTheDocument();
  });

  it('closes on Escape and hands the keys back to the map', async () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 2, 18));
    select('tok-goblin');
    await act(async () => { press('Enter'); });

    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });

    expect(screen.queryByText('Rotate Left')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(theMap());
    expect(selected()).toBe('tok-goblin');
  });
});

describe('Enter on a token out of sight', () => {
  const page = { left: 100, top: 50, width: 800, height: 600 };
  const rectOf = (r: { left: number; top: number; width: number; height: number }) =>
    ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}) }) as DOMRect;
  const originalDiv = HTMLDivElement.prototype.getBoundingClientRect;
  const originalCanvas = HTMLCanvasElement.prototype.getBoundingClientRect;
  beforeEach(() => {
    // The map's container and canvases sit beside the sidebar and under the header; the menu is 160 by 240.
    HTMLDivElement.prototype.getBoundingClientRect = function (this: HTMLDivElement) {
      return this.querySelector('canvas') ? rectOf(page) : rectOf({ left: 0, top: 0, width: 160, height: 240 });
    };
    HTMLCanvasElement.prototype.getBoundingClientRect = () => rectOf(page);
  });
  afterEach(() => {
    HTMLDivElement.prototype.getBoundingClientRect = originalDiv;
    HTMLCanvasElement.prototype.getBoundingClientRect = originalCanvas;
  });

  /** Drag empty ground by (dx, dy), in page pixels. */
  function dragMap(dx: number, dy: number) {
    const from = { clientX: page.left + 700, clientY: page.top + 500 };
    mouse.down(surface(), from);
    mouse.move(surface(), { clientX: from.clientX + dx, clientY: from.clientY + dy }, 1);
    mouse.up(surface(), { clientX: from.clientX + dx, clientY: from.clientY + dy });
  }

  const menuAt = () => {
    const menu = screen.getByText('Rotate Left').parentElement as HTMLElement;
    return { left: parseFloat(menu.style.left), top: parseFloat(menu.style.top) };
  };

  it('pans a token off the left and the top of the view back into it, and opens the menu inside the map', async () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 0, 19));
    select('tok-goblin');
    dragMap(-300, -300);

    await act(async () => { press('Enter'); });

    const { left, top } = menuAt();
    expect(left).toBeGreaterThanOrEqual(page.left);
    expect(top).toBeGreaterThanOrEqual(page.top);
    expect(left).toBeLessThanOrEqual(page.left + page.width - 160);
    expect(top).toBeLessThanOrEqual(page.top + page.height - 240);
    // The token's centre came to one square inside the corner.
    expect([left, top]).toEqual([page.left + 50, page.top + 50]);
  });

  it('holds the menu inside the map at its right and bottom edges', async () => {
    render(<MapCanvas />);
    // Square (15, 8) has its centre at (775, 575) in the map, inside the view by less than the menu's size.
    show(token('tok-goblin', 'Goblin Scout', 15, 8));
    select('tok-goblin');

    await act(async () => { press('Enter'); });

    const { left, top } = menuAt();
    expect(left).toBeLessThanOrEqual(page.left + page.width - 160);
    expect(top).toBeLessThanOrEqual(page.top + page.height - 240);
  });

  it('pans a token an arrow walks out of the view back into it', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 14, 10));
    select('tok-goblin');

    press('ArrowRight', { shiftKey: true });

    // Square 19's centre, x 975 on the map, is panned to one square inside the right edge.
    mouse.move(surface(), { clientX: page.left + 750, clientY: page.top + 475 });
    expect(screen.getByText('(19, 10)')).toBeInTheDocument();
  });
});

describe('Escape', () => {
  it('lets go of one thing a press: the menu, the held token, the tool, then the selection', async () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 2, 18));
    click(at(2, 18));
    mouse.move(surface(), at(6, 14));
    fireEvent.click(screen.getByTitle('AoE Shape — area of effect overlay'));
    await act(async () => { press('Enter'); });
    expect(screen.getByText('Rotate Left')).toBeInTheDocument();

    press('Escape');
    expect(screen.queryByText('Rotate Left')).not.toBeInTheDocument();
    expect(sentOf('token.move')).toHaveLength(1); // the frame to (6, 14) only

    press('Escape');
    expect(sentOf('token.move').slice(-1)[0]).toEqual({ tokenId: 'tok-goblin', mapId: 'map-a', x: 2, y: 18 });
    expect(screen.getByText('AoE Shape')).toBeInTheDocument();

    press('Escape');
    expect(screen.queryByText('AoE Shape')).not.toBeInTheDocument();
    expect(selected()).toBe('tok-goblin');

    press('Escape');
    expect(selected()).toBeNull();
  });
});

describe('where the token keys apply', () => {
  it('nowhere while typing in a text box', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 5, 10));
    select('tok-goblin');
    const chat = document.createElement('textarea');
    document.body.append(chat);
    chat.focus();

    expect(pressOn(chat, 'ArrowRight')).toBe(false);
    expect(pressOn(chat, '.')).toBe(false);

    expect(sentOf('token.move.end')).toEqual([]);
    expect(selected()).toBe('tok-goblin');
    chat.remove();
  });

  it('nowhere with focus on a button or a tab of the session rail', async () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 5, 10));
    select('tok-goblin');
    const zoomIn = screen.getByTitle('Zoom In');
    zoomIn.focus();
    pressOn(zoomIn, 'ArrowRight');
    await act(async () => { pressOn(zoomIn, ']'); });

    const tab = document.createElement('button');
    tab.setAttribute('role', 'tab');
    document.body.append(tab);
    tab.focus();
    pressOn(tab, 'ArrowLeft');

    expect(sentOf('token.move.end')).toEqual([]);
    expect(h.updateToken).not.toHaveBeenCalled();
    tab.remove();
  });

  it('nowhere while a dialog is open', async () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 5, 10));
    fireEvent.contextMenu(surface(), at(5, 10));
    select('tok-goblin');
    fireEvent.click(screen.getByText('Remove from Map'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Even with the map still holding the keyboard, as before the dialog takes it.
    theMap().focus();
    fireEvent.keyDown(theMap(), { key: 'ArrowRight' });
    await act(async () => { fireEvent.keyDown(theMap(), { key: ']' }); });

    expect(sentOf('token.move.end')).toEqual([]);
    expect(h.updateToken).not.toHaveBeenCalled();
  });

  it('with the map focused, after a click on it', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 5, 10));
    click(at(5, 10));
    click(at(5, 10));
    expect(document.activeElement).toBe(theMap());

    press('ArrowUp');

    expect(sentOf('token.move.end')).toEqual([
      { tokenId: 'tok-goblin', mapId: 'map-a', x: 5, y: 10 },
      { tokenId: 'tok-goblin', mapId: 'map-a', x: 5, y: 11 },
    ]);
  });
});

describe('the token keys and the rest of the page', () => {
  it('leave an arrow pressed on the page itself to the browser, as after a click on the chat log', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 5, 10));
    select('tok-goblin');
    (document.activeElement as HTMLElement | null)?.blur();

    expect(pressOn(document.body, 'ArrowUp')).toBe(false);
    pressOn(document.body, 'Enter');

    expect(sentOf('token.move.end')).toEqual([]);
    expect(screen.queryByText('Rotate Left')).not.toBeInTheDocument();
  });

  it('leave an arrow to a scrolling panel that has the focus', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 5, 10));
    select('tok-goblin');
    const log = document.createElement('div');
    log.tabIndex = 0;
    log.style.overflowY = 'auto';
    document.body.append(log);
    log.focus();

    expect(pressOn(log, 'ArrowDown')).toBe(false);

    expect(sentOf('token.move.end')).toEqual([]);
    log.remove();
  });

  it('leave a key the map has no use for to the browser, with the map focused', () => {
    render(<MapCanvas />);
    theMap().focus();

    // Nothing selected and no token to step to.
    expect(pressOn(theMap(), 'ArrowRight')).toBe(false);
    expect(pressOn(theMap(), 'Enter')).toBe(false);
    expect(pressOn(theMap(), ']')).toBe(false);
    expect(pressOn(theMap(), '.')).toBe(false);

    show(token('tok-goblin', 'Goblin Scout', 5, 10));
    expect(pressOn(theMap(), '.')).toBe(true);
    expect(pressOn(theMap(), 'ArrowRight')).toBe(true);
  });

  it('come back to the map when its menu closes by an item or a click elsewhere', async () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 5, 10));
    select('tok-goblin');

    await act(async () => { press('Enter'); });
    expect(document.activeElement).toBe(screen.getByText('Rotate Left'));
    fireEvent.click(screen.getByText('Add to Initiative'));
    expect(screen.queryByText('Rotate Left')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(theMap());

    await act(async () => { press('Enter'); });
    fireEvent.click(document.body);
    expect(screen.queryByText('Rotate Left')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(theMap());
  });
});

/**
 * On a slow connection the server's echo of one arrow move arrives after the
 * next has been sent and shown. Drawing it put the token back a square, and
 * the next press worked from there.
 */
describe('quick arrow presses', () => {
  const echo = (x: number, y: number, movedBy: string | null = 'me') =>
    fire('token.moved', { tokenId: 'tok-goblin', mapId: 'map-a', x, y, movedBy });
  const drops = () => sentOf('token.move.end').map((p) => (p as { x: number }).x);

  it('send each square on from the last one sent, while the echoes are still coming back', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 0, 10));
    select('tok-goblin');

    press('ArrowRight');
    press('ArrowRight');
    echo(1, 10);
    expect(positionOf('tok-goblin')).toEqual({ x: 2, y: 10 });
    press('ArrowRight');

    expect(drops()).toEqual([1, 2, 3]);
    echo(2, 10);
    echo(3, 10);
    expect(positionOf('tok-goblin')).toEqual({ x: 3, y: 10 });
  });

  it("give way to someone else's move of the token that arrives in the middle", () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 0, 10));
    select('tok-goblin');
    press('ArrowRight');
    press('ArrowRight');

    echo(7, 4, 'dm-user');
    expect(positionOf('tok-goblin')).toEqual({ x: 7, y: 4 });
    press('ArrowRight');
    expect(sentOf('token.move.end').slice(-1)).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 8, y: 4 }]);

    // The two earlier echoes, late, do not pull it back.
    echo(1, 10);
    echo(2, 10);
    expect(positionOf('tok-goblin')).toEqual({ x: 8, y: 4 });
    echo(8, 4);
    expect(positionOf('tok-goblin')).toEqual({ x: 8, y: 4 });
  });

  it('draw what the server says once a drop is refused', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 0, 10));
    select('tok-goblin');
    press('ArrowRight');
    press('ArrowRight');

    // The second drop was refused, so only the first is written and echoed.
    fire('error', { message: 'Token position out of bounds' });
    echo(1, 10);

    expect(positionOf('tok-goblin')).toEqual({ x: 1, y: 10 });
  });
});

/**
 * The keys act on the selection only while the screen draws it: a token that
 * has walked into fog, or one a preview does not show, keeps its menu shut
 * and stays where it is.
 */
describe('a selection the screen does not draw', () => {
  const brannoc = (x: number) => token('tok-bran', 'Brannoc', x, 10, { type: TokenType.PLAYER, controlledBy: 'other', characterId: 'char-bran' });

  it("opens no menu once a player's selection has gone into fog", async () => {
    h.set({ userRole: 'PLAYER', characters: [{ id: 'char-bran', userId: 'other', name: 'Brannoc' }], currentMap: mapNamed('map-a', { fogEnabled: true }) });
    render(<MapCanvas />);
    show(mine(2, 10), brannoc(4));
    // Every square revealed, so the player sees Brannoc and selects him.
    fire('fog:cells', { mapId: 'map-a', revealedCells: Array.from({ length: 400 }, (_, i) => i) });
    click(at(4, 10));
    expect(selected()).toBe('tok-bran');
    await act(async () => { press('Enter'); });
    expect(screen.getByText('View Character Sheet')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });

    // Now nothing is revealed: Brannoc is under fog, and the player's own token still shows.
    fire('fog:cells', { mapId: 'map-a', revealedCells: [] });
    await act(async () => { press('Enter'); });

    expect(screen.queryByText('View Character Sheet')).not.toBeInTheDocument();
  });

  it('sends no move, turn or menu for a token the preview does not draw', async () => {
    h.set({
      currentMap: mapNamed('map-a', { fogEnabled: true }),
      memberships: [{ userId: 'alice', role: 'PLAYER', user: { displayName: 'Alice' } }],
    });
    render(<MapCanvas />);
    show(token('tok-a', 'Alya', 2, 10, { type: TokenType.PLAYER, controlledBy: 'alice' }), token('tok-goblin', 'Goblin Scout', 12, 10));
    // The DM's fog: everything hidden.
    fire('fog:updated', { mapId: 'map-a', fogState: { fogCols: 20, fogRows: 20, cellPx: 50, revealed: new Array(400).fill(false) } });
    select('tok-goblin');
    fireEvent.click(screen.getByLabelText('Toggle DM player view preview'));

    press('ArrowRight');
    await act(async () => { press(']'); });
    await act(async () => { press('Enter'); });

    expect(sentOf('token.move.end')).toEqual([]);
    expect(h.updateToken).not.toHaveBeenCalled();
    expect(screen.queryByText('Rotate Left')).not.toBeInTheDocument();
  });
});

describe("the map's focus stop", () => {
  it('is named, and takes focus without scrolling on a press on the map', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    render(<MapCanvas />);
    expect(theMap()).toHaveAttribute('tabindex', '0');

    mouse.down(surface(), at(10, 10));
    mouse.up(surface(), at(10, 10));

    expect(document.activeElement).toBe(theMap());
    expect(focus.mock.contexts).toContain(theMap());
    expect(focus.mock.calls.find((_c, i) => focus.mock.contexts[i] === theMap())?.[0]).toEqual({ preventScroll: true });
    focus.mockRestore();
  });

  it('is not focused by a press on a panel over the map', () => {
    render(<MapCanvas />);

    fireEvent.pointerDown(screen.getByTitle('Zoom In'), { pointerType: 'mouse', button: 0, buttons: 1 });

    expect(document.activeElement).not.toBe(theMap());
  });

  it('still pings with Tab, and lets Shift+Tab leave', () => {
    render(<MapCanvas />);
    click(at(10, 10));
    mouse.move(surface(), at(10, 10));

    press('Tab');
    expect(sentOf('map.ping')).toHaveLength(1);
    press('Tab', { shiftKey: true });
    expect(sentOf('map.ping')).toHaveLength(1);
  });
});

describe('turning while the session is paused or ended', () => {
  it.each(['PAUSED', 'INACTIVE'])("sends no turn for a player's own token while %s, from the keys or the menu", async (status) => {
    h.set({ userRole: 'PLAYER', status });
    render(<MapCanvas />);
    show(mine(2, 10), token('tok-hero', 'Brannoc', 6, 10, { controlledBy: 'me', characterId: 'char-1' }));
    select('tok-mine');

    await act(async () => { press(']'); });
    expect(h.updateToken).not.toHaveBeenCalled();

    // Neither token's menu offers a turn.
    fireEvent.contextMenu(surface(), at(2, 10));
    expect(screen.queryByText('Rotate Right')).not.toBeInTheDocument();
    fireEvent.contextMenu(surface(), at(6, 10));
    expect(screen.queryByText('Rotate Right')).not.toBeInTheDocument();
  });

  it('lets the DM turn any token at any time', async () => {
    h.set({ status: 'PAUSED' });
    render(<MapCanvas />);
    show(goblin());
    select('tok-goblin');

    await act(async () => { press(']'); });
    expect(h.updateToken).toHaveBeenCalledWith('campaign-1', 'map-a', 'tok-goblin', { rotation: 45 });
    fireEvent.contextMenu(surface(), at(0, 19));
    expect(screen.getByText('Rotate Right')).toBeInTheDocument();
  });
});

/**
 * Follow my selection in Player Preview: the DM's canvas looks through the
 * selected token, and steps through only what that view shows. Whose eyes
 * the preview uses shows in the explored ground it asks the server for; a
 * hidden token shows in the hover card only in the DM's own view.
 */
describe('Follow my selection', () => {
  const alya = () => token('tok-a', 'Alya', 2, 10, { type: TokenType.PLAYER, controlledBy: 'alice' });
  const lurker = () => token('tok-h', 'Lurker', 3, 10, { visible: false });
  const borin = () => token('tok-b', 'Borin', 5, 10, { type: TokenType.PLAYER, controlledBy: 'bob' });
  const memoryAskedFor = () => sentOf('exploration:request').map((p) => (p as { userId?: string }).userId ?? null);
  /** The hover card's name line; the picker lists the same names as options. */
  const card = (name: string) => screen.queryByText(name, { selector: 'span' });

  beforeEach(() => {
    h.set({
      currentMap: mapNamed('map-a', { lightingEnabled: true, globalIllumination: true, explorationEnabled: true }),
      memberships: [
        { userId: 'alice', role: 'PLAYER', user: { displayName: 'Alice' } },
        { userId: 'bob', role: 'PLAYER', user: { displayName: 'Bob' } },
      ],
    });
  });

  function follow() {
    fireEvent.click(screen.getByLabelText('Toggle DM player view preview'));
    fireEvent.change(screen.getByLabelText('Player or token to preview as'), { target: { value: 'selected' } });
  }

  it('is offered in the picker, and stays chosen as the tokens change', () => {
    render(<MapCanvas />);
    show(alya(), borin());
    follow();
    expect(screen.getByLabelText('Player or token to preview as')).toHaveValue('selected');

    show(borin());

    expect(screen.getByLabelText('Player or token to preview as')).toHaveValue('selected');
  });

  it('looks through each token as the selection steps, passing over what that view does not show', () => {
    render(<MapCanvas />);
    show(alya(), lurker(), borin());
    follow();
    select('tok-a');
    expect(memoryAskedFor().slice(-1)).toEqual(['alice']);

    press('.');

    expect(selected()).toBe('tok-b');
    expect(memoryAskedFor().slice(-1)).toEqual(['bob']);
  });

  it('keeps the last token it followed when the selection is cleared, never the DM view', () => {
    render(<MapCanvas />);
    show(alya(), lurker(), borin());
    mouse.move(surface(), at(3, 10));
    expect(card('Lurker')).toBeInTheDocument();
    mouse.leave(surface());
    follow();
    select('tok-b');
    const asked = sentOf('exploration:request').length;

    press('Escape');

    expect(selected()).toBeNull();
    expect(sentOf('exploration:request')).toHaveLength(asked);
    mouse.move(surface(), at(3, 10));
    expect(card('Lurker')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Toggle DM player view preview')).toHaveTextContent('DM View');
  });

  it("steps through a split party on a lit map, from nothing selected, and never to what is hidden", () => {
    // No light and no darkvision: each token sees its own square only.
    h.set({ currentMap: mapNamed('map-a', { lightingEnabled: true, globalIllumination: false, explorationEnabled: true }) });
    render(<MapCanvas />);
    show(
      alya(),
      token('tok-b', 'Borin', 15, 3, { type: TokenType.PLAYER, controlledBy: 'bob' }),
      token('tok-ghost', 'Ghost', 9, 15, { type: TokenType.PLAYER, visible: false }),
      token('tok-goblin', 'Goblin', 8, 8),
    );
    follow();

    press('.');
    expect(selected()).toBe('tok-a');
    press('.');
    expect(selected()).toBe('tok-b');
    press('.');
    expect(selected()).toBe('tok-a');
  });

  it('before anything is selected, shows a view with no tokens of its own', () => {
    render(<MapCanvas />);
    show(alya(), lurker(), borin());
    follow();

    mouse.move(surface(), at(3, 10));
    expect(card('Lurker')).not.toBeInTheDocument();
    mouse.move(surface(), at(2, 10));
    expect(card('Alya')).not.toBeInTheDocument();
  });
});

describe('the ? key', () => {
  it('asks the page to show the shortcuts, once for a key held down', () => {
    const onShowShortcuts = vi.fn();
    render(<MapCanvas onShowShortcuts={onShowShortcuts} />);

    press('?', { shiftKey: true });
    press('?', { shiftKey: true, repeat: true });

    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
  });

  it('types a question mark in the chat box, as any other key there does', () => {
    const onShowShortcuts = vi.fn();
    render(<MapCanvas onShowShortcuts={onShowShortcuts} />);
    const chat = document.createElement('textarea');
    document.body.append(chat);
    chat.focus();

    expect(pressOn(chat, '?')).toBe(false);

    expect(onShowShortcuts).not.toHaveBeenCalled();
    chat.remove();
  });
});
