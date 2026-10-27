/**
 * How MapCanvas answers the pointer today, pinned before the mobile and
 * drawing work reworks its input handling: the square under the pointer,
 * zooming, panning, picking a token up and putting it down, and the
 * right-click menu. These describe the current behaviour, so a change to any
 * of it shows up here as a decision someone made, not a surprise in play.
 *
 * The campaign, socket and sign-in contexts are small stand-ins, as in
 * MapCanvasEditing.test.tsx: the role and current map live in a store the
 * test changes, and the socket records the token moves the page sends.
 * Canvas drawing is switched off, so jsdom gives the canvas no size and the
 * view starts at 100% with no pan: screen pixel (x, y) is map pixel (x, y),
 * and a square is 50 pixels.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { TokenType, type CampaignMap, type Token } from '@/types';
import { mouse } from '@/test/pointer';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'DM' as string,
    currentMap: null as unknown,
  };
  const sent: Array<[string, unknown]> = [];
  const raw = {
    on() { return raw; },
    off() { return raw; },
    emit(event: string, payload: unknown) {
      sent.push([event, payload]);
      return raw;
    },
  };
  return {
    state,
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
  default: { updateMap: vi.fn(), getMaps: vi.fn().mockResolvedValue([]), getMap: vi.fn() },
}));

vi.mock('@/services/api', () => {
  const client = new Proxy({}, { get: () => vi.fn().mockResolvedValue({}) });
  return { api: client, default: client };
});

import MapCanvas from '../MapCanvas';
import { useGameStore } from '@/stores/gameStore';

const MAP = {
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
} as unknown as CampaignMap;

/** A one-square token; grid y counts up from the bottom row, 0, to the top, 19. */
function token(id: string, name: string, x: number, y: number, extra: Partial<Token> = {}): Token {
  return {
    id, name, imageUrl: '', position: { x, y }, size: { width: 1, height: 1 },
    layer: 'material', visible: true, type: 'npc', conditions: [], ...extra,
  } as unknown as Token;
}

const goblin = () => token('tok-goblin', 'Goblin Scout', 0, 19);

/** The centre of square (x, y) on screen, at 100% and no pan. */
const at = (x: number, y: number) => ({ clientX: x * 50 + 10, clientY: (19 - y) * 50 + 10 });

/** The canvas that takes the pointer; the two beneath it ignore it. */
function surface(): HTMLCanvasElement {
  const input = document.querySelector<HTMLCanvasElement>('canvas[class*="cursor-"]');
  if (!input) throw new Error('no input canvas');
  return input;
}

function sentOf(event: string): unknown[] {
  return h.sent.filter(([e]) => e === event).map(([, p]) => p);
}

const lastOf = (event: string): unknown => sentOf(event).slice(-1)[0];

function show(...tokens: Token[]) {
  act(() => { useGameStore.getState().setTokens(tokens); });
}

/** A left click as the canvas sees it: down, then up, at one place. */
function click(point: { clientX: number; clientY: number }) {
  mouse.down(surface(), point);
  mouse.up(surface(), point);
}

const readout = () => screen.queryByText(/^\(-?\d+, -?\d+\)$/)?.textContent ?? null;
const zoom = () => screen.getByText(/^\d+%$/).textContent;

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.sent.length = 0;
  useGameStore.getState().setTokens([]);
  h.set({ userRole: 'DM', currentMap: MAP });
});

describe('the square under the pointer', () => {
  it('is shown in the corner, counting columns from the left and rows up from the bottom', () => {
    render(<MapCanvas />);

    mouse.move(surface(), { clientX: 10, clientY: 10 });
    expect(readout()).toBe('(0, 19)');
    mouse.move(surface(), { clientX: 60, clientY: 10 });
    expect(readout()).toBe('(1, 19)');
    mouse.move(surface(), { clientX: 10, clientY: 960 });
    expect(readout()).toBe('(0, 0)');
  });

  it('is not shown off the edge of the map', () => {
    render(<MapCanvas />);

    mouse.move(surface(), { clientX: 1010, clientY: 10 });

    expect(readout()).toBeNull();
  });
});

describe('zooming', () => {
  it('goes a tenth per wheel notch, keeping the square under the pointer where it was', () => {
    render(<MapCanvas />);
    expect(zoom()).toBe('100%');

    fireEvent.wheel(surface(), { deltaY: -100, clientX: 260, clientY: 260 });
    expect(zoom()).toBe('110%');
    mouse.move(surface(), { clientX: 260, clientY: 260 });
    expect(readout()).toBe('(5, 14)');

    fireEvent.wheel(surface(), { deltaY: 100, clientX: 260, clientY: 260 });
    expect(zoom()).toBe('100%');
  });

  it('goes a quarter per button press, between 10% and 300%', () => {
    render(<MapCanvas />);
    const press = (title: string, times: number) => {
      for (let i = 0; i < times; i++) fireEvent.click(screen.getByTitle(title));
    };

    press('Zoom In', 1);
    expect(zoom()).toBe('125%');
    press('Zoom In', 7);
    expect(zoom()).toBe('300%');
    expect(screen.getByTitle('Zoom In')).toBeDisabled();

    press('Zoom Out', 10);
    expect(zoom()).toBe('50%');
    press('Zoom Out', 2);
    expect(zoom()).toBe('10%');
    expect(screen.getByTitle('Zoom Out')).toBeDisabled();
  });
});

