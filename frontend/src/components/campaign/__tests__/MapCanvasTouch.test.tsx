/**
 * The map on a touch screen, and with a pen: what the canvas asks of the
 * browser, which pointers it captures, and what a finger or a pen does.
 *
 * The stand-ins are those of MapCanvasTools.test.tsx: the role and current
 * map live in a store the test changes, and the socket records what the page
 * sends and delivers server events to the listeners the page registered.
 * Canvas drawing is switched off, so the view starts at 100% with no pan:
 * screen pixel (x, y) is map pixel (x, y), and a square is 50 pixels.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import type { CampaignMap, Token } from '@/types';
import { contact, mouse } from '@/test/pointer';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'DM' as string,
    currentMap: null as unknown,
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

function sentOf(event: string): unknown[] {
  return h.sent.filter(([e]) => e === event).map(([, p]) => p);
}

function show(...tokens: Token[]) {
  act(() => { useGameStore.getState().setTokens(tokens); });
}

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.sent.length = 0;
  h.handlers.clear();
  useGameStore.getState().setTokens([]);
  h.set({ userRole: 'DM', currentMap: mapWith() });
});

describe('what the map asks of the browser', () => {
  // The browser's own pan and pinch would scroll or zoom the page.
  it('takes every touch on the map itself', () => {
    render(<MapCanvas />);

    expect(surface().className.split(/\s+/)).toContain('touch-none');
  });

  // A long-press would select text or open the callout over the map; the
  // panels and inputs over it keep their selectable text.
  it('selects no text and opens no callout on the map layers, and only there', () => {
    render(<MapCanvas />);
    const layers = surface().parentElement!;

    expect(layers.className.split(/\s+/)).toEqual(expect.arrayContaining(['select-none', '[-webkit-touch-callout:none]']));
    expect(layers.parentElement!.className).not.toContain('select-none');
  });
});

describe('pointer capture', () => {
  it('holds a finger or a pen from down to lift, and never the mouse', () => {
    const capture = vi.spyOn(Element.prototype, 'setPointerCapture');
    const release = vi.spyOn(Element.prototype, 'releasePointerCapture');
    try {
      render(<MapCanvas />);

      const finger = contact('touch', 7);
      finger.down(surface(), px(500, 500));
      expect(capture).toHaveBeenLastCalledWith(7);
      finger.up(surface(), px(500, 500));
      expect(release).toHaveBeenLastCalledWith(7);

      const pen = contact('pen', 9);
      pen.down(surface(), px(500, 500));
      expect(capture).toHaveBeenLastCalledWith(9);
      pen.cancel(surface());
      expect(release).toHaveBeenLastCalledWith(9);

      mouse.down(surface(), px(500, 500));
      mouse.up(surface(), px(500, 500));
      expect(capture).toHaveBeenCalledTimes(2);
    } finally {
      capture.mockRestore();
      release.mockRestore();
    }
  });
});

describe('a token picked up by a tap', () => {
  // A finger leaves the canvas after every lift, and a pen when it goes out
  // of range. Leaving puts back a token held by the mouse, but not by them.
  it.each(['touch', 'pen'] as const)('stays held when the %s leaves the map, and a second tap puts it down', (kind) => {
    render(<MapCanvas />);
    show(token('tok-goblin', 'Goblin', 0, 19));

    const first = contact(kind, 2);
    first.down(surface(), square(0, 19));
    first.up(surface(), square(0, 19));
    first.leave(surface());
    expect(sentOf('token.move.start')).toHaveLength(1);
    expect(sentOf('token.move')).toEqual([]);

    const second = contact(kind, 3);
    second.down(surface(), square(3, 19));
    second.up(surface(), square(3, 19));
    expect(sentOf('token.move.end')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a', x: 3, y: 19 }]);
  });
});
