/**
 * The map's token and door menus on the compact layout: action sheets, with
 * the items the popovers offer, closed by the sheet itself and not by the
 * popovers' click anywhere, and the token menu's Roll... pickers as sheets.
 * The stand-ins are MapCanvasMenus.test.tsx's.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within, createEvent } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { TokenLayer, TokenType, type CampaignMap, type Token } from '@/types';
import type { WallSegment } from '@/types/walls';
import { contact, mouse } from '@/test/pointer';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'DM' as string,
    currentMap: null as unknown,
    status: 'ACTIVE' as string,
    memberships: [] as Array<{ userId: string; role: string; user: { displayName: string } }>,
    characters: [] as Array<{ id: string; userId: string; name: string }>,
    maps: [] as Array<{ id: string; name: string }>,
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
    api: {
      getCharacter: vi.fn(),
      updateToken: vi.fn(),
      addToken: vi.fn(),
      saveTokenAsTemplate: vi.fn(),
      moveTokens: vi.fn(),
      deleteToken: vi.fn(),
      getCampaignCharacters: vi.fn(),
    } as Record<string, ReturnType<typeof vi.fn>>,
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
    id: 'campaign-1', name: 'Test', spiritLayerEnabled: false,
    get characters() { return h.state.characters; },
    get status() { return h.state.status; },
    get memberships() { return h.state.memberships; },
    get maps() { return h.state.maps; },
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
    emitInitiativeAdd: record('initiative.add'),
    emitInitiativeRoll: record('initiative.roll'),
    emitMapPing: record('map.ping'),
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
    get: (_target, prop: string) => h.api[prop] ?? vi.fn().mockResolvedValue({}),
  });
  return { api: client, default: client };
});

import MapCanvasOnly from '../MapCanvas';
import { LayoutProvider } from '@/contexts/LayoutContext';
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
    layer: TokenLayer.TOKEN, visible: true, type: TokenType.NPC, conditions: [], rotation: 0, controlledBy: null,
    hp: null, showHpBar: false, ...extra,
  } as unknown as Token;
}

const MEMBERS = {
  me: (role: string) => ({ userId: 'me', role, user: { displayName: 'Me' } }),
  alice: { userId: 'alice', role: 'PLAYER', user: { displayName: 'Alice' } },
};
const CHARACTERS = {
  mine: { id: 'char-mine', userId: 'me', name: 'Aldra' },
  alices: { id: 'char-alice', userId: 'alice', name: 'Brannoc' },
};

const goblin = (extra: Partial<Token> = {}) => token('tok-goblin', 'Goblin Scout', 0, 19, extra);
/** A player's character on the map. */
const hero = (characterId: string, controlledBy: string, extra: Partial<Token> = {}) =>
  token('tok-hero', 'Hero', 2, 19, { type: TokenType.PLAYER, characterId, controlledBy, ...extra });

/** Square (x, y) on screen, at 100% and no pan. */
const at = (x: number, y: number) => ({ clientX: x * 50 + 10, clientY: (19 - y) * 50 + 10 });

function surface(): HTMLCanvasElement {
  const input = document.querySelector<HTMLCanvasElement>('canvas[class*="cursor-"]');
  if (!input) throw new Error('no input canvas');
  return input;
}

function show(...tokens: Token[]) {
  act(() => { useGameStore.getState().setTokens(tokens); });
}

function sentOf(event: string): unknown[] {
  return h.sent.filter(([e]) => e === event).map(([, p]) => p);
}

/** Right-click square (x, y). */
function rightClick(x: number, y: number) {
  fireEvent.contextMenu(surface(), at(x, y));
}

/** The menu open on the map, or null. */
function openMenu(): HTMLElement | null {
  const menus = document.querySelectorAll<HTMLElement>('div.fixed.z-50.glass-panel');
  if (menus.length > 1) throw new Error(`${menus.length} menus open`);
  return menus[0] ?? null;
}

/** The click on a menu item, settled. */
async function choose(label: string | RegExp) {
  await act(async () => { fireEvent.click(screen.getByText(label)); });
}

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.sent.length = 0;
  // A sheet never arrives, so neither the viewer nor the roll picker gets past loading.
  h.api.getCharacter.mockReset().mockReturnValue(new Promise(() => undefined));
  for (const name of ['updateToken', 'saveTokenAsTemplate', 'moveTokens', 'deleteToken']) h.api[name].mockReset().mockResolvedValue({});
  h.api.addToken.mockReset().mockImplementation((_c: string, _m: string, body: Partial<Token>) =>
    Promise.resolve({ token: { ...goblin(), ...body, id: 'tok-copy' } }));
  act(() => { useGameStore.getState().clearGameState(); });
  h.set({
    userRole: 'DM',
    status: 'ACTIVE',
    memberships: [MEMBERS.me('DM'), MEMBERS.alice],
    characters: [CHARACTERS.mine, CHARACTERS.alices],
    maps: [{ id: 'map-a', name: 'Map A' }, { id: 'map-b', name: 'Map B' }, { id: 'map-c', name: 'Map C' }],
    currentMap: mapNamed('map-a'),
  });
});

