/**
 * The map's toolbar and its menus: what a screen reader calls the buttons,
 * their size for a finger, and how the toolbar fits a narrow map. jsdom
 * evaluates no media query and lays nothing out, so the size is checked as
 * the classes that set it on a touch screen, and the fit as the structure
 * that wraps and the places the panels under the toolbar are given from the
 * boxes a browser would measure.
 *
 * The stand-ins are those of MapCanvasTools.test.tsx: the role and current
 * map live in a store the test changes, and the socket records what the page
 * sends. Canvas drawing is switched off.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { CampaignMap, Token } from '@/types';
import type { WallSegment } from '@/types/walls';
import { contact } from '@/test/pointer';

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

describe('the toolbar on a narrow map', () => {
  // On a map too narrow for one row it was cut off at the map's edge, Ping
  // with it. It wraps now, between groups that stay together.
  it('wraps between groups, keeping the zoom buttons with their readout and the measuring tools with Ping', () => {
    render(<MapCanvas />);

    const zoom = screen.getByRole('button', { name: 'Zoom Out' }).parentElement!;
    const measuring = screen.getByRole('button', { name: 'Ping' }).parentElement!;
    expect(screen.getByRole('button', { name: 'Zoom In' }).parentElement).toBe(zoom);
    expect(screen.getByText(/^\d+%$/).parentElement).toBe(zoom);
    expect(screen.getByRole('button', { name: 'AoE Shape — area of effect overlay' }).parentElement).toBe(measuring);
    expect(screen.getByRole('button', { name: 'Ruler — measure distance' }).parentElement).toBe(measuring);
    expect(measuring).not.toBe(zoom);
    const toolbar = zoom.parentElement!;
    expect(measuring.parentElement).toBe(toolbar);
    expect(classesOf(toolbar)).toContain('flex-wrap');
  });

  // At 44 pixels a button, a DM's toolbar was 3 pixels too wide for one row
  // on an iPad Pro 11 in landscape with both side panels at their minimums.
  // Its zoom readout, 64 pixels for at most "300%", is 48 there.
  it('narrows the zoom readout on a touch screen', () => {
    render(<MapCanvas />);

    expect(classesOf(screen.getByText(/^\d+%$/))).toEqual(expect.arrayContaining(['min-w-16', 'pointer-coarse:min-w-12']));
  });

  // The band spans the map's width under the toolbar. The strip of it beside
  // the toolbar and the label is the map's: a click, a tap, a long-press or
  // the wheel there reaches the map.
  it('lets the map take what lands in the band beside the toolbar and the label', () => {
    h.set({ userRole: 'PLAYER', playerSpiritVisible: true });
    render(<MapCanvas />);

    const toolbar = screen.getByRole('button', { name: 'Zoom Out' }).parentElement!.parentElement!;
    const label = screen.getByText('Spirit Realm').closest('.animate-pulse-soft')!;
    expect(classesOf(toolbar.parentElement!)).toContain('pointer-events-none');
    expect(classesOf(toolbar)).toContain('pointer-events-auto');
    expect(classesOf(label)).toContain('pointer-events-auto');
  });

  // The label sat over the toolbar's right end, Ping under it, wherever the
  // two met.
  it('shares a band with the spirit realm label, which goes under the toolbar when they do not fit side by side', () => {
    h.set({ userRole: 'PLAYER', playerSpiritVisible: true });
    render(<MapCanvas />);

    const toolbar = screen.getByRole('button', { name: 'Zoom Out' }).parentElement!.parentElement!;
    const label = screen.getByText('Spirit Realm').closest('.animate-pulse-soft')!;
    expect(label.parentElement).toBe(toolbar.parentElement);
    expect(classesOf(toolbar.parentElement!)).toContain('flex-wrap');
    expect(classesOf(label)).toContain('ml-auto');
  });
});

/** A box at `left, top` of `width` by `height`, as getBoundingClientRect gives it. */
const box = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

