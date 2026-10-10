/**
 * Editing the map, and keeping it in step with the server, driven through
 * MapCanvas itself: wall undo and shortcuts, wall and light events, map
 * changes after a role change, rejoins, map settings and token removal.
 *
 * The campaign, socket and sign-in contexts are replaced by small stand-ins:
 * the campaign's current map and the viewer's role live in a store the test
 * changes, and the socket records what the page emits and lets the test
 * deliver server events to the listeners the page registered. Canvas drawing
 * is switched off; what is checked is what the page sends and what its
 * panels show.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Map as CampaignMap } from '@/types';
import type { WallSegment } from '@/types/walls';


const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'DM' as string,
    currentMap: null as unknown,
    joinedEpoch: 1,
  };
  const handlers = new Map<string, Set<(data: never) => void>>();
  const emitted: Array<[string, unknown]> = [];
  const setPlayerSpiritVisible = vi.fn();
  const deleteToken = vi.fn();
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
      emitted.push([event, payload]);
      return raw;
    },
  };
  return {
    state,
    setPlayerSpiritVisible,
    deleteToken,
    handlers,
    emitted,
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

vi.mock('@/contexts/CampaignContext', async () => {
  const { useSyncExternalStore } = await import('react');
  const setCurrentMap = (next: unknown) => {
    h.set({ currentMap: typeof next === 'function' ? (next as (p: unknown) => unknown)(h.state.currentMap) : next });
  };
  const noop = () => undefined;
  const campaign = { id: 'campaign-1', name: 'Test', spiritLayerEnabled: false, memberships: [], characters: [] };
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
        setPlayerSpiritVisible: h.setPlayerSpiritVisible,
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
  const client = new Proxy({
    getSocket: () => h.raw,
    onMapChanged: (cb: (data: never) => void) => { h.raw.on('map.changed', cb); },
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
      return { socket: client, joinedEpoch: h.state.joinedEpoch, status: 'connected', reconnectCount: 0 };
    },
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'dm-user', displayName: 'The DM' } }),
}));

vi.mock('@/services/map.service', () => ({
  default: { updateMap: vi.fn(), getMaps: vi.fn().mockResolvedValue([]), getMap: vi.fn() },
}));

vi.mock('@/services/api', () => {
  const client = new Proxy({}, {
    get: (_target, prop: string) => (prop === 'deleteToken' ? h.deleteToken : vi.fn().mockResolvedValue({})),
  });
  return { api: client, default: client };
});

import MapCanvas from '../MapCanvas';
import { useGameStore } from '@/stores/gameStore';
import type { Token } from '@/types';

const wall = (id: string, x: number, type: WallSegment['type'] = 'wall'): WallSegment => ({ id, x1: x, y1: 100, x2: x + 100, y2: 100, type });

function mapWith(id: string, walls: WallSegment[]): CampaignMap {
  return {
    id,
    campaignId: 'campaign-1',
    name: `Map ${id}`,
    imageUrl: '/api/assets/maps/x',
    width: 20,
    height: 20,
    gridSize: 50,
    tokens: [],
    wallSegments: walls,
    lights: [],
    fogEnabled: false,
    lightingEnabled: false,
    globalIllumination: true,
    explorationEnabled: false,
  } as unknown as CampaignMap;
}

/** Deliver a server event to every listener the page registered for it. */
function fire(event: string, payload: unknown) {
  act(() => {
    h.handlers.get(event)?.forEach((fn) => (fn as (data: unknown) => void)(payload));
  });
}

function emittedOf(event: string): unknown[] {
  return h.emitted.filter(([e]) => e === event).map(([, p]) => p);
}

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.emitted.length = 0;
  h.setPlayerSpiritVisible.mockClear();
  h.deleteToken.mockReset().mockResolvedValue({});
  useGameStore.getState().setTokens([]);
  h.handlers.clear();
  h.set({ userRole: 'DM', joinedEpoch: 1, currentMap: mapWith('map-a', [wall('a1', 100), wall('a2', 300)]) });
});

function openWallSelect() {
  fireEvent.click(screen.getByText('Walls'));
  fireEvent.click(screen.getByLabelText('Wall select mode'));
}

/** A key pressed with nothing focused, as on the map. */
function press(key: string, opts: { ctrlKey?: boolean; shiftKey?: boolean } = {}) {
  return fireEvent.keyDown(document.body, { key, ...opts });
}

