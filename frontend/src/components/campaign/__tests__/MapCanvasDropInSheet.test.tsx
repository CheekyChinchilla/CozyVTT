/**
 * A drag inside a character sheet opened from a token is the sheet's.
 *
 * The map takes a character dragged from the roster: its root accepts the
 * drag (dragover, with the copy cursor) and takes the drop. The sheet a
 * token's View Character Sheet opens, and its editor, are drawn on the body
 * but are React children of the map, and React's events reach a portal's
 * React parents, so a drag of text from one of the editor's boxes to another
 * showed the copy cursor and the drop put nothing in the box. The map now
 * takes only drags on its own element.
 *
 * The sheet here is a stand-in drawn on the body, as the real one is
 * (sheetShellsSmallScreens.test.tsx); jsdom inserts no dropped text, so what
 * is checked is that the map leaves the browser's own handling of the drag
 * alone (the events are not cancelled). The stand-ins for the page are those
 * of MapCanvasMenus.test.tsx.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { createPortal } from 'react-dom';
import { render, screen, fireEvent, act, createEvent } from '@testing-library/react';
import { TokenLayer, TokenType, type CampaignMap, type Token } from '@/types';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = { currentMap: null as unknown };
  const raw = { on() { return raw; }, off() { return raw; }, emit() { return raw; } };
  return {
    state,
    raw,
    api: { getCharacter: vi.fn(), addToken: vi.fn() } as Record<string, ReturnType<typeof vi.fn>>,
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
    id: 'campaign-1', name: 'Test', spiritLayerEnabled: false, status: 'ACTIVE', maps: [],
    characters: [{ id: 'char-alice', userId: 'alice', name: 'Brannoc' }],
    memberships: [
      { userId: 'me', role: 'DM', user: { displayName: 'Me' } },
      { userId: 'alice', role: 'PLAYER', user: { displayName: 'Alice' } },
    ],
  };
  return {
    useCampaign: () => {
      useSyncExternalStore(h.subscribe, h.snapshot);
      return {
        currentMap: h.state.currentMap, setCurrentMap: noop, userRole: 'DM', campaign,
        updateCampaignSpiritLayer: noop, dmViewBothPlanes: false, playerSpiritVisible: false, setPlayerSpiritVisible: noop,
        activeVibeEffect: null, updateVibe: noop, activeAtmosphereEffect: null, characterHpCache: {},
      };
    },
  };
});
vi.mock('@/contexts/WebSocketContext', () => {
  const client = new Proxy({ getSocket: () => h.raw } as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return () => () => undefined;
    },
  });
  return { useWebSocket: () => ({ socket: client, joinedEpoch: 1, status: 'connected', reconnectCount: 0 }) };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }));
vi.mock('@/services/map.service', () => ({ default: { updateMap: vi.fn(), getMaps: vi.fn().mockResolvedValue([]), getMap: vi.fn() } }));
vi.mock('@/services/api', () => {
  const client = new Proxy({}, { get: (_target, prop: string) => h.api[prop] ?? vi.fn().mockResolvedValue({}) });
  return { api: client, default: client };
});
// The sheet, drawn on the body as the real one is, with a box to drop text in.
vi.mock('@/components/character/CharacterSheetViewerModal', () => ({
  default: ({ character }: { character: { name: string } }) =>
    createPortal(
      <div role="dialog" aria-label={character.name}>
        <input aria-label="Name" defaultValue={character.name} />
      </div>,
      document.body
    ),
}));

import MapCanvas from '../MapCanvas';
import { useGameStore } from '@/stores/gameStore';

const map = {
  id: 'map-a', campaignId: 'campaign-1', name: 'Map A', imageUrl: '/api/assets/maps/x', width: 20, height: 20, gridSize: 50,
  tokens: [], wallSegments: [], lights: [], fogEnabled: false, lightingEnabled: false, globalIllumination: true, explorationEnabled: false,
} as unknown as CampaignMap;

const hero = {
  id: 'tok-hero', name: 'Hero', imageUrl: '', characterId: 'char-alice', position: { x: 2, y: 19 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, type: TokenType.PLAYER, conditions: [], rotation: 0, controlledBy: 'alice', hp: null, showHpBar: false,
} as unknown as Token;

function surface(): HTMLCanvasElement {
  const input = document.querySelector<HTMLCanvasElement>('canvas[class*="cursor-"]');
  if (!input) throw new Error('no input canvas');
  return input;
}

/** Fires a drag event of `type` at `target`, and says whether anything cancelled it. */
function dragAt(target: Element, type: 'dragOver' | 'drop'): boolean {
  const dataTransfer = { getData: () => 'Brannoc', dropEffect: 'none' };
  const event = createEvent[type](target, { dataTransfer });
  fireEvent(target, event);
  return event.defaultPrevented;
}

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.api.getCharacter.mockReset().mockResolvedValue({ character: { id: 'char-alice', userId: 'alice', name: 'Brannoc', gameSystem: 'DND_5E', data: {} } });
  h.api.addToken.mockReset().mockResolvedValue({ token: hero });
  act(() => { useGameStore.getState().clearGameState(); });
  h.set({ currentMap: map });
});

async function openSheetFromToken() {
  render(<MapCanvas />);
  act(() => { useGameStore.getState().setTokens([hero]); });
  fireEvent.contextMenu(surface(), { clientX: 2 * 50 + 10, clientY: 10 });
  await act(async () => { fireEvent.click(screen.getByText('View Character Sheet')); });
  return screen.findByRole('dialog', { name: 'Brannoc' });
}

describe('a drag in a character sheet opened from a token', () => {
  it("is left to the sheet's box: the map neither accepts it nor takes the drop", async () => {
    const sheet = await openSheetFromToken();
    const box = screen.getByRole('textbox', { name: 'Name' });
    expect(document.querySelector('[role="application"]')).not.toContainElement(sheet);

    expect(dragAt(box, 'dragOver')).toBe(false);
    expect(dragAt(box, 'drop')).toBe(false);
    expect(h.api.addToken).not.toHaveBeenCalled();
  });

  it('leaves a drag on the map itself to the map, which accepts it', async () => {
    await openSheetFromToken();
    expect(dragAt(surface(), 'dragOver')).toBe(true);
    expect(dragAt(surface(), 'drop')).toBe(true);
  });
});
