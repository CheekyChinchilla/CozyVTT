/**
 * The campaign page's two arrangements, and a change between them.
 *
 * From 1,024 px wide the page draws the desktop's header and three columns;
 * below, the compact arrangement, the map between a header and a bar of
 * sheets. Exactly one is drawn, chosen by the one media query, and a change
 * across the width, a tablet turned or a window resized, must find everything
 * as it was: the map, the session panels and the Party content mounted once,
 * no socket listener registered again, the open tab and the unread count, a
 * slide-over and the quick editor still open, the keyboard where it was, and
 * the chat log at its newest message.
 *
 * The parts are stand-ins that count their mounts, register one socket
 * listener each, keep a number in their own state and hold a list that
 * scrolls; the socket counts every listener registered. The arrangements are
 * the page's own.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup, waitFor, within } from '@testing-library/react';
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

/** The screen's width, as the media query the page asks sees it. */
const screenWidth = vi.hoisted(() => {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const state = { compact: false };
  return {
    state,
    listeners,
    set(compact: boolean) {
      state.compact = compact;
      const change = new Event('change');
      listeners.forEach((l) => (typeof l === 'function' ? l(change) : l.handleEvent(change)));
    },
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
    return (
      <>
        <button onClick={() => setPresses((n) => n + 1)}>{`${name} pressed ${presses}`}</button>
        <div data-list={name} />
      </>
    );
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
import { COMPACT_LAYOUT_QUERY } from '@/constants/layout';

const PARTS = ['Map', 'Chat', 'Dice', 'Initiative', 'Notes', 'Vibe', 'Controls', 'History', 'Info', 'Roster', 'TokenRoster'];

/**
 * A part's button, by its text: in a closed sheet it is hidden, and has no
 * accessible name.
 */
const part = (name: string) => {
  const button = screen.getByText(new RegExp(`^${name} pressed`)).closest('button');
  if (!button) throw new Error(`no part ${name}`);
  return button;
};
const heading = () => screen.queryByRole('heading', { level: 1, name: 'Test' });
const bar = () => screen.queryByRole('navigation', { name: 'Table' });
const columns = () => document.querySelectorAll('[data-panel]');
const press = (name: string) => fireEvent.click(within(bar()!).getByRole('button', { name: new RegExp(`^${name}`) }));
/** The screen turns, or the window is resized, across 1,024 px. */
const arrange = (compact: boolean) => act(() => screenWidth.set(compact));
const onSheetEntry = () => (window.history.state as Record<string, unknown> | null)?.cozyvttSheet === true;

/** The page, once the map's code has loaded. */
async function openPage() {
  render(<CampaignPage />);
  await screen.findByText(/^Map pressed/);
}

function chatFrom(userId: string): ChatMessageBroadcast {
  return { id: `m-${userId}`, userId, userName: userId, content: 'Hi', type: MessageType.PLAYER, timestamp: '2026-10-28T12:00:00.000Z' };
}
const chatArrives = (userId: string) =>
  act(() => sock.handlers.get('onChatMessage')?.forEach((fn) => (fn as (data: ChatMessageBroadcast) => void)(chatFrom(userId))));

beforeEach(() => {
  for (const key of Object.keys(life.mounts)) delete life.mounts[key];
  for (const key of Object.keys(life.unmounts)) delete life.unmounts[key];
  sock.handlers.clear();
  sock.counts.on = 0;
  sock.counts.off = 0;
  screenWidth.state.compact = false;
  screenWidth.listeners.clear();
  // The page's width query follows `screenWidth`; every other query is false.
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
    get matches() { return query === COMPACT_LAYOUT_QUERY && screenWidth.state.compact; },
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => { if (query === COMPACT_LAYOUT_QUERY) screenWidth.listeners.add(listener); },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => { screenWidth.listeners.delete(listener); },
    dispatchEvent: () => false,
  }));
  window.localStorage.clear();
  useGameStore.getState().clearGameState();
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await waitFor(() => expect(onSheetEntry()).toBe(false));
});

