/**
 * The map's toolbar and its menus: what a screen reader calls the buttons,
 * and their size for a finger. jsdom evaluates no media query, so the size
 * is checked as the classes that set it on a touch screen.
 *
 * The stand-ins are those of MapCanvasTools.test.tsx: the role and current
 * map live in a store the test changes, and the socket records what the page
 * sends. Canvas drawing is switched off.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { CampaignMap, Token } from '@/types';
import type { WallSegment } from '@/types/walls';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'DM' as string,
    currentMap: null as unknown,
    playerSpiritVisible: false as boolean,
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
    id: 'campaign-1', name: 'Test', spiritLayerEnabled: false, status: 'ACTIVE', memberships: [], characters: [],
    maps: [{ id: 'map-a', name: 'Map A' }, { id: 'map-b', name: 'Map B' }],
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
  const client = new Proxy({
    getSocket: () => h.raw,
    onMapChanged: (cb: (data: never) => void) => { h.raw.on('map.changed', cb); },
    off: (event: string, cb: (data: never) => void) => { h.raw.off(event, cb); },
    emitTokenMoveStart: record('token.move.start'),
    emitTokenMove: record('token.move'),
    emitTokenMoveEnd: record('token.move.end'),
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

/** A one-square token; grid y counts up from the bottom row, 0, to the top, 19. */
function token(id: string, name: string, x: number, y: number): Token {
  return {
    id, name, imageUrl: '', position: { x, y }, size: { width: 1, height: 1 },
    layer: 'token', visible: true, type: 'npc', conditions: [],
  } as unknown as Token;
}

/** Map pixel (x, y), which at 100% and no pan is the same screen pixel. */
const px = (x: number, y: number) => ({ clientX: x, clientY: y });
/** The centre of square (x, y). */
const square = (x: number, y: number) => px(x * 50 + 25, (19 - y) * 50 + 25);

function surface(): HTMLCanvasElement {
  const input = document.querySelector<HTMLCanvasElement>('canvas[class*="cursor-"]');
  if (!input) throw new Error('no input canvas');
  return input;
}

const classesOf = (el: Element) => el.className.split(/\s+/);

/** The buttons of the menu open now. */
const menuButtons = () => {
  const first = screen.getByText(/^(Edit Token|Open Door)$/);
  return Array.from(first.parentElement!.querySelectorAll('button'));
};

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.sent.length = 0;
  h.handlers.clear();
  useGameStore.getState().setTokens([]);
  h.set({ userRole: 'DM', currentMap: mapWith(), playerSpiritVisible: false });
});

describe("the toolbar's names", () => {
  // Each button showed only an icon, with its name in a tooltip.
  it('gives every button the name its tooltip shows', () => {
    render(<MapCanvas />);
    fireEvent.click(screen.getByTitle('Ruler — measure distance'));

    const titles = [
      'Zoom Out',
      'Zoom In',
      'Fit to Screen',
      'Toggle Grid',
      'Grid Color: Black',
      'Ruler — measure distance',
      'Ruler color: Amber',
      'AoE Shape — area of effect overlay',
      'Spirit tokens shown, click to hide',
    ];
    for (const title of titles) {
      expect(screen.getByTitle(title)).toHaveAttribute('aria-label', title);
    }
  });

  it('names a button by what it shows now, as its tooltip does', () => {
    render(<MapCanvas />);
    fireEvent.click(screen.getByTitle('Grid Color: Black'));
    fireEvent.click(screen.getByTitle('Spirit tokens shown, click to hide'));

    expect(screen.getByTitle('Grid Color: White')).toHaveAttribute('aria-label', 'Grid Color: White');
    expect(screen.getByTitle('Spirit tokens hidden — click to show'))
      .toHaveAttribute('aria-label', 'Spirit tokens hidden — click to show');
  });
});

