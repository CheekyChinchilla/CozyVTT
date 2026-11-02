/**
 * While a token is held, the map's lower left shows how far it has come from
 * its own square to where it would be put down, in feet and squares, as the
 * ruler measures (map/tokenHold.ts carriedDistance): beside the square under
 * the pointer, or above the details card when one shows there, and on the
 * compact layout in the dock at the map's foot.
 *
 * The stand-ins are those of MapCanvasMenus.test.tsx: the role, the session's
 * status and the map live in a store the test changes, and the socket records
 * what the page sends. Canvas drawing is switched off, so the view starts at
 * 100% with no pan and a square is 50 pixels.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { TokenLayer, TokenType, type CampaignMap, type Token } from '@/types';
import { contact, mouse } from '@/test/pointer';

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
  const mapActions = (await import('@/test/viewedMapContext')).mapActionsFor(() => h.state.currentMap, () => undefined);
  const noop = () => undefined;
  const campaign = {
    id: 'campaign-1', name: 'Test', spiritLayerEnabled: false, status: 'ACTIVE',
    memberships: [{ userId: 'me', role: 'DM', user: { displayName: 'Me' } }, { userId: 'alice', role: 'PLAYER', user: { displayName: 'Alice' } }],
    characters: [], maps: [{ id: 'map-a', name: 'Map A' }],
  };
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
import { LayoutProvider } from '@/contexts/LayoutContext';
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
    feetPerSquare: 5,
    diagonalRule: 'flat',
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
    layer: TokenLayer.TOKEN, visible: true, type: TokenType.NPC, conditions: [], rotation: 0, controlledBy: null,
    hp: null, showHpBar: false, ...extra,
  } as unknown as Token;
}

const goblin = (extra: Partial<Token> = {}) => token('tok-goblin', 'Goblin Scout', 0, 19, extra);

/** The centre of square (x, y), at 100% and no pan. */
const at = (x: number, y: number) => ({ clientX: x * 50 + 25, clientY: (19 - y) * 50 + 25 });

function surface(): HTMLCanvasElement {
  const input = document.querySelector<HTMLCanvasElement>('canvas[class*="cursor-"]');
  if (!input) throw new Error('no input canvas');
  return input;
}

function show(...tokens: Token[]) {
  act(() => { useGameStore.getState().setTokens(tokens, 'map-a'); });
}

const sentOf = (event: string) => h.sent.filter(([e]) => e === event).map(([, p]) => p);

/** A left click as the canvas sees it: down, then up, at one place. */
function click(point: { clientX: number; clientY: number }) {
  mouse.down(surface(), point);
  mouse.up(surface(), point);
}

/** What the readout says, its spaces as a page shows them, or null while none shows. */
const carried = () => screen.queryByText(/^Carried /)?.textContent?.replace(/\s+/g, ' ') ?? null;

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.sent.length = 0;
  act(() => { useGameStore.getState().clearGameState(); });
  h.set({ userRole: 'DM', currentMap: mapWith() });
});

describe('with a mouse', () => {
  it('shows how far the held token has come beside the square under the pointer, and goes as it is put down', () => {
    render(<MapCanvas />);
    show(goblin());
    mouse.move(surface(), at(0, 19));
    expect(carried()).toBeNull();

    click(at(0, 19));
    expect(carried()).toBe('Carried 0 ft (0 sq)');
    mouse.move(surface(), at(3, 17));

    expect(carried()).toBe('Carried 15 ft (3 sq)');
    expect(screen.getByText('(3, 17)').parentElement).toBe(screen.getByText(/^Carried /).parentElement);

    click(at(3, 17));
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 3, y: 17 }]);
    expect(carried()).toBeNull();
  });

  it("measures by the map's Grid Scale and diagonal rule, as the ruler does", () => {
    h.set({ currentMap: mapWith({ feetPerSquare: 10, diagonalRule: 'alternating' }) });
    render(<MapCanvas />);
    show(goblin());
    click(at(0, 19));

    mouse.move(surface(), at(2, 17));

    expect(carried()).toBe('Carried 30 ft (2 sq)');
  });

  // The card says who is already standing where the token would land.
  it("shows above the card of a token the pointer is over", () => {
    render(<MapCanvas />);
    show(goblin(), token('tok-wolf', 'Wolf', 4, 19));
    click(at(0, 19));

    mouse.move(surface(), at(4, 19));

    const card = screen.getByText('Wolf').closest('.glass-panel') as HTMLElement;
    expect(within(card).getByText(/^Carried /)).toBeInTheDocument();
    expect(carried()).toBe('Carried 20 ft (4 sq)');
  });

  it('goes when the token is put back', () => {
    render(<MapCanvas />);
    show(goblin());
    click(at(0, 19));
    mouse.move(surface(), at(3, 19));

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(carried()).toBeNull();
  });

  // In a preview the screen is the players'.
  it("shows nothing in Player Preview for a token the preview does not draw", () => {
    h.set({ currentMap: mapWith({ fogEnabled: true }) });
    render(<MapCanvas />);
    show(goblin({ visible: false }), token('tok-alya', 'Alya', 10, 10, { type: TokenType.PLAYER, controlledBy: 'alice' }));
    click(at(0, 19));
    mouse.move(surface(), at(2, 19));
    expect(carried()).toBe('Carried 10 ft (2 sq)');

    fireEvent.click(screen.getByRole('button', { name: 'Preview Player View' }));

    expect(carried()).toBeNull();
  });
});