describe('wall undo after a map switch', () => {
  it('has nothing to undo on the new map, so Ctrl+Z writes nothing to it', () => {
    render(<MapCanvas />);
    openWallSelect();
    press('a', { ctrlKey: true });
    press('Delete');
    expect(emittedOf('walls:replace')).toHaveLength(1);

    act(() => { h.set({ currentMap: mapWith('map-b', [wall('b1', 100), wall('b2', 300), wall('b3', 500)]) }); });
    h.emitted.length = 0;
    press('z', { ctrlKey: true });

    expect(emittedOf('walls:replace')).toEqual([]);
  });

  it('turns the Undo button off on the new map', () => {
    render(<MapCanvas />);
    openWallSelect();
    press('a', { ctrlKey: true });
    press('Delete');
    expect(screen.getByLabelText('Undo wall edit')).toBeEnabled();

    act(() => { h.set({ currentMap: mapWith('map-b', [wall('b1', 100)]) }); });

    expect(screen.getByLabelText('Undo wall edit')).toBeDisabled();
  });
});

describe('wall shortcuts while typing', () => {
  function renderWithChat() {
    render(
      <>
        <MapCanvas />
        <textarea aria-label="Chat message" />
        <input aria-label="Note title" />
      </>
    );
    return {
      chat: screen.getByLabelText('Chat message'),
      note: screen.getByLabelText('Note title'),
    };
  }

  it('lets Backspace reach the chat box and deletes no selected walls', () => {
    const { chat } = renderWithChat();
    openWallSelect();
    press('a', { ctrlKey: true });

    chat.focus();
    const reachedTheBox = fireEvent.keyDown(chat, { key: 'Backspace' });
    fireEvent.keyDown(chat, { key: 'Delete' });

    expect(emittedOf('walls:replace')).toEqual([]);
    expect(screen.getByText('(2)')).toBeInTheDocument();
    expect(reachedTheBox).toBe(true);
  });

  it('does not undo or redo a wall edit on Ctrl+Z or Ctrl+Y in a text box', () => {
    const { note } = renderWithChat();
    openWallSelect();
    press('a', { ctrlKey: true });
    press('Delete');
    expect(emittedOf('walls:replace')).toHaveLength(1);

    note.focus();
    const undoReached = fireEvent.keyDown(note, { key: 'z', ctrlKey: true });
    const redoReached = fireEvent.keyDown(note, { key: 'y', ctrlKey: true });

    expect(emittedOf('walls:replace')).toHaveLength(1);
    expect(undoReached).toBe(true);
    expect(redoReached).toBe(true);
  });

  it('leaves Ctrl+A and the arrow keys to a text box', () => {
    const { note } = renderWithChat();
    openWallSelect();

    note.focus();
    expect(fireEvent.keyDown(note, { key: 'a', ctrlKey: true })).toBe(true);
    note.blur();
    press('Delete');
    expect(emittedOf('walls:replace')).toEqual([]);

    press('a', { ctrlKey: true });
    note.focus();
    expect(fireEvent.keyDown(note, { key: 'ArrowRight' })).toBe(true);
    expect(emittedOf('walls:replace')).toEqual([]);
  });

  it('keeps the selection when Escape is pressed in a text box', () => {
    const { note } = renderWithChat();
    openWallSelect();
    press('a', { ctrlKey: true });

    note.focus();
    fireEvent.keyDown(note, { key: 'Escape' });
    note.blur();
    press('Delete');

    expect(emittedOf('walls:replace')).toEqual([{ mapId: 'map-a', segments: [] }].map((p) => expect.objectContaining(p)));
  });

  it('sends the edit on a page served over plain HTTP, where crypto.randomUUID is missing', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      render(<MapCanvas />);
      openWallSelect();
      press('a', { ctrlKey: true });
      press('Delete');

      expect(emittedOf('walls:replace')).toEqual([expect.objectContaining({ mapId: 'map-a', segments: [] })]);
    } finally {
      if (original) Object.defineProperty(globalThis.crypto, 'randomUUID', original);
      else delete (globalThis.crypto as { randomUUID?: unknown }).randomUUID;
    }
  });

  it('still works with focus on a tool button', () => {
    render(<MapCanvas />);
    openWallSelect();
    const selectButton = screen.getByLabelText('Wall select mode');
    selectButton.focus();

    fireEvent.keyDown(selectButton, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(selectButton, { key: 'Delete' });

    expect(emittedOf('walls:replace')).toEqual([expect.objectContaining({ mapId: 'map-a', segments: [] })]);
  });
});