describe('panning', () => {
  it('drags the map with the left button held on an empty square', () => {
    render(<MapCanvas />);

    mouse.down(surface(), { clientX: 500, clientY: 500 });
    mouse.move(surface(), { clientX: 550, clientY: 500 }, 1);
    mouse.up(surface(), { clientX: 550, clientY: 500 });

    // The map moved one square right, so the first column is now under x 60.
    mouse.move(surface(), { clientX: 60, clientY: 10 });
    expect(readout()).toBe('(0, 19)');
  });
});

describe('moving a token: click to pick it up, click again to put it down', () => {
  it('tells the table when it is picked up, as it follows the pointer, and where it is put down', () => {
    render(<MapCanvas />);
    show(goblin());

    click(at(0, 19));
    expect(sentOf('token.move.start')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a' }]);

    mouse.move(surface(), at(3, 19));
    expect(sentOf('token.move')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 3, y: 19 }]);

    click(at(3, 19));
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 3, y: 19 }]);
    expect(useGameStore.getState().tokens['tok-goblin'].position).toEqual({ x: 3, y: 19 });
  });

  it('puts a held token back where it was when the pointer leaves the map', () => {
    render(<MapCanvas />);
    show(goblin());
    click(at(0, 19));
    mouse.move(surface(), at(3, 19));

    mouse.leave(surface());

    expect(lastOf('token.move')).toEqual({ tokenId: 'tok-goblin', mapId: 'map-a', x: 0, y: 19 });
    expect(sentOf('token.move.end')).toEqual([]);
    expect(useGameStore.getState().tokens['tok-goblin'].position).toEqual({ x: 0, y: 19 });
  });

  it('puts a held token back on a right-click', () => {
    render(<MapCanvas />);
    show(goblin());
    click(at(0, 19));
    mouse.move(surface(), at(3, 19));

    fireEvent.contextMenu(surface(), at(3, 19));

    expect(lastOf('token.move')).toEqual({ tokenId: 'tok-goblin', mapId: 'map-a', x: 0, y: 19 });
    expect(sentOf('token.move.end')).toEqual([]);
  });

  it('lets the DM put a token down on another one', () => {
    render(<MapCanvas />);
    show(goblin(), token('tok-wolf', 'Wolf', 3, 19));

    click(at(0, 19));
    click(at(3, 19));

    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 3, y: 19 }]);
  });

  it('does not let a player pick up a token they do not control', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(goblin());

    click(at(0, 19));

    expect(sentOf('token.move.start')).toEqual([]);
  });

  it('lets a player move a token they control', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(token('tok-mine', 'Aldra', 0, 19, { type: TokenType.PLAYER, controlledBy: 'me' }));

    click(at(0, 19));
    click(at(2, 18));

    expect(sentOf('token.move.start')).toEqual([{ tokenId: 'tok-mine', mapId: 'map-a' }]);
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-mine', mapId: 'map-a', x: 2, y: 18 }]);
  });

  it("refuses to put a player's token down where another creature stands, saying who is there", async () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(token('tok-mine', 'Aldra', 0, 19, { type: TokenType.PLAYER, controlledBy: 'me' }), token('tok-wolf', 'Wolf', 3, 19));

    click(at(0, 19));
    click(at(3, 19));

    expect(await screen.findByText('Wolf is already standing there.')).toBeInTheDocument();
    expect(sentOf('token.move.end')).toEqual([]);
    expect(lastOf('token.move')).toEqual({ tokenId: 'tok-mine', mapId: 'map-a', x: 0, y: 19 });
  });
});

describe('a right-click', () => {
  it('opens the token menu on a token, and closes it on an empty square', () => {
    render(<MapCanvas />);
    show(goblin());

    fireEvent.contextMenu(surface(), at(0, 19));
    expect(screen.getByText('Remove from Map')).toBeInTheDocument();

    fireEvent.contextMenu(surface(), at(10, 10));
    expect(screen.queryByText('Remove from Map')).not.toBeInTheDocument();
  });

  // The menu once offered Hide from Players only for objects, while every
  // other place a DM can hide a token offered it for every kind.
  it.each([TokenType.NPC, TokenType.PLAYER, TokenType.OBJECT])(
    'offers the DM Hide from Players and Obscure Identity for a token of type %s',
    (type) => {
      render(<MapCanvas />);
      show(token('tok-any', 'Anything', 0, 19, { type }));

      fireEvent.contextMenu(surface(), at(0, 19));

      expect(screen.getByText('Hide from Players')).toBeInTheDocument();
      expect(screen.getByText('Obscure Identity')).toBeInTheDocument();
    },
  );
});

