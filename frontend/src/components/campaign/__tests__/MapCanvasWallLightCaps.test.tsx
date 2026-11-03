/**
 * The wall and light tools at a map's cap, and when the server refuses what
 * they drew.
 *
 * A map holds at most 5,000 wall segments and 200 light sources. The tools
 * drew a wall or a light as they sent it, and kept it when the server
 * refused it, so the DM's map showed walls and lights the table did not
 * have. Now a tool refuses at the cap before it draws and says why, and an
 * add or a list of walls the server answers with a refusal is taken back,
 * with the server's reason.
 *
 * The stand-ins are those of MapCanvasTools.test.tsx, and the socket also
 * keeps the acknowledgement each edit is sent with, for the test to answer.
 * Canvas drawing is switched off, so the view starts at 100% with no pan:
 * screen pixel (x, y) is map pixel (x, y).
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { CampaignMap } from '@/types';
import type { LightSource, WallSegment } from '@/types/walls';
import { mouse } from '@/test/pointer';
import { MAP_LIMITS, TOO_MANY_LIGHTS_MESSAGE, TOO_MANY_WALLS_MESSAGE } from '@/constants/mapLimits';
import { NO_ANSWER_MESSAGE, WALL_LIGHT_ANSWER_TIMEOUT_MS } from '../map/wallLightCaps';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = { userRole: 'DM' as string, currentMap: null as unknown };
  const handlers = new Map<string, Set<(data: never) => void>>();
  const sent: Array<{ event: string; payload: unknown; answer?: (reply: unknown) => void }> = [];
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
    emit(event: string, payload: unknown, answer?: (reply: unknown) => void) {
      sent.push({ event, payload, answer });
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
  const mapActions = (await import('@/test/viewedMapContext')).mapActionsFor(() => h.state.currentMap, (map) => h.set({ currentMap: map }));
  const noop = () => undefined;
  const campaign = { id: 'campaign-1', name: 'Test', spiritLayerEnabled: false, memberships: [], characters: [] };
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

import MapCanvas from '../MapCanvas';
import { useGameStore } from '@/stores/gameStore';

const seg = (id: string, x1: number, y1: number, x2: number, y2: number): WallSegment => ({ id, x1, y1, x2, y2, type: 'wall' });
/** A plain wall along y 100 from x 100 to 200. */
const WALL_A = seg('a1', 100, 100, 200, 100);
/** Walls enough to fill a map with WALL_A, short ones along the foot of the map, out of the way. */
const filler = (count: number) => Array.from({ length: count }, (_, i) => seg(`f${i}`, 10, 990, 20, 990));
const lamp = (i: number): LightSource => ({ id: `l${i}`, x: 900, y: 900, brightRadius: 1, dimRadius: 2, color: '#ffcc66', enabled: true });

function mapWith(extra: Partial<CampaignMap> = {}): CampaignMap {
  return {
    id: 'map-a', campaignId: 'campaign-1', name: 'Map A', imageUrl: '/api/assets/maps/x',
    width: 20, height: 20, gridSize: 50, tokens: [], wallSegments: [WALL_A], lights: [],
    fogEnabled: false, lightingEnabled: false, globalIllumination: true, explorationEnabled: false,
    ...extra,
  } as unknown as CampaignMap;
}
const fullOfWalls = () => mapWith({ wallSegments: [WALL_A, ...filler(MAP_LIMITS.maxWallSegments - 1)] });

const px = (x: number, y: number) => ({ clientX: x, clientY: y });
function surface(): HTMLCanvasElement {
  const input = document.querySelector<HTMLCanvasElement>('canvas[class*="cursor-"]');
  if (!input) throw new Error('no input canvas');
  return input;
}
function click(p: { clientX: number; clientY: number }) {
  mouse.down(surface(), p, 0);
  mouse.up(surface(), p, 0);
}
function drag(from: { clientX: number; clientY: number }, to: { clientX: number; clientY: number }) {
  mouse.down(surface(), from, 0);
  mouse.move(surface(), to, 1);
  mouse.up(surface(), to, 0);
}
const sentOf = (event: string) => h.sent.filter((s) => s.event === event);
/** Answer the last `event` sent, as the server answers its acknowledgement. */
function answerLast(event: string, reply: unknown) {
  const all = sentOf(event);
  const last = all[all.length - 1];
  if (!last?.answer) throw new Error(`${event} was not sent with an acknowledgement`);
  act(() => { last.answer?.(reply); });
}
/** Choose a wall tool, opening the Walls panel first if it is folded. */
function wallTool(label: string) {
  if (!screen.queryByLabelText(label)) fireEvent.click(screen.getByText('Walls'));
  fireEvent.click(screen.getByLabelText(label));
}
/**
 * The walls the page holds, read from the list it sends when the select
 * tool moves WALL_A down by 50 pixels.
 */