describe('wall and light events on the DM page', () => {
  const door = wall('d1', 100, 'door-closed');
  const other = wall('a2', 300);
  const lastReplace = () => {
    const all = emittedOf('walls:replace');
    return all[all.length - 1] as { segments: WallSegment[] } | undefined;
  };

  beforeEach(() => {
    h.set({ currentMap: mapWith('map-a', [door, other]) });
  });

  it("applies a player's door toggle, so the DM's next bulk edit keeps it", () => {
    render(<MapCanvas />);
    fire('wall:updated', { mapId: 'map-a', segment: { ...door, type: 'door-open' } });

    openWallSelect();
    press('a', { ctrlKey: true });
    press('ArrowRight');

    expect(lastReplace()?.segments.find((s) => s.id === 'd1')?.type).toBe('door-open');
  });

  it("keeps a player's door toggle through the DM's Undo", () => {
    render(<MapCanvas />);
    openWallSelect();
    press('a', { ctrlKey: true });
    press('ArrowRight');
    fire('wall:updated', { mapId: 'map-a', segment: { ...door, x1: door.x1 + 1, x2: door.x2 + 1, type: 'door-open' } });

    press('z', { ctrlKey: true });

    expect(lastReplace()?.segments.find((s) => s.id === 'd1')).toEqual({ ...door, type: 'door-open' });
  });

  it('shows walls added or replaced elsewhere, such as through the API', () => {
    render(<MapCanvas />);
    fire('wall:added', { mapId: 'map-a', segment: wall('a3', 500) });
    expect(screen.getByText('(3)')).toBeInTheDocument();

    fire('walls:replaced', { mapId: 'map-a', segments: [wall('r1', 100)] });
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('shows a light added elsewhere', () => {
    render(<MapCanvas />);
    fire('light:added', { mapId: 'map-a', light: { id: 'l1', x: 100, y: 100, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true } });
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('skips only the echo of its own edit', () => {
    render(<MapCanvas />);
    openWallSelect();
    press('a', { ctrlKey: true });
    press('Delete');
    const [deleted] = emittedOf('walls:replace') as Array<{ opId?: unknown }>;
    expect(typeof deleted.opId).toBe('string');

    press('z', { ctrlKey: true });
    expect(screen.getByText('(2)')).toBeInTheDocument();

    // The delete's echo arrives after the undo: it is this page's own, and
    // the walls stay as the undo left them.
    fire('walls:replaced', { mapId: 'map-a', segments: [], opId: deleted.opId });
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('sends an id with every wall and light edit', () => {
    const lamp = { id: 'l1', x: 100, y: 100, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true };
    h.set({ currentMap: { ...mapWith('map-a', [door, other]), lights: [lamp] } });
    render(<MapCanvas />);
    openWallSelect();
    press('a', { ctrlKey: true });
    press('ArrowLeft');
    press('Delete');
    fireEvent.click(screen.getByText('Lights'));
    fireEvent.click(screen.getByText('Clear All (1)'));
    fireEvent.click(screen.getByText('Confirm Clear All'));

    const edits = h.emitted.filter(([event]) => /^(wall|walls|light|lights):(add|remove|update|replace)$/.test(event));
    expect(edits.length).toBeGreaterThan(0);
    for (const [, payload] of edits) expect(typeof (payload as { opId?: unknown }).opId).toBe('string');
  });

  it('applies what arrived while the DM was a player, after the DM seat comes back', () => {
    render(<MapCanvas />);
    act(() => { h.set({ userRole: 'PLAYER' }); });
    fire('wall:added', { mapId: 'map-a', segment: wall('a3', 500) });
    act(() => { h.set({ userRole: 'DM' }); });

    expect(screen.getByText('(3)')).toBeInTheDocument();
  });
});

describe('map changes after a role change without a reload', () => {
  const changed = (spiritVisible: boolean) => ({ mapId: 'map-a', mapData: mapWith('map-a', []), spiritVisible });

  it('no longer tracks a crossing to the spirit realm for a player who became DM', () => {
    h.set({ userRole: 'PLAYER' });
    render(<MapCanvas />);
    act(() => { h.set({ userRole: 'DM' }); });

    fire('map.changed', changed(true));

    expect(h.setPlayerSpiritVisible).not.toHaveBeenCalled();
  });

  it('tracks their own crossing for a DM who became a player', () => {
    render(<MapCanvas />);
    act(() => { h.set({ userRole: 'PLAYER' }); });

    fire('map.changed', changed(true));

    expect(h.setPlayerSpiritVisible).toHaveBeenCalledWith(true);
  });
});

describe('walls and lights after a reconnect', () => {
  it('asks for the walls and lights again once the page has rejoined', () => {
    render(<MapCanvas />);
    h.emitted.length = 0;

    act(() => { h.set({ joinedEpoch: 2 }); });

    expect(emittedOf('walls:request')).toEqual([{ mapId: 'map-a' }]);
    expect(emittedOf('lights:request')).toEqual([{ mapId: 'map-a' }]);
  });

  it('does not ask before the page has joined the campaign', () => {
    h.set({ joinedEpoch: 0 });
    render(<MapCanvas />);
    expect(emittedOf('walls:request')).toEqual([]);

    act(() => { h.set({ joinedEpoch: 1 }); });

    expect(emittedOf('walls:request')).toEqual([{ mapId: 'map-a' }]);
    expect(emittedOf('lights:request')).toEqual([{ mapId: 'map-a' }]);
  });

  it('takes the answer, so a door opened while disconnected shows', () => {
    h.set({ currentMap: mapWith('map-a', [wall('d1', 100, 'door-closed')]) });
    render(<MapCanvas />);
    act(() => { h.set({ joinedEpoch: 2 }); });

    fire('walls:replaced', { mapId: 'map-a', segments: [wall('d1', 100, 'door-open')] });
    openWallSelect();
    press('a', { ctrlKey: true });
    press('ArrowRight');

    const [sent] = emittedOf('walls:replace') as Array<{ segments: WallSegment[] }>;
    expect(sent.segments[0].type).toBe('door-open');
  });
});

describe('map settings broadcast', () => {
  it('changes only the flags, keeping an edit made to the same map since it was opened', () => {
    render(<MapCanvas />);
    // Edit Map saves a new picture and grid size for the map showing.
    act(() => {
      h.set({ currentMap: { ...(h.state.currentMap as CampaignMap), imageUrl: '/api/assets/maps/new', gridSize: 70, name: 'Renamed' } });
    });

    fire('map:settings:updated', { mapId: 'map-a', lightingEnabled: true, fogEnabled: true, globalIllumination: false, explorationEnabled: true });

    expect(h.state.currentMap).toMatchObject({
      id: 'map-a', imageUrl: '/api/assets/maps/new', gridSize: 70, name: 'Renamed',
      lightingEnabled: true, fogEnabled: true, globalIllumination: false, explorationEnabled: true,
    });
  });

  it('ignores the flags of another map', () => {
    render(<MapCanvas />);
    fire('map:settings:updated', { mapId: 'map-b', lightingEnabled: true, fogEnabled: true, globalIllumination: false, explorationEnabled: true });
    expect(h.state.currentMap).toMatchObject({ id: 'map-a', lightingEnabled: false, fogEnabled: false });
  });
});

describe("the token menu's Remove from Map", () => {
  const goblin = {
    id: 'tok-1', name: 'Goblin Scout', imageUrl: '', position: { x: 0, y: 19 }, size: { width: 1, height: 1 },
    layer: 'material', visible: true, type: 'npc', conditions: [],
  } as unknown as Token;

  function openTokenMenu() {
    act(() => { useGameStore.getState().setTokens([goblin]); });
    // The top canvas takes the pointer; the two beneath it ignore it.
    const input = document.querySelector('canvas[class*="cursor-"]');
    if (!input) throw new Error('no input canvas');
    // The top-left square, where the token stands (grid y counts up from the bottom).
    fireEvent.contextMenu(input, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByText('Remove from Map'));
  }

  it('asks first, naming the token, and Cancel keeps it', () => {
    render(<MapCanvas />);
    openTokenMenu();

    expect(screen.getByText(/Remove "Goblin Scout" from this map\?/)).toBeInTheDocument();
    expect(h.deleteToken).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(h.deleteToken).not.toHaveBeenCalled();
    expect(useGameStore.getState().tokens['tok-1']).toBeDefined();
  });

  it('removes the token once confirmed', async () => {
    render(<MapCanvas />);
    openTokenMenu();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove' })); });

    expect(h.deleteToken).toHaveBeenCalledWith('campaign-1', 'map-a', 'tok-1');
    expect(useGameStore.getState().tokens['tok-1']).toBeUndefined();
  });

  it('says so when the removal fails', async () => {
    h.deleteToken.mockRejectedValue(new Error('Network down'));
    render(<MapCanvas />);
    openTokenMenu();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove' })); });

    expect(await screen.findByText(/Network down|Failed to remove the token/)).toBeInTheDocument();
    expect(useGameStore.getState().tokens['tok-1']).toBeDefined();
  });
});
