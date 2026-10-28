/**
 * The map's chrome on the compact layout: the band's one row and Map
 * controls. jsdom evaluates no media query and lays nothing out, so a size
 * is checked as the classes that set it, and a place as the one given from
 * the boxes a browser would measure.
 *
 * The stand-ins are MapCanvasToolbar.test.tsx's: the role and current map
 * live in a store the test changes, and the socket records what the page
 * sends. Canvas drawing is switched off.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import type { CampaignMap } from '@/types';

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
  const campaign = {
    id: 'campaign-1', name: 'Test', spiritLayerEnabled: false, status: 'ACTIVE', playersMayDraw: true,
    memberships: [], characters: [], maps: [{ id: 'map-a', name: 'Map A' }],
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

/** The map as the compact layout draws it. */
function MapCanvas() {
  return (
    <LayoutProvider compact>
      <MapCanvasOnly />
    </LayoutProvider>
  );
}

const classesOf = (el: Element) => el.className.split(/\s+/);

/** A box at `left, top` of `width` by `height`, as getBoundingClientRect gives it. */
const box = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

const toolbar = () => screen.getByRole('group', { name: 'Map tools' });
const mapContainer = () => screen.getByRole('application', { name: 'Map' }).parentElement!;
const mapControlsButton = () => screen.getByRole('button', { name: 'More map controls' });
const mapControlsSheet = () => screen.getByRole('dialog', { name: 'Map controls' });

/** The rows of the Map controls sheet, by their labels, a rule as ---. */
function sheetRows(): string[] {
  const page = mapControlsSheet().querySelector<HTMLElement>('[data-action-sheet-page]')!;
  return Array.from(page.children).map((row) => (row.getAttribute('role') === 'separator' ? '---' : row.textContent!.trim()));
}

/** Open Map controls and press the row named `label`. */
function pressRow(label: string) {
  if (!screen.queryByRole('dialog', { name: 'Map controls' })) fireEvent.click(mapControlsButton());
  fireEvent.click(within(mapControlsSheet()).getByRole('button', { name: label }));
}

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.sent.length = 0;
  useGameStore.getState().setTokens([]);
  h.set({ userRole: 'DM', currentMap: mapWith() });
});