// A pen hovering over the map carries a token it tapped up, as a mouse does.
describe('with a stylus', () => {
  it('shows how far a hovering pen has carried the token', () => {
    render(<MapCanvas />);
    show(goblin());
    const pen = contact('pen', 1);
    pen.down(surface(), at(0, 19));
    pen.up(surface(), at(0, 19));

    fireEvent.pointerMove(surface(), { pointerType: 'pen', pointerId: 1, isPrimary: true, ...at(3, 19), button: -1, buttons: 0 });

    expect(carried()).toBe('Carried 15 ft (3 sq)');
  });
});

// A switch of map puts the held token back, and the readout goes with it.
describe('when the map on screen changes', () => {
  it('goes', () => {
    render(<MapCanvas />);
    show(goblin());
    click(at(0, 19));
    mouse.move(surface(), at(3, 19));
    expect(carried()).toBe('Carried 15 ft (3 sq)');

    act(() => { h.set({ currentMap: mapWith({ id: 'map-b', feetPerSquare: 10 }) }); });

    expect(carried()).toBeNull();
  });
});

describe('from the keyboard', () => {
  // An arrow ends a hold one square over from where the token stood.
  it('goes when an arrow puts the held token down', () => {
    render(<MapCanvas />);
    show(goblin({ position: { x: 2, y: 10 } }));
    click(at(2, 10));
    mouse.move(surface(), at(5, 10));
    expect(carried()).toBe('Carried 15 ft (3 sq)');
    const map = screen.getByRole('application', { name: 'Map' });
    map.focus();

    fireEvent.keyDown(map, { key: 'ArrowRight' });

    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 3, y: 10 }]);
    expect(carried()).toBeNull();
  });
});

describe('with a finger', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('shows how far a drag has carried the token, and goes as the finger lifts', () => {
    render(<MapCanvas />);
    show(goblin());
    const finger = contact('touch', 1);
    finger.down(surface(), at(0, 19));
    finger.move(surface(), at(1, 19));
    finger.move(surface(), at(3, 19));

    expect(carried()).toBe('Carried 15 ft (3 sq)');

    finger.up(surface(), at(3, 19));
    finger.leave(surface());
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 3, y: 19 }]);
    expect(carried()).toBeNull();
  });

  // A tap takes it up and selects it; its card shows where the pointer's
  // square would, and the token waits on its own square.
  it('shows above the selected token’s card while a tap holds it', () => {
    render(<MapCanvas />);
    show(goblin());
    const finger = contact('touch', 1);
    finger.down(surface(), at(0, 19));
    finger.up(surface(), at(0, 19));
    finger.leave(surface());

    const card = screen.getByRole('button', { name: 'Close details' }).closest('.glass-panel') as HTMLElement;
    expect(within(card).getByText('Goblin Scout')).toBeInTheDocument();
    expect(within(card).getByText(/^Carried /)).toBeInTheDocument();
    expect(carried()).toBe('Carried 0 ft (0 sq)');
  });
});

describe('on the compact layout', () => {
  const compactMap = () => (
    <LayoutProvider compact>
      <MapCanvas />
    </LayoutProvider>
  );
  const dock = () => document.querySelector<HTMLElement>('[data-map-dock]')!;

  it('shows in the dock at the foot of the map while a finger carries the token', () => {
    render(compactMap());
    show(goblin());
    const finger = contact('touch', 1);
    finger.down(surface(), at(0, 19));
    finger.move(surface(), at(1, 19));
    finger.move(surface(), at(2, 18));

    expect(within(dock()).getByText(/^Carried /)).toBeInTheDocument();
    expect(carried()).toBe('Carried 10 ft (2 sq)');
  });

  it('shows in the dock above the selected token’s card while a tap holds it', () => {
    render(compactMap());
    show(goblin());
    const finger = contact('touch', 1);
    finger.down(surface(), at(0, 19));
    finger.up(surface(), at(0, 19));
    finger.leave(surface());

    expect(within(dock()).getByText('Goblin Scout')).toBeInTheDocument();
    expect(within(dock()).getByText(/^Carried /)).toBeInTheDocument();
  });
});