describe('what sits under the toolbar', () => {
  const observed: ResizeObserverCallback[] = [];
  class RecordingResizeObserver {
    constructor(callback: ResizeObserverCallback) { observed.push(callback); }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const realObserver = window.ResizeObserver;

  beforeEach(() => {
    observed.length = 0;
    Object.defineProperty(window, 'ResizeObserver', { value: RecordingResizeObserver, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(window, 'ResizeObserver', { value: realObserver, configurable: true });
    vi.unstubAllGlobals();
  });

  /** A touch screen's pointer, as `(pointer: coarse)` answers it. */
  function coarsePointer() {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(pointer: coarse)', media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    }));
  }

  /**
   * The boxes a browser would give a map `width` wide at the page's top left
   * corner, with the toolbar's groups at the boxes given (left, top, width,
   * height, from the map's corner), and Put back, while it shows, 254 wide
   * and `barHeight` tall at the top it is given; then a resize, as a wrap or
   * a change of pointer makes one.
   */
  function layOut(width: number, groups: Array<[number, number, number, number]>, barHeight = 52) {
    const toolbar = screen.getByRole('button', { name: 'Zoom Out' }).parentElement!.parentElement!;
    const band = toolbar.parentElement!;
    const map = band.parentElement!;
    const place = (el: Element, rect: DOMRect) => { (el as HTMLElement).getBoundingClientRect = () => rect; };
    const right = Math.max(...groups.map(([l, , w]) => l + w)) + 9;
    const bottom = Math.max(...groups.map(([, t, , gh]) => t + gh)) + 9;
    place(map, box(0, 0, width, 600));
    place(band, box(16, 16, width - 16, bottom - 16));
    place(toolbar, box(16, 16, right - 16, bottom - 16));
    Array.from(toolbar.children).forEach((g, i) => place(g, box(...groups[i])));
    const bar = screen.queryByRole('button', { name: 'Put back' })?.parentElement;
    // top-20 until it is given a top of its own.
    if (bar) bar.getBoundingClientRect = () => box((width - 254) / 2, parseFloat(bar.style.top) || 80, 254, barHeight);
    act(() => { for (const callback of observed) callback([], {} as ResizeObserver); });
  }

  const aoePanel = () => screen.getByText('AoE Shape').parentElement!;
  const putBackBar = () => screen.getByRole('button', { name: 'Put back' }).parentElement!;
  const toolStack = () => screen.getByTitle(/Drag to move the panels/).parentElement!;
  const openAoE = () => fireEvent.click(screen.getByRole('button', { name: 'AoE Shape — area of effect overlay' }));

  /** The DM holds the goblin with a tap of a finger, so the Put back bar shows. */
  function holdByTap() {
    act(() => { useGameStore.getState().setTokens([token('tok-goblin', 'Goblin', 10, 5)]); });
    const finger = contact('touch', 1);
    finger.down(surface(), square(10, 5));
    finger.up(surface(), square(10, 5));
    finger.leave(surface());
  }

  // One row of 34-pixel buttons on a map 754 wide, as on a 1440-pixel
  // screen with the side panels at their defaults.
  it('keeps the AoE panel and the tool stack in their places under one row of a mouse’s buttons', () => {
    render(<MapCanvas />);
    openAoE();
    layOut(754, [[25, 25, 148, 34], [181, 25, 127, 34], [316, 25, 169, 34], [493, 25, 43, 34]]);

    expect(aoePanel().style.top).toBe('');
    expect(aoePanel().style.maxHeight).toBe('');
    expect(classesOf(aoePanel())).toContain('top-12');
    expect(toolStack().style.top).toBe('3.5rem');
  });

  // A pen's hold on such a screen shows Put back at its own place.
  it('keeps Put back in its place under one row of a mouse’s buttons', () => {
    render(<MapCanvas />);
    holdByTap();
    layOut(754, [[25, 25, 148, 34], [181, 25, 127, 34], [316, 25, 169, 34], [493, 25, 43, 34]]);

    expect(putBackBar().style.top).toBe('');
  });

  // A map 420 wide, as a Galaxy Tab S9's in landscape between the side
  // panels at their minimums: the measuring tools and the spirit toggle
  // wrap onto a second row.
  it('starts them under the toolbar when it wraps onto a second row', () => {
    render(<MapCanvas />);
    openAoE();
    layOut(420, [[25, 25, 148, 34], [181, 25, 127, 34], [25, 67, 169, 34], [202, 67, 43, 34]]);

    expect(aoePanel().style.top).toBe('118px');
    expect(toolStack().style.top).toBe('118px');
  });

  // Both started at the band's foot, Put back over the AoE panel's top
  // right, its shape buttons among what it covered.
  it('starts the AoE panel under Put back while a token is held, and back under the toolbar after', () => {
    render(<MapCanvas />);
    holdByTap();
    openAoE();
    layOut(420, [[25, 25, 148, 34], [181, 25, 127, 34], [25, 67, 169, 34], [202, 67, 43, 34]], 62);

    expect(putBackBar().style.top).toBe('118px');
    expect(aoePanel().style.top).toBe('188px');

    fireEvent.click(screen.getByRole('button', { name: 'Put back' }));
    expect(aoePanel().style.top).toBe('118px');
  });

  // Moved down, the panel ran past the map's foot on a short tablet, and the
  // map's column scrolled.
  it('keeps a moved AoE panel within the map, scrolling inside', () => {
    render(<MapCanvas />);
    openAoE();
    layOut(420, [[25, 25, 148, 34], [181, 25, 127, 34], [25, 67, 169, 34], [202, 67, 43, 34]]);

    expect(aoePanel().style.maxHeight).toContain('118px');
    expect(aoePanel().style.overflowY).toBe('auto');
  });

  // A touch screen's 44-pixel buttons in one row on a map 590 wide, as an
  // iPad Pro 11's in landscape with both side panels at their minimums: the
  // toolbar is taller, and its buttons reach under the tool stack's corner.
  it('starts them under the toolbar on a touch screen, and the stack too where the buttons reach its corner', () => {
    coarsePointer();
    render(<MapCanvas />);
    holdByTap();
    openAoE();
    layOut(590, [[25, 25, 152, 44], [185, 25, 157, 44], [350, 25, 157, 44], [515, 25, 53, 44]], 62);

    expect(putBackBar().style.top).toBe('86px');
    expect(aoePanel().style.top).toBe('156px');
    expect(toolStack().style.top).toBe('86px');
  });

  it('leaves the stack in its corner on a touch screen where the buttons end before it', () => {
    coarsePointer();
    render(<MapCanvas />);
    layOut(1200, [[25, 25, 152, 44], [185, 25, 157, 44], [350, 25, 157, 44], [515, 25, 53, 44]]);

    expect(toolStack().style.top).toBe('3.5rem');
  });
});