// Nothing pinned the hover card before it moved into its own component
// (TokenDetailsCard): what it shows, by who is looking.
describe('the card a hovered token shows', () => {
  afterEach(() => {
    act(() => { useGameStore.getState().clearGameState(); });
  });

  /** The card over the map, found by the name in it. */
  const card = (name: string) => screen.getByText(name).closest('.glass-panel') as HTMLElement;
  const hover = (point: { clientX: number; clientY: number }) => mouse.move(surface(), point);
  const inOrder = (initiative: number | null) => act(() => {
    useGameStore.getState().setCombatState({
      active: true, round: 1, currentTokenId: null,
      combatants: [{ tokenId: 'tok-goblin', mapId: 'map-a', name: 'Goblin Scout', imageUrl: '', initiative, hp: null, type: 'npc', disposition: null }],
    });
  });

  it('names the token and the square under the pointer, and lists its conditions in full', () => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin Scout', 0, 19, { conditions: ['poisoned', 'prone'] }));

    hover(at(0, 19));

    const shown = card('Goblin Scout');
    expect(within(shown).getByText('(0, 19)')).toBeInTheDocument();
    expect(within(shown).getByText('poisoned')).toBeInTheDocument();
    expect(within(shown).getByText('prone')).toBeInTheDocument();
  });

  it("shows a creature's own hit points to the DM, and to a player only once its HP bar is on", () => {
    const wounded = (showHpBar: boolean) => token('tok-goblin', 'Goblin Scout', 0, 19, { hp: { current: 5, max: 7, temp: 2 }, showHpBar });
    render(<MapCanvas />);
    show(wounded(false));
    hover(at(0, 19));
    expect(within(card('Goblin Scout')).getByText('5/7')).toBeInTheDocument();
    expect(within(card('Goblin Scout')).getByText('+2')).toBeInTheDocument();

    act(() => { h.set({ userRole: 'PLAYER' }); });
    hover(at(1, 19));
    hover(at(0, 19));
    expect(within(card('Goblin Scout')).queryByText('5/7')).toBeNull();
    expect(within(card('Goblin Scout')).queryByText('HP')).toBeNull();

    show(wounded(true));
    hover(at(1, 19));
    hover(at(0, 19));
    expect(within(card('Goblin Scout')).getByText('5/7')).toBeInTheDocument();
  });

  it("shows a character's hit points from its sheet, to a player too", () => {
    h.set({ userRole: 'PLAYER' });
    act(() => { useGameStore.getState().setCharacterHp('char-mara', { current: 12, max: 20, temp: 0 }); });
    render(<MapCanvas />);
    show(token('tok-mara', 'Mara', 0, 19, { type: TokenType.PLAYER, characterId: 'char-mara', hp: { current: 1, max: 1, temp: 0 } }));

    hover(at(0, 19));

    expect(within(card('Mara')).getByText('12/20')).toBeInTheDocument();
  });

  it('has an Initiative row only while the token is in the turn order, with a dash before it rolls', () => {
    render(<MapCanvas />);
    show(goblin());
    hover(at(0, 19));
    expect(within(card('Goblin Scout')).queryByText('Initiative')).toBeNull();

    inOrder(null);
    expect(within(card('Goblin Scout')).getByText('Initiative')).toBeInTheDocument();
    expect(within(card('Goblin Scout')).getByText('—')).toBeInTheDocument();

    inOrder(14);
    expect(within(card('Goblin Scout')).getByText('14')).toBeInTheDocument();
  });

  it('says "Not yours to move" on a token the viewer may not move, and nothing on their own', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    show(goblin(), token('tok-mine', 'Aldra', 2, 19, { type: TokenType.PLAYER, controlledBy: 'me' }));

    hover(at(0, 19));
    expect(within(card('Goblin Scout')).getByText('Not yours to move')).toBeInTheDocument();

    hover(at(2, 19));
    expect(within(card('Aldra')).queryByText('Not yours to move')).toBeNull();
  });

  it('is gone once the pointer leaves the token', () => {
    render(<MapCanvas />);
    show(goblin());
    hover(at(0, 19));
    expect(screen.getByText('Goblin Scout')).toBeInTheDocument();

    hover(at(5, 5));
    expect(screen.queryByText('Goblin Scout')).toBeNull();
  });
});
