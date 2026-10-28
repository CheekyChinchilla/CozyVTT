/**
 * The campaign page across a change of arrangement.
 *
 * The page draws one arrangement at a time (LayoutContext). Every screen
 * gets the desktop's for now, so the test stands in for the switch: its
 * layout context says compact when the test asks, and the page then draws
 * no arrangement at all. Coming back must find everything as it was: the
 * map, the session panels and the Party content mounted once, no socket
 * listener registered again, the open tab and the unread count, a
 * slide-over and the quick editor still open, and the keyboard where it was.
 *
 * The parts are stand-ins that count their mounts, register one socket
 * listener each, and keep a number in their own state; the socket counts
 * every listener registered.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MessageType } from '@/types';
import type { ChatMessageBroadcast, Token } from '@/types';

const life = vi.hoisted(() => ({ mounts: {} as Record<string, number>, unmounts: {} as Record<string, number> }));

const sock = vi.hoisted(() => {
  const handlers = new Map<string, Set<(data: never) => void>>();
  const counts = { on: 0, off: 0 };
  const add = (event: string, fn: (data: never) => void) => {
    counts.on += 1;
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(fn);
  };
  // Every `on…` method of the socket client registers, and `off` takes one away.
  const client = new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      if (prop === 'on') return add;
      // An `on…` method registers under its own name, and is taken off by its event's name.
      if (prop === 'off') return (_event: string, fn: (data: never) => void) => { counts.off += 1; handlers.forEach((set) => set.delete(fn)); };
      if (/^on[A-Z]/.test(prop)) return (fn: (data: never) => void) => add(prop, fn);
      return () => undefined;
    },
  });
  return { client, handlers, counts };
});

const layout = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { compact: false };
  return {
    state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set(compact: boolean) { state.compact = compact; listeners.forEach((l) => l()); },
  };
});

/** A part: counts its mounts, registers one socket listener, and keeps a count of its presses. */
const standIn = vi.hoisted(() => (name: string) => async () => {
  const { useEffect, useState } = await import('react');
  const { useWebSocket } = await import('@/contexts/WebSocketContext');
  function StandIn() {
    const { socket } = useWebSocket();
    const [presses, setPresses] = useState(0);
    useEffect(() => {
      life.mounts[name] = (life.mounts[name] ?? 0) + 1;
      const listener = () => undefined;
      socket?.on(`${name}.event`, listener);
      return () => {
        life.unmounts[name] = (life.unmounts[name] ?? 0) + 1;
        socket?.off(`${name}.event`, listener);
      };
    }, [socket]);
    return <button onClick={() => setPresses((n) => n + 1)}>{`${name} pressed ${presses}`}</button>;
  }
  return { default: StandIn };
});

// What the contexts give is the same from one render to the next, as in the
// app, so an effect keyed on it runs again only when something remounts.
const page = vi.hoisted(() => ({
  user: { id: 'dm', displayName: 'DM' },
  campaign: {
    campaign: { id: 'campaign-1', name: 'Test', status: 'ACTIVE', ownerId: 'dm', memberships: [], characters: [] },
    currentMap: { id: 'map-1', name: 'Map', tokens: [] },
    loading: false,
    error: null,
    userRole: 'DM',
    updateCampaignStatus: () => undefined,
    setActiveSession: () => undefined,
    refreshCurrentMap: () => undefined,
    catchUpAfterReconnect: () => undefined,
  },
  navigate: () => undefined,
}));

vi.mock('react-router', () => ({ useNavigate: () => page.navigate }));
vi.mock('react-resizable-panels', () => ({
  Group: ({ children }: { children?: ReactNode }) => <div data-group="">{children}</div>,
  Panel: ({ id, children }: { id: string; children?: ReactNode }) => <div data-panel={id}>{children}</div>,
  Separator: () => null,
  useDefaultLayout: () => ({ defaultLayout: undefined, onLayoutChanged: () => undefined }),
  usePanelRef: () => ({ current: null }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: page.user }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  CampaignProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useCampaign: () => page.campaign,
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  WebSocketProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useWebSocket: () => ({ socket: sock.client, joinedEpoch: 1, status: 'connected' }),
}));
vi.mock('@/contexts/LayoutContext', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    LayoutProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
    useCompactLayout: () => useSyncExternalStore(layout.subscribe, () => layout.state.compact),
  };
});
vi.mock('@/hooks/useInitiativeSync', () => ({ useInitiativeSync: () => undefined }));
vi.mock('@/hooks/usePresenceSync', () => ({ usePresenceSync: () => undefined }));
vi.mock('@/hooks/useOnRejoin', () => ({ useOnRejoin: () => undefined }));
vi.mock('@/hooks/useAccessRevoked', () => ({ useAccessRevoked: () => undefined }));