describe("the band's one row", () => {
  it('holds Zoom Out, the zoom, Zoom In, Ping, Draw and Map controls, in that order, and nothing else', () => {
    render(<MapCanvas />);

    const names = within(toolbar()).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent!.trim());
    expect(names).toEqual(['Zoom Out', 'Zoom In', 'Ping', 'Draw', 'More map controls']);
    expect(toolbar()).toHaveTextContent('100%');
    for (const name of ['Fit to Screen', 'Toggle Grid', 'Ruler — measure distance', 'AoE Shape — area of effect overlay', /Spirit tokens/]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('is one row across the map, clear of the notch on either side', () => {
    render(<MapCanvas />);

    const band = toolbar().parentElement!;
    expect(classesOf(band)).toEqual(expect.arrayContaining([
      'left-[max(0.5rem,env(safe-area-inset-left))]', 'right-[max(0.5rem,env(safe-area-inset-right))]',
    ]));
    expect(classesOf(toolbar())).toContain('w-full');
    expect(classesOf(toolbar())).not.toContain('flex-wrap');
  });

  it('sizes every button for a finger', () => {
    render(<MapCanvas />);
    for (const button of within(toolbar()).getAllByRole('button')) expect(classesOf(button)).toContain('touch-target');
  });

  it('leaves Ping and Draw out with no map, and Draw out for a player who may not draw', () => {
    h.set({ currentMap: null });
    const { unmount } = render(<MapCanvas />);
    expect(within(toolbar()).queryByRole('button', { name: 'Ping' })).toBeNull();
    expect(within(toolbar()).queryByRole('button', { name: 'Draw' })).toBeNull();
    unmount();

    h.set({ userRole: 'PLAYER', currentMap: mapWith({ imageUrl: '' }) });
    render(<MapCanvas />);
    expect(within(toolbar()).getByRole('button', { name: 'Ping' })).toBeInTheDocument();
    expect(within(toolbar()).queryByRole('button', { name: 'Draw' })).toBeNull();
  });

  it('shows the word More beside the icon, and the icon alone on a screen under 384 pixels wide', () => {
    render(<MapCanvas />);
    const word = within(mapControlsButton()).getByText('More');
    expect(classesOf(word)).toContain('max-[24rem]:sr-only');
  });

  it('arms Ping and opens Draw as the toolbar does', () => {
    render(<MapCanvas />);
    fireEvent.click(screen.getByRole('button', { name: 'Ping' }));
    expect(screen.getByRole('button', { name: 'Ping' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Draw' }));
    expect(screen.getByRole('button', { name: 'Draw' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Map controls', () => {
  it('opens a sheet named Map controls, and says so', () => {
    render(<MapCanvas />);
    expect(mapControlsButton()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(mapControlsButton()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(mapControlsButton());

    expect(mapControlsSheet()).toHaveAttribute('aria-modal', 'true');
    expect(mapControlsButton()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(within(mapControlsSheet()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Map controls' })).toBeNull();
  });

  it('holds what the row leaves out, for the DM', () => {
    render(<MapCanvas />);
    fireEvent.click(mapControlsButton());
    expect(sheetRows()).toEqual([
      'Fit to Screen', 'Hide grid', 'Grid Color: Black', '---', 'Ruler', 'AoE Shape', '---', 'Hide spirit tokens',
    ]);
  });

  it('holds no spirit tokens for a player, and no ruler or AoE shape with no map', () => {
    h.set({ userRole: 'PLAYER' });
    const { unmount } = render(<MapCanvas />);
    fireEvent.click(mapControlsButton());
    expect(sheetRows()).toEqual(['Fit to Screen', 'Hide grid', 'Grid Color: Black', '---', 'Ruler', 'AoE Shape']);
    unmount();

    h.set({ currentMap: null });
    render(<MapCanvas />);
    fireEvent.click(mapControlsButton());
    expect(sheetRows()).toEqual(['Fit to Screen', 'Hide grid', 'Grid Color: Black']);
  });

  it('fits the map to the screen and closes', () => {
    render(<MapCanvas />);
    mapContainer().getBoundingClientRect = () => box(0, 0, 400, 600);
    act(() => { window.dispatchEvent(new Event('resize')); });

    pressRow('Fit to Screen');

    // 90 percent of the narrower side over the map's 1,000 pixels.
    expect(toolbar()).toHaveTextContent('36%');
    expect(screen.queryByRole('dialog', { name: 'Map controls' })).toBeNull();
  });

  it('hides and shows the grid, offering its colour while it shows', () => {
    render(<MapCanvas />);
    pressRow('Hide grid');
    fireEvent.click(mapControlsButton());
    expect(sheetRows().slice(0, 3)).toEqual(['Fit to Screen', 'Show grid', '---']);

    pressRow('Show grid');
    fireEvent.click(mapControlsButton());
    expect(sheetRows()).toContain('Grid Color: Black');
  });

  it('goes round the grid colours and the ruler colours with the sheet kept open', () => {
    render(<MapCanvas />);
    pressRow('Grid Color: Black');
    expect(sheetRows()).toContain('Grid Color: White');

    fireEvent.click(within(mapControlsSheet()).getByRole('button', { name: 'Ruler' }));
    pressRow('Ruler color: Amber');
    expect(sheetRows()).toContain('Ruler color: Purple');
    pressRow('Ruler color: Purple');
    expect(sheetRows()).toContain('Ruler color: Black');
  });

  it('takes the ruler out and puts it away, closing as it does', () => {
    render(<MapCanvas />);
    pressRow('Ruler');
    expect(screen.queryByRole('dialog', { name: 'Map controls' })).toBeNull();

    fireEvent.click(mapControlsButton());
    expect(sheetRows()).toEqual(expect.arrayContaining(['Put the ruler away', 'Ruler color: Amber']));
    pressRow('Put the ruler away');
    fireEvent.click(mapControlsButton());
    expect(sheetRows()).toContain('Ruler');
    expect(sheetRows()).not.toContain('Ruler color: Amber');
  });

  it('opens the AoE Shape panel and puts it away', () => {
    render(<MapCanvas />);
    pressRow('AoE Shape');
    expect(screen.getByText('AoE Shape', { selector: 'p' })).toBeInTheDocument();

    pressRow('Put the AoE shape away');
    expect(screen.queryByText('AoE Shape', { selector: 'p' })).toBeNull();
  });

  it('puts Draw away for the ruler and the AoE shape, as their buttons do', () => {
    render(<MapCanvas />);
    fireEvent.click(screen.getByRole('button', { name: 'Draw' }));
    pressRow('Ruler');
    expect(screen.getByRole('button', { name: 'Draw' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Draw' }));
    pressRow('AoE Shape');
    expect(screen.getByRole('button', { name: 'Draw' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('hides and shows the spirit tokens for the DM', () => {
    render(<MapCanvas />);
    pressRow('Hide spirit tokens');
    fireEvent.click(mapControlsButton());
    expect(sheetRows()).toContain('Show spirit tokens');
  });

  it('gives the focus back to Map controls as it closes', () => {
    render(<MapCanvas />);
    mapControlsButton().focus();
    fireEvent.click(mapControlsButton());
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Map controls' })).toBeNull();
    expect(mapControlsButton()).toHaveFocus();
  });

  it('is not on the desktop, whose toolbar keeps every button', () => {
    render(<MapCanvasOnly />);
    expect(screen.queryByRole('button', { name: 'More map controls' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Map tools' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Fit to Screen' })).toBeInTheDocument();
  });
});

describe('what sits under the band', () => {
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
  });

  /**
   * The boxes of a map 360 wide at the page's top left corner, the band a
   * row of 34-pixel buttons, as a mouse has them, 8 from its top; then a
   * resize, as a browser reports.
   */
  function layOut() {
    const band = toolbar().parentElement!;
    const place = (el: Element, rect: DOMRect) => { (el as HTMLElement).getBoundingClientRect = () => rect; };
    place(mapContainer(), box(0, 0, 360, 560));
    place(band, box(8, 8, 344, 46));
    place(toolbar(), box(8, 8, 344, 46));
    Array.from(toolbar().children).forEach((el, i) => place(el, box(14 + i * 40, 14, 34, 34)));
    act(() => { for (const callback of observed) callback([], {} as ResizeObserver); });
  }

  // Under one row of a mouse's buttons the AoE panel keeps its place on the
  // desktop, which on the compact layout is over the band's left end.
  it('starts the AoE panel under the band with a mouse too', () => {
    render(<MapCanvas />);
    pressRow('AoE Shape');
    layOut();

    expect(screen.getByText('AoE Shape', { selector: 'p' }).parentElement!.style.top).toBe('62px');
  });

  it('starts the DM’s tool stack under the band, which spans the map', () => {
    render(<MapCanvas />);
    layOut();

    expect(screen.getByTitle(/Drag to move the panels/).parentElement!.style.top).toBe('62px');
  });
});