/** The map as the compact layout draws it. */
function MapCanvas(props: Parameters<typeof MapCanvasOnly>[0]) {
  return (
    <LayoutProvider compact>
      <MapCanvasOnly {...props} />
    </LayoutProvider>
  );
}

/** The action sheet's rows, by their labels. */
function sheetLabels(): string[] {
  const page = document.querySelector<HTMLElement>('[data-action-sheet-page]');
  if (!page) throw new Error('no action sheet open');
  return Array.from(page.children).map((row) => {
    if (row.getAttribute('role') === 'separator') return '---';
    const label = (row.querySelector('span')?.textContent ?? row.textContent ?? '').trim();
    return row instanceof HTMLButtonElement && row.disabled ? `${label} [disabled]` : label;
  });
}

const sheetNamed = (name: string) => screen.getByRole('dialog', { name });

describe('the token menu on the compact layout', () => {
  it('is an action sheet named by the token, with the popover’s items in order, and no popover', () => {
    render(<MapCanvas />);
    show(goblin());
    rightClick(0, 19);

    expect(sheetNamed('Goblin Scout')).toHaveAttribute('aria-modal', 'true');
    expect(openMenu()).toBeNull();
    expect(sheetLabels()).toEqual([
      'Rotate Left', 'Rotate Right', 'Roll...', 'Edit Token', 'Add to Initiative', 'Duplicate Token', 'Save as Template',
      'Hide from Players', 'Obscure Identity', 'Send to Spirit Realm', '---', 'Move to Map…', '---', 'Remove from Map',
    ]);
  });

  it('opens on a long-press too', async () => {
    vi.useFakeTimers();
    try {
      render(<MapCanvas />);
      show(goblin());
      const finger = contact('touch', 3);
      finger.down(surface(), at(0, 19));
      act(() => { vi.advanceTimersByTime(600); });
      finger.up(surface(), at(0, 19));
      expect(sheetNamed('Goblin Scout')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says whose a token is and the hit points the viewer may see", () => {
    render(<MapCanvas />);
    show(goblin({ hp: { current: 5, max: 7, temp: 0 } }), hero('char-alice', 'alice'));
    rightClick(0, 19);
    expect(within(sheetNamed('Goblin Scout')).getByText('5 / 7 HP')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    rightClick(2, 19);
    expect(within(sheetNamed('Hero')).getByText("Alice's")).toBeInTheDocument();
  });

  it('keeps itself open for a turn, a click and all', async () => {
    render(<MapCanvas />);
    show(goblin());
    rightClick(0, 19);
    await choose('Rotate Right');

    expect(h.api.updateToken).toHaveBeenCalledWith('campaign-1', 'map-a', 'tok-goblin', { rotation: 45 });
    expect(sheetNamed('Goblin Scout')).toBeInTheDocument();
  });

  it('closes for any other item, which runs', async () => {
    const onEditToken = vi.fn();
    render(<MapCanvas onEditToken={onEditToken} />);
    show(goblin());
    rightClick(0, 19);
    expect(sheetNamed('Goblin Scout')).toBeInTheDocument();
    await choose('Edit Token');

    expect(onEditToken).toHaveBeenCalledWith(expect.objectContaining({ id: 'tok-goblin' }));
    expect(screen.queryByRole('dialog', { name: 'Goblin Scout' })).toBeNull();
  });

  it('moves a token to another map from its second page', async () => {
    render(<MapCanvas />);
    show(goblin());
    rightClick(0, 19);
    fireEvent.click(screen.getByRole('button', { name: 'Move to Map…' }));
    expect(sheetLabels()).toEqual(['Back to Goblin Scout', 'Move to Map…', 'Map B', 'Map C']);
    await choose('Map C');

    expect(h.api.moveTokens).toHaveBeenCalledWith('campaign-1', 'map-a', ['tok-goblin'], 'map-c');
    expect(screen.queryByRole('dialog', { name: 'Goblin Scout' })).toBeNull();
  });

  it('closes on Cancel and on its backdrop', () => {
    render(<MapCanvas />);
    show(goblin());
    rightClick(0, 19);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Goblin Scout' })).toBeNull();

    rightClick(0, 19);
    fireEvent.click(document.querySelector('[data-sheet-backdrop]') as HTMLElement);
    expect(screen.queryByRole('dialog', { name: 'Goblin Scout' })).toBeNull();
  });

  it('closes when the map on screen changes', () => {
    render(<MapCanvas />);
    show(goblin());
    rightClick(0, 19);
    expect(sheetNamed('Goblin Scout')).toBeInTheDocument();
    act(() => { h.set({ currentMap: mapNamed('map-b') }); });
    expect(screen.queryByRole('dialog', { name: 'Goblin Scout' })).toBeNull();
  });

  it("opens a creature's Roll... picker as a sheet at full height", async () => {
    render(<MapCanvas />);
    show(goblin());
    rightClick(0, 19);
    await choose('Roll...');

    const picker = sheetNamed('Roll for Goblin Scout');
    expect(picker).toHaveAttribute('aria-modal', 'true');
    expect(within(picker).getByPlaceholderText('e.g. 2d6+3')).toBeInTheDocument();
  });

  it("opens a character's Roll... picker as a sheet at full height", async () => {
    render(<MapCanvas />);
    show(hero('char-alice', 'alice'));
    rightClick(2, 19);
    await choose('Roll...');

    expect(sheetNamed('Roll for Character')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Loading rolls…')).toBeInTheDocument();
  });
});

describe('the door menu on the compact layout', () => {
  const door = (type: WallSegment['type']): WallSegment => ({ id: 'd1', x1: 100, y1: 100, x2: 200, y2: 100, type });
  function renderWithDoor(type: WallSegment['type']) {
    h.set({ currentMap: mapNamed('map-a', { wallSegments: [door(type)] }) });
    render(<MapCanvas />);
  }
  const rightClickDoor = () => fireEvent.contextMenu(surface(), { clientX: 150, clientY: 104 });

  it("is an action sheet named by the door's state, the emoji shown but not read, with what it may become", () => {
    renderWithDoor('door-closed');
    rightClickDoor();
    expect(sheetNamed('Closed Door')).toBeInTheDocument();
    expect(within(sheetNamed('Closed Door')).getByText('🚪')).toHaveAttribute('aria-hidden', 'true');
    expect(sheetLabels()).toEqual(['Open Door', 'Lock Door']);
    expect(openMenu()).toBeNull();
  });

  it("tells a player a locked door is locked", () => {
    h.set({ userRole: 'PLAYER', memberships: [MEMBERS.me('PLAYER')] });
    renderWithDoor('door-locked');
    rightClickDoor();
    expect(sheetNamed('Locked Door')).toBeInTheDocument();
    expect(sheetLabels()).toEqual(['This door is locked.']);
  });

  it('sends Open Door and closes', () => {
    renderWithDoor('door-closed');
    rightClickDoor();
    expect(sheetNamed('Closed Door')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Door' }));
    expect(sentOf('wall:update').map((p) => (p as { segment: WallSegment }).segment.type)).toEqual(['door-open']);
    expect(screen.queryByRole('dialog', { name: 'Closed Door' })).toBeNull();
  });
});

describe('the token menu from the keyboard on the compact layout', () => {
  it('does not press its first item when the Enter that opened it is held down', async () => {
    render(<MapCanvas />);
    show(goblin());
    act(() => { useGameStore.getState().selectToken('tok-goblin'); });
    const map = screen.getByRole('application', { name: 'Map' });
    map.focus();
    await act(async () => { fireEvent.keyDown(map, { key: 'Enter' }); });
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const first = document.activeElement as HTMLElement;
    expect(first).toHaveTextContent('Rotate Left');

    const held = createEvent.keyDown(first, { key: 'Enter', repeat: true });
    fireEvent(first, held);
    expect(held.defaultPrevented).toBe(true);
  });
});

/** A layout the test can switch, as a tablet turned across 1024 px would. */
let switchLayout: (compact: boolean) => void = () => undefined;
function Switchable({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(true);
  switchLayout = setCompact;
  return <LayoutProvider compact={compact}>{children}</LayoutProvider>;
}

describe('a menu open as the layout switches to the desktop', () => {
  it('is placed and shown as the popover', () => {
    render(<Switchable><MapCanvasOnly /></Switchable>);
    show(goblin());
    rightClick(0, 19);
    expect(sheetNamed('Goblin Scout')).toBeInTheDocument();

    act(() => { switchLayout(false); });
    expect(screen.queryByRole('dialog', { name: 'Goblin Scout' })).toBeNull();
    expect(openMenu()?.style.visibility).toBe('visible');
  });
});

describe('a token near the foot of the screen', () => {
  const rectOf = (r: { left: number; top: number; width: number; height: number }) =>
    ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}) }) as DOMRect;
  const originalDiv = HTMLDivElement.prototype.getBoundingClientRect;
  beforeEach(() => {
    // The map is 400 by 700 at the page's corner; the action sheet stands from 400 px down.
    HTMLDivElement.prototype.getBoundingClientRect = function (this: HTMLDivElement) {
      if (this.hasAttribute('data-action-sheet')) return rectOf({ left: 0, top: 400, width: 400, height: 300 });
      return this.querySelector('canvas') ? rectOf({ left: 0, top: 0, width: 400, height: 700 }) : rectOf({ left: 0, top: 0, width: 0, height: 0 });
    };
  });
  afterEach(() => {
    HTMLDivElement.prototype.getBoundingClientRect = originalDiv;
  });

  it('is panned into the map above its action sheet, so a turn is seen', () => {
    render(<MapCanvas />);
    // Square (2, 1) has its centre at (125, 925) on the map, below the sheet's top at 400.
    show(token('tok-low', 'Low Scout', 2, 1));
    rightClick(2, 1);
    expect(sheetNamed('Low Scout')).toBeInTheDocument();

    // Panned up until the centre is one square above the sheet, at 350.
    mouse.move(surface(), { clientX: 125, clientY: 350 });
    expect(screen.getByText('(2, 1)')).toBeInTheDocument();
  });
});