describe('the desktop arrangement, from 1,024 px wide', () => {
  it('draws the map, the session panels and the Party content in its columns, and no bar', async () => {
    await openPage();

    expect(part('Map').closest('[data-panel="map"] section')).not.toBeNull();
    expect(part('Chat').closest('#session-tabpanel-chat')?.closest('[data-panel="rail"]')).not.toBeNull();
    expect(part('Roster').closest('[data-panel="party"] aside')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Edit Goblin' }).closest('[data-panel="party"] aside')).not.toBeNull();
    expect(bar()).toBeNull();
  });

  // On a phone or a tablet the browser's toolbar comes and goes, and `100vh`
  // is the height with it gone, so the bottom of a page that tall sat under
  // the toolbar. The dynamic viewport height follows the toolbar. jsdom lays
  // nothing out, so the class is what can be checked here.
  it('is as tall as the screen shows, toolbar or not', async () => {
    await openPage();
    const page = document.querySelector('header')!.parentElement!;
    expect(page.className.split(/\s+/)).toContain('h-dvh');
    expect(page.className.split(/\s+/)).not.toContain('h-screen');
  });
});

describe('the compact arrangement, below 1,024 px', () => {
  it('draws the map between its header and its bar, the session and Party content in sheets, and no columns', async () => {
    screenWidth.state.compact = true;
    await openPage();

    expect(heading()).not.toBeNull();
    expect(bar()).not.toBeNull();
    expect(columns()).toHaveLength(0);
    expect(part('Map').closest('main')).not.toBeNull();
    expect(part('Chat').closest('[data-sheet]')).not.toBeNull();
    expect(part('Roster').closest('[data-sheet]')).not.toBeNull();
    expect(screen.getByText('Edit Goblin').closest('[data-sheet]')).not.toBeNull();
    for (const name of PARTS) expect(life.mounts[name], name).toBe(1);
  });

  // The page covered a narrow screen with a "Desktop Required" notice until
  // Continue anyway, which the browser remembered. The compact arrangement
  // takes its place; the remembered choice changes nothing and is not read.
  it('asks no one to continue, and reads no remembered choice', async () => {
    window.localStorage.setItem('cozyvtt.continueOnNarrowScreen', 'yes');
    const read = vi.spyOn(Storage.prototype, 'getItem');
    screenWidth.state.compact = true;
    await openPage();

    expect(screen.queryByText('Desktop Required')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue anyway' })).toBeNull();
    expect(read.mock.calls.map(([key]) => key)).not.toContain('cozyvtt.continueOnNarrowScreen');
    read.mockRestore();
  });

  it("opens the DM's windows from More", async () => {
    screenWidth.state.compact = true;
    await openPage();
    press('More');
    fireEvent.click(screen.getByText('Map Library').closest('button')!);
    expect(screen.getByRole('dialog', { name: 'Map Library' })).toBeTruthy();
  });
});

describe('a change of arrangement', () => {
  it('draws one arrangement at a time, mounts no part again and registers no socket listener again', async () => {
    await openPage();
    const map = part('Map');
    const before = { ...sock.counts };
    expect(Object.keys(life.mounts).sort()).toEqual([...PARTS].sort());

    arrange(true);
    expect(bar()).not.toBeNull();
    expect(columns()).toHaveLength(0);
    expect(part('Map')).toBe(map);
    expect(map.closest('main')).not.toBeNull();
    expect(part('Chat').closest('[data-sheet]')).not.toBeNull();
    expect(part('Info').closest('[data-sheet]')).not.toBeNull();

    arrange(false);
    expect(bar()).toBeNull();
    expect(map.closest('[data-panel="map"] section')).not.toBeNull();
    expect(part('Chat').closest('[data-panel="rail"]')).not.toBeNull();
    expect(part('Info').closest('[data-panel="party"]')).not.toBeNull();

    arrange(true);
    arrange(false);
    expect(part('Map')).toBe(map);
    for (const name of PARTS) expect(life.mounts[name], name).toBe(1);
    expect(life.unmounts).toEqual({});
    expect(sock.counts).toEqual(before);
  });

  it('keeps what the parts hold, the open tab, the unread count, a slide-over and the quick editor', async () => {
    await openPage();
    fireEvent.click(part('Chat'));
    fireEvent.click(part('Map'));
    fireEvent.click(screen.getByRole('tab', { name: 'Dice' }));
    chatArrives('mara');
    expect(screen.getByLabelText('1 unread messages')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Map Library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Goblin' }));

    arrange(true);
    expect(screen.getByRole('dialog', { name: 'Map Library' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Quick edit Goblin' })).toBeTruthy();
    expect(within(bar()!).getByLabelText('1 unread messages')).toBeTruthy();
    expect(part('Chat').textContent).toBe('Chat pressed 1');
    // The bar opens the panel the rail had open.
    press('Dice');
    expect(screen.getByRole('dialog', { name: 'Dice' })).toBeTruthy();

    arrange(false);
    expect(part('Chat').textContent).toBe('Chat pressed 1');
    expect(part('Map').textContent).toBe('Map pressed 1');
    expect(screen.getByRole('tab', { name: /^Dice/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('1 unread messages')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Map Library' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Quick edit Goblin' })).toBeTruthy();
  });

  it('counts messages on the bar while the session sheet is closed, the chat chosen, and the rail reads them back', async () => {
    await openPage();
    expect(useGameStore.getState().sessionTab).toBe('chat');
    arrange(true);
    chatArrives('mara');
    expect(within(bar()!).getByLabelText('1 unread messages')).toBeTruthy();

    arrange(false);
    expect(useGameStore.getState().unreadChat).toBe(0);
  });

  it('leaves the keyboard on the part that had it', async () => {
    await openPage();
    part('Map').focus();

    arrange(true);
    expect(document.activeElement).toBe(part('Map'));
    arrange(false);
    expect(document.activeElement).toBe(part('Map'));
  });

  it("opens the session sheet when the keyboard was in the rail, so the control stays in sight", async () => {
    await openPage();
    part('Chat').focus();

    arrange(true);

    const sheet = screen.getByRole('dialog', { name: 'Chat' });
    expect(sheet).toContainElement(part('Chat'));
    expect(sheet).toHaveAttribute('data-state', 'open');
    expect(sheet).not.toHaveAttribute('inert');
    // The sheet's heading, which takes the focus as a sheet opens, leaves it.
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(document.activeElement).toBe(part('Chat'));
  });

  // At the browser floor no browser has moveBefore, and a move scrolls the
  // chat log to its oldest message; the new box is a different height too.
  it('keeps the chat log at its newest message', async () => {
    await openPage();
    const log = document.querySelector<HTMLElement>('[data-list="Chat"]')!;
    Object.defineProperty(log, 'scrollHeight', { configurable: true, get: () => 1000 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => (log.closest('[data-sheet]') ? 100 : 200) });
    log.scrollTop = 800;

    arrange(true);
    expect(log.scrollHeight - log.scrollTop - log.clientHeight).toBeLessThanOrEqual(0);

    arrange(false);
    expect(log.scrollHeight - log.scrollTop - log.clientHeight).toBeLessThanOrEqual(0);
  });
});
