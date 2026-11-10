/**
 * The line that tells a player why a lit map is black for them. Dynamic
 * lighting draws a player's view from the tokens they control, so a player
 * with none on the plane they are looking at sees nothing at all, on the
 * material plane or in the spirit realm, with Global Illumination or
 * without. The line says so from the player's side, and is shown wherever
 * that holds: to the player, and to the DM previewing them.
 *
 * The stand-ins are MapCanvasCompactChrome.test.tsx's, with the members and
 * the spirit realm in the store too. Canvas drawing is switched off.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TokenLayer, TokenType, type CampaignMap, type Token } from '@/types';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'PLAYER' as string,
    currentMap: null as unknown,
    spiritLayerEnabled: false,
    playerSpiritVisible: false,
    memberships: [] as Array<{ userId: string; role: string; user: { displayName: string } }>,
  };
  const raw = {
    on() { return raw; },
    off() { return raw; },
    emit() { return raw; },
  };
  return {
    state,
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
    id: 'campaign-1', name: 'Test', status: 'ACTIVE', characters: [], maps: [{ id: 'map-a', name: 'Map A' }],
    get spiritLayerEnabled() { return h.state.spiritLayerEnabled; },
    get memberships() { return h.state.memberships; },
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
  const client = new Proxy({ getSocket: () => h.raw } as Record<string, unknown>, {
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

import MapCanvasOnly from '../MapCanvas';
import { LayoutProvider } from '@/contexts/LayoutContext';
import { useGameStore } from '@/stores/gameStore';

const ON_THIS_MAP = 'You have no token on this map to see through. Ask your DM for one.';
const IN_THE_SPIRIT_REALM = 'You have no token in the spirit realm to see through. Ask your DM for one.';
const RULER_NOTE = 'Place your character token on the map to use the ruler';

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
    lightingEnabled: true,
    globalIllumination: false,
    explorationEnabled: false,
    ...extra,
  } as unknown as CampaignMap;
}

/** A one-square token on the material plane, controlled by nobody unless given. */
function token(id: string, extra: Partial<Token> = {}): Token {
  return {
    id, name: `Token ${id}`, imageUrl: '', characterId: null, position: { x: 2, y: 2 }, size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN, visible: true, type: TokenType.PLAYER, conditions: [], rotation: 0, controlledBy: null,
    hp: null, showHpBar: false, ...extra,
  } as unknown as Token;
}

/** Tokens on the map, as the page holds them once it has loaded. */
function show(...tokens: Token[]) {
  act(() => { useGameStore.getState().setTokens(tokens, 'map-a'); });
}

function MapCanvas({ compact = false }: { compact?: boolean }) {
  return (
    <LayoutProvider compact={compact}>
      <MapCanvasOnly />
    </LayoutProvider>
  );
}

const hint = () => screen.queryByText(ON_THIS_MAP) ?? screen.queryByText(IN_THE_SPIRIT_REALM);
const classesOf = (el: Element) => el.className.split(/\s+/);

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  act(() => { useGameStore.getState().clearGameState(); });
  h.set({
    userRole: 'PLAYER',
    currentMap: mapWith(),
    spiritLayerEnabled: false,
    playerSpiritVisible: false,
    memberships: [
      { userId: 'dm', role: 'DM', user: { displayName: 'Dee' } },
      { userId: 'me', role: 'PLAYER', user: { displayName: 'Me' } },
    ],
  });
});

describe('a player on a lit map', () => {
  it('with no token of theirs on it is told why the map is dark, and what to do', () => {
    render(<MapCanvas />);
    show(token('goblin', { type: TokenType.NPC }));
    expect(screen.getByText(ON_THIS_MAP)).toBeInTheDocument();
  });

  it('with a token they control is told nothing', () => {
    render(<MapCanvas />);
    show(token('hero', { controlledBy: 'me' }));
    expect(hint()).toBeNull();
  });

  // Sight comes from the tokens a player controls; their character on a
  // token someone else controls gives them none.
  it('whose character stands on a token another member controls is told', () => {
    render(<MapCanvas />);
    show(token('hero', { characterId: 'char-mine', controlledBy: 'alice' }));
    expect(screen.getByText(ON_THIS_MAP)).toBeInTheDocument();
  });

  it('is told the moment their token leaves the map, and no more once one is back', () => {
    render(<MapCanvas />);
    show(token('hero', { controlledBy: 'me' }));
    expect(hint()).toBeNull();
    show();
    expect(screen.getByText(ON_THIS_MAP)).toBeInTheDocument();
    show(token('hero', { controlledBy: 'me' }));
    expect(hint()).toBeNull();
  });

  // Global Illumination lights what a token sees; with no token nothing is
  // seen, so the map is just as dark.
  it('is told with Global Illumination on too', () => {
    h.set({ currentMap: mapWith({ globalIllumination: true }) });
    render(<MapCanvas />);
    expect(screen.getByText(ON_THIS_MAP)).toBeInTheDocument();
  });
});