function heldWalls(): WallSegment[] {
  wallTool('Wall select mode');
  drag(px(150, 100), px(150, 150));
  const moved = sentOf('walls:replace');
  const last = moved[moved.length - 1];
  if (!last) throw new Error('no walls:replace was sent');
  return (last.payload as { segments: WallSegment[] }).segments;
}
const lightsShown = () => screen.getByText('Lights').parentElement?.textContent ?? '';

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

// ── At the cap ──────────────────────────────────────────────────────────────

describe('the wall tools on a map of 5,000 walls', () => {
  beforeEach(() => { h.set({ currentMap: fullOfWalls() }); });

  it('draw no further wall, send none, and say why', () => {
    render(<MapCanvas />);
    wallTool('Wall draw mode');

    click(px(500, 500));
    click(px(600, 500));

    expect(sentOf('wall:add')).toEqual([]);
    expect(screen.getByText(TOO_MANY_WALLS_MESSAGE)).toBeInTheDocument();
    expect(heldWalls()).toHaveLength(MAP_LIMITS.maxWallSegments);
  });

  it('draw no door along a wall that would make more, and leave the wall whole', () => {
    render(<MapCanvas />);
    wallTool('Wall draw mode');
    fireEvent.click(screen.getByLabelText('Wall type: Door'));

    click(px(100, 100));
    click(px(150, 100));

    expect(sentOf('wall:remove')).toEqual([]);
    expect(sentOf('wall:add')).toEqual([]);
    expect(screen.getByText(TOO_MANY_WALLS_MESSAGE)).toBeInTheDocument();
    expect(heldWalls().find((w) => w.id === 'a1')).toMatchObject({ x1: 100, x2: 200 });
  });

  it('split no wall in two', () => {
    render(<MapCanvas />);
    wallTool('Wall split mode');

    click(px(140, 103));

    expect(sentOf('wall:remove')).toEqual([]);
    expect(sentOf('wall:add')).toEqual([]);
    expect(screen.getByText(TOO_MANY_WALLS_MESSAGE)).toBeInTheDocument();
  });

  it('close no polygon', () => {
    render(<MapCanvas />);
    wallTool('Polygon wall mode');

    click(px(500, 500));
    click(px(700, 500));
    click(px(700, 700));
    click(px(700, 700));

    expect(sentOf('walls:replace')).toEqual([]);
    expect(screen.getByText(TOO_MANY_WALLS_MESSAGE)).toBeInTheDocument();
    expect(heldWalls()).toHaveLength(MAP_LIMITS.maxWallSegments);
  });

  it('still move a wall, which adds none', () => {
    render(<MapCanvas />);

    expect(heldWalls().find((w) => w.id === 'a1')).toMatchObject({ y1: 150, y2: 150 });
    expect(screen.queryByText(TOO_MANY_WALLS_MESSAGE)).toBeNull();
  });
});

describe('the light tool on a map of 200 lights', () => {
  it('places no further light, sends none, and says why', () => {
    h.set({ currentMap: mapWith({ lights: Array.from({ length: MAP_LIMITS.maxLightSources }, (_, i) => lamp(i)) }) });
    render(<MapCanvas />);
    fireEvent.click(screen.getByText('Lights'));
    fireEvent.click(screen.getByText('Place'));

    click(px(260, 240));

    expect(sentOf('light:add')).toEqual([]);
    expect(screen.getByText(TOO_MANY_LIGHTS_MESSAGE)).toBeInTheDocument();
    expect(lightsShown()).toContain(`(${MAP_LIMITS.maxLightSources})`);
  });
});