vi.mock('@/components/campaign/MapCanvas', standIn('Map'));
vi.mock('@/components/campaign/ChatPanel', standIn('Chat'));
vi.mock('@/components/campaign/DiceRoller', standIn('Dice'));
vi.mock('@/components/campaign/InitiativeTracker', standIn('Initiative'));
vi.mock('@/components/campaign/PersonalNotes', standIn('Notes'));
vi.mock('@/components/campaign/VibeTracker', standIn('Vibe'));
vi.mock('@/components/campaign/SessionControls', standIn('Controls'));
vi.mock('@/components/campaign/SessionHistory', standIn('History'));
vi.mock('@/components/campaign/CampaignInfo', standIn('Info'));
vi.mock('@/components/campaign/CampaignRoster', standIn('Roster'));
// The Token Roster opens a token in the quick editor, as its Edit buttons do.
vi.mock('@/components/campaign/TokenRoster', async () => {
  const { useEffect } = await import('react');
  function TokenRoster({ onEditToken }: { onEditToken: (t: Token) => void }) {
    useEffect(() => {
      life.mounts.TokenRoster = (life.mounts.TokenRoster ?? 0) + 1;
      return () => { life.unmounts.TokenRoster = (life.unmounts.TokenRoster ?? 0) + 1; };
    }, []);
    return <button onClick={() => onEditToken({ id: 'tok-a', name: 'Goblin' } as unknown as Token)}>Edit Goblin</button>;
  }
  return { default: TokenRoster };
});
vi.mock('@/components/campaign/NpcQuickEditor', () => ({
  default: ({ token }: { token: Token }) => <div role="dialog" aria-label={`Quick edit ${token.name}`} />,
}));
vi.mock('@/components/campaign/MapManager', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog" aria-label="Map Library" /> : null),
}));

const nothing = vi.hoisted(() => () => ({ default: () => null }));
vi.mock('@/components/campaign/TokenManager', nothing);
vi.mock('@/components/campaign/SpiritLayerControls', nothing);
vi.mock('@/components/campaign/AtmospherePanel', nothing);
vi.mock('@/components/campaign/AtmospherePlayer', nothing);
vi.mock('@/components/campaign/TableRefusals', nothing);
vi.mock('@/components/campaign/CreatureLibrary', nothing);
vi.mock('@/components/campaign/TokenTemplateLibrary', nothing);
vi.mock('@/components/campaign/CampaignSettingsModal', nothing);
vi.mock('@/components/documents/CampaignDocumentsModal', nothing);
vi.mock('@/components/ConnectionStatus', nothing);

import CampaignPage from '../CampaignPage';
import { useGameStore } from '@/stores/gameStore';

const PARTS = ['Map', 'Chat', 'Dice', 'Initiative', 'Notes', 'Vibe', 'Controls', 'History', 'Info', 'Roster', 'TokenRoster'];

const part = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name} pressed`) });
const header = () => screen.queryByRole('heading', { level: 1, name: 'Test' });
const arrange = (compact: boolean) => act(() => layout.set(compact));

/** The page, once the map's code has loaded. */
async function openPage() {
  render(<CampaignPage />);
  await screen.findByRole('button', { name: /^Map pressed/ });
}

function chatFrom(userId: string): ChatMessageBroadcast {
  return { id: `m-${userId}`, userId, userName: userId, content: 'Hi', type: MessageType.PLAYER, timestamp: '2026-10-28T12:00:00.000Z' };
}

beforeEach(() => {
  for (const key of Object.keys(life.mounts)) delete life.mounts[key];
  for (const key of Object.keys(life.unmounts)) delete life.unmounts[key];
  sock.handlers.clear();
  sock.counts.on = 0;
  sock.counts.off = 0;
  layout.state.compact = false;
  window.localStorage.clear();
  useGameStore.getState().clearGameState();
});

describe('the desktop arrangement', () => {
  it('draws the map, the session panels and the Party content in its columns', async () => {
    await openPage();

    expect(part('Map').closest('[data-panel="map"] section')).not.toBeNull();
    expect(part('Chat').closest('#session-tabpanel-chat')?.closest('[data-panel="rail"]')).not.toBeNull();
    expect(part('Roster').closest('[data-panel="party"] aside')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Edit Goblin' }).closest('[data-panel="party"] aside')).not.toBeNull();
  });
});

describe('a change of arrangement', () => {
  it('mounts no part again and registers no socket listener again', async () => {
    await openPage();
    const map = part('Map');
    const before = { ...sock.counts };
    expect(Object.keys(life.mounts).sort()).toEqual([...PARTS].sort());

    arrange(true);
    expect(header()).toBeNull();
    expect(map.isConnected).toBe(true);

    arrange(false);

    expect(header()).not.toBeNull();
    expect(part('Map')).toBe(map);
    expect(map.closest('[data-panel="map"] section')).not.toBeNull();
    expect(part('Chat').closest('[data-panel="rail"]')).not.toBeNull();
    expect(part('Info').closest('[data-panel="party"]')).not.toBeNull();
    for (const name of PARTS) expect(life.mounts[name], name).toBe(1);
    expect(life.unmounts).toEqual({});
    expect(sock.counts).toEqual(before);
  });

  it('keeps what the parts hold, the open tab, the unread count, a slide-over and the quick editor', async () => {
    await openPage();
    fireEvent.click(part('Chat'));
    fireEvent.click(part('Map'));
    fireEvent.click(screen.getByRole('tab', { name: 'Dice' }));
    act(() => sock.handlers.get('onChatMessage')?.forEach((fn) => (fn as (data: ChatMessageBroadcast) => void)(chatFrom('mara'))));
    expect(screen.getByLabelText('1 unread messages')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Map Library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Goblin' }));

    arrange(true);
    expect(screen.getByRole('dialog', { name: 'Map Library' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Quick edit Goblin' })).toBeTruthy();
    arrange(false);

    expect(part('Chat').textContent).toBe('Chat pressed 1');
    expect(part('Map').textContent).toBe('Map pressed 1');
    expect(screen.getByRole('tab', { name: /^Dice/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('1 unread messages')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Map Library' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Quick edit Goblin' })).toBeTruthy();
  });

  it('leaves the keyboard on the part that had it', async () => {
    await openPage();
    part('Map').focus();

    arrange(true);
    arrange(false);

    expect(document.activeElement).toBe(part('Map'));
  });
});