describe('the line is not shown', () => {
  it('on a map with dynamic lighting off', () => {
    h.set({ currentMap: mapWith({ lightingEnabled: false }) });
    render(<MapCanvas />);
    expect(hint()).toBeNull();
  });

  it('to the DM, outside Player Preview', () => {
    h.set({ userRole: 'DM' });
    render(<MapCanvas />);
    expect(hint()).toBeNull();
  });

  it('to a spectator', () => {
    h.set({ userRole: 'SPECTATOR' });
    render(<MapCanvas />);
    expect(hint()).toBeNull();
  });
});

describe('a player in the spirit realm', () => {
  it('with no token there is told so, whether the whole table is there or only they are', () => {
    h.set({ spiritLayerEnabled: true });
    const { unmount } = render(<MapCanvas />);
    expect(screen.getByText(IN_THE_SPIRIT_REALM)).toBeInTheDocument();
    unmount();

    h.set({ spiritLayerEnabled: false, playerSpiritVisible: true });
    render(<MapCanvas />);
    expect(screen.getByText(IN_THE_SPIRIT_REALM)).toBeInTheDocument();
  });

  it('with a spirit token they control is told nothing', () => {
    h.set({ spiritLayerEnabled: true });
    render(<MapCanvas />);
    show(token('wisp', { layer: TokenLayer.SPIRIT, controlledBy: 'me' }));
    expect(hint()).toBeNull();
  });
});

describe("the DM's Player Preview", () => {
  function preview() {
    fireEvent.click(screen.getByRole('button', { name: 'Preview Player View' }));
  }

  beforeEach(() => {
    h.set({ userRole: 'DM' });
  });

  it('of a player with no token on the map shows the line as they see it', () => {
    render(<MapCanvas />);
    show(token('goblin', { type: TokenType.NPC }));
    preview();
    expect(screen.getByText(ON_THIS_MAP)).toBeInTheDocument();
  });

  it('of a player with a token shows nothing', () => {
    render(<MapCanvas />);
    show(token('hero', { controlledBy: 'me' }));
    preview();
    expect(hint()).toBeNull();
  });

  // The DM holds every token; the previewed player is sent only those on
  // their own plane, and sees through those alone.
  it('of a player in the spirit realm whose only token is on the material plane shows the spirit realm line', () => {
    h.set({ spiritLayerEnabled: true });
    render(<MapCanvas />);
    show(token('hero', { controlledBy: 'me' }));
    preview();
    expect(screen.getByText(IN_THE_SPIRIT_REALM)).toBeInTheDocument();
  });

  it('of a player whose only token is hidden shows the line', () => {
    render(<MapCanvas />);
    show(token('hero', { controlledBy: 'me', visible: false }));
    preview();
    expect(screen.getByText(ON_THIS_MAP)).toBeInTheDocument();
  });

  it('is gone once the DM goes back to the DM view', () => {
    render(<MapCanvas />);
    preview();
    expect(screen.getByText(ON_THIS_MAP)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'DM View' }));
    expect(hint()).toBeNull();
  });
});

describe('where the line sits', () => {
  it('on the desktop, at the foot of the map over the ruler\'s note, letting presses through', () => {
    render(<MapCanvas />);
    fireEvent.click(screen.getByRole('button', { name: 'Ruler — measure distance' }));

    const line = screen.getByText(ON_THIS_MAP);
    const ruler = screen.getByText(RULER_NOTE);
    expect(line.parentElement).toBe(ruler.parentElement);
    expect(line.compareDocumentPosition(ruler) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(classesOf(line.parentElement!)).toEqual(expect.arrayContaining(['absolute', 'bottom-16', 'pointer-events-none']));
    expect(classesOf(line)).toEqual(classesOf(ruler));
  });

  it('on the desktop in Player Preview, above Preview\'s controls', () => {
    h.set({ userRole: 'DM' });
    render(<MapCanvas />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview Player View' }));

    const stack = screen.getByText(ON_THIS_MAP).parentElement!;
    expect(classesOf(stack)).toContain('bottom-32');
    expect(classesOf(screen.getByRole('button', { name: 'DM View' }).parentElement!)).toContain('bottom-20');
  });

  it('on the compact layout, in the dock at the map\'s foot, letting presses through', () => {
    render(<MapCanvas compact />);
    const line = screen.getByText(ON_THIS_MAP);
    const dock = document.querySelector<HTMLElement>('[data-map-dock]')!;
    expect(dock).toContainElement(line);
    for (let el: HTMLElement | null = line; el && el !== dock; el = el.parentElement) {
      expect(classesOf(el)).not.toContain('pointer-events-auto');
    }
    expect(classesOf(line)).toEqual(expect.arrayContaining(['text-center', 'text-xs']));
  });
});