// ── Refused by the server ───────────────────────────────────────────────────

describe('a wall or light the server refuses', () => {
  it('takes back a drawn wall, keeps it out of redo, and says why', () => {
    render(<MapCanvas />);
    wallTool('Wall draw mode');
    click(px(500, 500));
    click(px(600, 500));
    const drawn = (sentOf('wall:add')[0].payload as { segment: WallSegment }).segment;

    answerLast('wall:add', { ok: false, error: 'Map not found' });

    expect(screen.getByText('Map not found')).toBeInTheDocument();
    expect(heldWalls().map((w) => w.id)).toEqual(['a1']);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true });
    const sent = sentOf('walls:replace').map((s) => (s.payload as { segments: WallSegment[] }).segments);
    for (const segments of sent) expect(segments.map((w) => w.id)).not.toContain(drawn.id);
  });

  it('keeps a wall the server stores', () => {
    render(<MapCanvas />);
    wallTool('Wall draw mode');
    click(px(500, 500));
    click(px(600, 500));
    const drawn = (sentOf('wall:add')[0].payload as { segment: WallSegment }).segment;

    answerLast('wall:add', { ok: true });

    expect(heldWalls().map((w) => w.id)).toEqual(['a1', drawn.id]);
  });

  it('takes back a polygon, and says why', () => {
    render(<MapCanvas />);
    wallTool('Polygon wall mode');
    click(px(500, 500));
    click(px(700, 500));
    click(px(700, 700));
    click(px(700, 700));

    answerLast('walls:replace', { ok: false, error: 'A wall is outside the map' });

    expect(screen.getByText('A wall is outside the map')).toBeInTheDocument();
    expect(heldWalls().map((w) => w.id)).toEqual(['a1']);
  });

  it('takes back a placed light, and says why', () => {
    h.set({ currentMap: mapWith({ lights: [lamp(1)] }) });
    render(<MapCanvas />);
    fireEvent.click(screen.getByText('Lights'));
    fireEvent.click(screen.getByText('Place'));
    click(px(260, 240));
    expect(lightsShown()).toContain('(2)');

    answerLast('light:add', { ok: false, error: TOO_MANY_LIGHTS_MESSAGE });

    expect(screen.getByText(TOO_MANY_LIGHTS_MESSAGE)).toBeInTheDocument();
    expect(lightsShown()).toContain('(1)');
  });
});

// ── Not answered ───────────────────────────────────────────────────────────

describe('a wall or light the server never answers', () => {
  /** Run `act` with timers faked, then let the answer's time run out. */
  function unanswered(act_: () => void) {
    vi.useFakeTimers();
    try {
      act_();
      act(() => { vi.advanceTimersByTime(WALL_LIGHT_ANSWER_TIMEOUT_MS + 1); });
    } finally {
      vi.useRealTimers();
    }
  }

  it('takes back a drawn wall once the answer is overdue, and says so', () => {
    render(<MapCanvas />);
    wallTool('Wall draw mode');
    unanswered(() => {
      click(px(500, 500));
      click(px(600, 500));
    });

    expect(screen.getByText(NO_ANSWER_MESSAGE)).toBeInTheDocument();
    expect(heldWalls().map((w) => w.id)).toEqual(['a1']);
  });

  it('takes back a placed light once the answer is overdue, and a late answer changes nothing', () => {
    h.set({ currentMap: mapWith({ lights: [lamp(1)] }) });
    render(<MapCanvas />);
    fireEvent.click(screen.getByText('Lights'));
    fireEvent.click(screen.getByText('Place'));
    unanswered(() => click(px(260, 240)));

    expect(screen.getByText(NO_ANSWER_MESSAGE)).toBeInTheDocument();
    expect(lightsShown()).toContain('(1)');
    answerLast('light:add', { ok: true });
    expect(lightsShown()).toContain('(1)');
  });
});

// ── Refusals and the lists sent after them ─────────────────────────────────

