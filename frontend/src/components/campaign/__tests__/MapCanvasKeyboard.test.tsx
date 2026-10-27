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
import { render, screen, fireEvent, act } from '@testing-library/react';
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
    id: 'campaign-1', name: 'Test', spiritLayerEnabled: false, characters: [],
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
  h.set({ userRole: 'DM', status: 'ACTIVE', memberships: [], currentMap: mapNamed('map-a') });
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