describe("the toolbar's size", () => {
  // Its buttons were 34 pixels square, Ping among them.
  it('sizes every button for a finger', () => {
    render(<MapCanvas />);
    fireEvent.click(screen.getByTitle('Ruler — measure distance'));

    const names = [
      'Zoom Out', 'Zoom In', 'Fit to Screen', 'Toggle Grid', 'Grid Color: Black', 'Ruler — measure distance',
      'Ruler color: Amber', 'AoE Shape — area of effect overlay', 'Ping', 'Spirit tokens shown, click to hide',
    ];
    for (const name of names) {
      expect(classesOf(screen.getByRole('button', { name }))).toContain('touch-target');
    }
  });
});

describe('the menus on a touch screen', () => {
  // Each item was 36 pixels tall.
  it("makes the token menu's items, and the maps it moves a token to, tall enough for a finger", () => {
    render(<MapCanvas />);
    act(() => { useGameStore.getState().setTokens([token('tok-goblin', 'Goblin', 0, 19)]); });

    fireEvent.contextMenu(surface(), square(0, 19));
    fireEvent.click(screen.getByText('Move to Map…'));

    const items = menuButtons();
    expect(items.map((b) => b.textContent)).toContain('Map B');
    for (const item of items) expect(classesOf(item)).toContain('pointer-coarse:min-h-11');
  });

  // At 44 pixels an item, the DM's menu for a player's token runs to about
  // 600 pixels, more than a tablet in landscape shows; it went off the
  // bottom of the screen with no way to scroll to its last items. Only there:
  // a scrolling menu would cut the sides off a keyboard's focus ring, and a
  // mouse's menu of 36-pixel items fits.
  it('keeps the token menu and the door menu within the screen on a touch screen, scrolling inside', () => {
    const door: WallSegment = { id: 'd1', x1: 100, y1: 100, x2: 200, y2: 100, type: 'door-closed' };
    h.set({ currentMap: mapWith({ wallSegments: [door] }) });
    render(<MapCanvas />);
    act(() => { useGameStore.getState().setTokens([token('tok-goblin', 'Goblin', 0, 19)]); });
    const capped = ['pointer-coarse:max-h-[calc(100dvh-1rem)]', 'pointer-coarse:overflow-y-auto', 'pointer-coarse:overscroll-contain'];

    fireEvent.contextMenu(surface(), square(0, 19));
    expect(classesOf(screen.getByText('Edit Token').parentElement!)).toEqual(expect.arrayContaining(capped));

    fireEvent.click(document.body);
    fireEvent.contextMenu(surface(), px(150, 104));
    expect(classesOf(screen.getByText('Open Door').parentElement!)).toEqual(expect.arrayContaining(capped));
  });

  // Opening Move to Map… made the menu taller where it already stood, so its
  // foot could pass the bottom of the screen.
  it('places the token menu again when Move to Map… opens, so it stays on the screen', () => {
    render(<MapCanvas />);
    act(() => { useGameStore.getState().setTokens([token('tok-goblin', 'Goblin', 0, 9)]); });

    // Opened at y 525 on a window 768 tall, where it fits below the point.
    fireEvent.contextMenu(surface(), square(0, 9));
    const menu = screen.getByText('Edit Token').parentElement!;
    expect(menu.style.top).toBe('525px');

    // With the maps listed it is 400 tall, so it opens upward from the point.
    menu.getBoundingClientRect = () => ({ left: 25, top: 525, width: 200, height: 400, right: 225, bottom: 925, x: 25, y: 525, toJSON: () => ({}) }) as DOMRect;
    fireEvent.click(screen.getByText('Move to Map…'));
    expect(menu.style.top).toBe('125px');
  });

  it("makes the door menu's items tall enough for a finger", () => {
    const door: WallSegment = { id: 'd1', x1: 100, y1: 100, x2: 200, y2: 100, type: 'door-closed' };
    h.set({ currentMap: mapWith({ wallSegments: [door] }) });
    render(<MapCanvas />);

    fireEvent.contextMenu(surface(), px(150, 104));

    const items = menuButtons();
    expect(items.map((b) => b.textContent)).toEqual(['Open Door', 'Lock Door']);
    for (const item of items) expect(classesOf(item)).toContain('pointer-coarse:min-h-11');
  });
});