describe('a refusal and the lists the page sent after it', () => {
  /** Draw one wall from (500, 500) to (600, 500), and the wall sent. */
  function drawWall(): WallSegment {
    wallTool('Wall draw mode');
    click(px(500, 500));
    click(px(600, 500));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    return (sentOf('wall:add').slice(-1)[0].payload as { segment: WallSegment }).segment;
  }
  /** Close a triangle with the polygon tool, which sends the page's whole list. */
  function closePolygon() {
    wallTool('Polygon wall mode');
    click(px(300, 300));
    click(px(400, 300));
    click(px(400, 400));
    click(px(400, 400));
  }
  /** The walls in the last list the page sent. */
  const lastList = () => {
    const lists = sentOf('walls:replace');
    return (lists[lists.length - 1].payload as { segments: WallSegment[] }).segments;
  };

  // The server refused the wall, then stored the polygon's list, which held
  // it: the server holds the wall, so the page keeps it.
  it('keeps a wall whose refusal comes while a later list that carried it is unanswered, once that list is stored', () => {
    render(<MapCanvas />);
    const wall = drawWall();
    closePolygon();

    answerLast('wall:add', { ok: false, error: TOO_MANY_WALLS_MESSAGE });
    answerLast('walls:replace', { ok: true });

    expect(heldWalls().map((w) => w.id)).toContain(wall.id);
    expect(screen.queryByText(TOO_MANY_WALLS_MESSAGE)).toBeNull();
  });

  it('keeps a wall refused after a later list that carried it was stored', () => {
    render(<MapCanvas />);
    const wall = drawWall();
    closePolygon();

    answerLast('walls:replace', { ok: true });
    answerLast('wall:add', { ok: false, error: TOO_MANY_WALLS_MESSAGE });

    expect(heldWalls().map((w) => w.id)).toContain(wall.id);
  });

  it('takes back a wall, and the list after it, when both are refused', () => {
    render(<MapCanvas />);
    const wall = drawWall();
    closePolygon();

    answerLast('wall:add', { ok: false, error: 'Map not found' });
    answerLast('walls:replace', { ok: false, error: 'Map not found' });

    expect(screen.getByText('Map not found')).toBeInTheDocument();
    expect(heldWalls().map((w) => w.id)).toEqual(['a1']);
    expect(wall.id).not.toBe('a1');
  });

  it('puts a refused move back where it began', () => {
    render(<MapCanvas />);
    wallTool('Wall select mode');
    drag(px(150, 100), px(150, 150));

    answerLast('walls:replace', { ok: false, error: 'A wall is outside the map' });
    closePolygon();

    expect(lastList().find((w) => w.id === 'a1')).toMatchObject({ y1: 100, y2: 100 });
  });

  it('changes nothing, and says nothing, on another map when an answer for the last one arrives', () => {
    render(<MapCanvas />);
    drawWall();
    const wallB = seg('b1', 600, 600, 700, 600);
    act(() => { h.set({ currentMap: mapWith({ id: 'map-b', name: 'Map B', wallSegments: [wallB] }) }); });

    act(() => { sentOf('wall:add')[0].answer?.({ ok: false, error: 'Map not found' }); });
    closePolygon();

    expect(screen.queryByText('Map not found')).toBeNull();
    expect(lastList().map((w) => w.id).slice(0, 1)).toEqual(['b1']);
  });

  // The server kept the walls an undo tried to take away, so the step is
  // kept too: the next Ctrl+Z tries it again.
  it('keeps the step a refused undo took, so the next Ctrl+Z undoes it again', () => {
    render(<MapCanvas />);
    const wall = drawWall();
    answerLast('wall:add', { ok: true });

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(lastList().map((w) => w.id)).toEqual(['a1']);
    answerLast('walls:replace', { ok: false, error: TOO_MANY_WALLS_MESSAGE });
    expect(screen.getByText(TOO_MANY_WALLS_MESSAGE)).toBeInTheDocument();

    const before = sentOf('walls:replace').length;
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(sentOf('walls:replace')).toHaveLength(before + 1);
    expect(lastList().map((w) => w.id)).toEqual(['a1']);
    expect(wall.id).not.toBe('a1');
  });
});
