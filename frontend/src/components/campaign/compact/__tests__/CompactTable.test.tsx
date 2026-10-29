/**
 * The compact arrangement: the map between a one-row header and the bar,
 * and each of the bar's buttons opening its sheet over the map, with the
 * page's parts moved into them.
 *
 * The parts stand in for the page's: the session panels and the Party
 * content, each a button; the map, a box.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TableHosts } from '@/components/campaign/tableHosts';
import { LayoutProvider } from '@/contexts/LayoutContext';
import { useGameStore } from '@/stores/gameStore';
import { SHORT_SCREEN_QUERY } from '@/constants/layout';
import { CampaignStatus } from '@/types';
import type { Campaign } from '@/types';
import type { SessionToolKey } from '@/components/campaign/SessionToolbar';

const page = vi.hoisted(() => ({ role: 'PLAYER' as string | null, navigate: vi.fn(), status: 'connected' }));

vi.mock('react-router', () => ({ useNavigate: () => page.navigate }));
vi.mock('@/contexts/CampaignContext', () => ({ useCampaign: () => ({ userRole: page.role }) }));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ status: page.status, error: null, reconnect: () => undefined }) }));

import CompactTable, { CHAT_SHEET_HEIGHT } from '../CompactTable';

const campaign = (status: CampaignStatus = CampaignStatus.ACTIVE) =>
  ({ id: 'campaign-1', name: 'The Sunken Crown', status, ownerId: 'owner', memberships: [], characters: [] }) as unknown as Campaign;

const parts = {
  map: <div data-testid="map">the map</div>,
  session: <button type="button">session panels</button>,
  party: <button type="button">party content</button>,
};

function openers() {
  return { onOpenTool: vi.fn<(key: SessionToolKey) => void>(), onOpenDocuments: vi.fn<() => void>(), onOpenShortcuts: vi.fn<() => void>() };
}

function table(status?: CampaignStatus) {
  const asked = openers();
  render(
    <LayoutProvider compact>
      <TableHosts parts={parts}>
        <CompactTable campaign={campaign(status)} isOwner={false} {...asked} />
      </TableHosts>
    </LayoutProvider>
  );
  return asked;
}

const bar = () => screen.getByRole('navigation', { name: 'Table' });
const press = (name: string) => fireEvent.click(within(bar()).getByRole('button', { name: new RegExp(`^${name}`) }));
/** A sheet, open or not, by its title. */
const sheet = (title: string) => {
  const found = [...document.querySelectorAll<HTMLElement>('[data-sheet]')].find((el) => el.querySelector('h2')?.textContent === title);
  if (!found) throw new Error(`no sheet ${title}`);
  return found;
};
const sheets = () => [...document.querySelectorAll<HTMLElement>('[data-sheet]')];
const openSheets = () => sheets().filter((el) => el.dataset.state === 'open').map((el) => el.querySelector('h2')?.textContent);
/**
 * A row of More, by its label. The sheet slides in over a few frames, and is
 * hidden until it has begun to, so its rows have no accessible name yet.
 */
const moreRow = (label: string) => {
  const row = within(sheet('More')).getByText(label).closest('button');
  if (!row) throw new Error(`no row ${label}`);
  return row;
};
const onSheetEntry = () => (window.history.state as Record<string, unknown> | null)?.cozyvttSheet === true;

beforeEach(() => {
  page.navigate.mockClear();
  page.role = 'PLAYER';
  page.status = 'connected';
  window.localStorage.clear();
  act(() => { useGameStore.getState().clearGameState(); });
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await waitFor(() => expect(onSheetEntry()).toBe(false));
});

describe('the compact arrangement', () => {
  it("draws the header, the map and the bar, with the session and Party content in closed sheets", () => {
    table();
    expect(screen.getByRole('heading', { level: 1, name: 'The Sunken Crown' })).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByTestId('map').closest('main')).not.toBeNull();
    expect(within(bar()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Map', 'Chat', 'Dice', 'Initiative', 'Party', 'More']);

    expect(openSheets()).toEqual([]);
    expect(sheet('Chat')).toContainElement(screen.getByText('session panels'));
    expect(sheet('Party')).toContainElement(screen.getByText('party content'));
    expect(sheet('Chat')).toHaveAttribute('inert');
    expect(sheet('Party')).toHaveAttribute('inert');
  });

  it('leads back to the dashboard', () => {
    table();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the dashboard' }));
    expect(page.navigate).toHaveBeenCalledWith('/dashboard', { replace: false });
  });

  // A sheet open as the page was left kept its history entry, so Back from
  // the dashboard came to the campaign page and the next Back did nothing.
  // Leaving with a sheet open puts the dashboard in that entry's place.
  it("leads back to the dashboard in place of an open sheet's history entry", () => {
    table();
    press('Chat');
    expect(onSheetEntry()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the dashboard' }));
    expect(page.navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  // A live region added with its words already in it is not read out by
  // many screen readers, and one taken away says nothing: the region stays,
  // out of sight while connected, so both changes are heard.
  it("keeps the connection's state for a screen reader, and shows it only while it is not connected", () => {
    table();
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Connected');
    expect(region.closest('.sr-only')).not.toBeNull();
    cleanup();
    page.status = 'disconnected';
    table();
    expect(screen.getByRole('status')).toHaveTextContent('Disconnected');
    expect(screen.getByRole('status').closest('.sr-only')).toBeNull();
    // Retry, the one control a player needs when the connection drops, takes a finger.
    expect(screen.getByRole('button', { name: 'Retry' }).className.split(/\s+/)).toContain('min-h-11');
  });

  // The panels were written for a mouse; the compact layout gives every
  // control in them a finger's size (index.css, .finger-controls).
  it("gives every control in the session and Party content a finger's size", () => {
    table();
    expect(screen.getByText('session panels').closest('.finger-controls')).not.toBeNull();
    expect(screen.getByText('party content').closest('.finger-controls')).not.toBeNull();
    expect(screen.getByTestId('map').closest('.finger-controls')).not.toBeNull();
  });

  it('puts More on the page after the session and Party sheets, so it opens over them', () => {
    table();
    expect(sheets().map((el) => el.querySelector('h2')?.textContent)).toEqual(['Chat', 'Party', 'More']);
  });

  it("tells players under the header that the session is paused, and the DM not", () => {
    table(CampaignStatus.PAUSED);
    expect(screen.getByText(/Session is paused/)).toBeInTheDocument();
    cleanup();
    page.role = 'DM';
    table(CampaignStatus.PAUSED);
    expect(screen.queryByText(/Session is paused/)).toBeNull();
  });
});

describe("the bar's buttons", () => {
  it('open the session sheet on Chat, Dice or Initiative at half height, named for the panel', () => {
    table();
    press('Chat');
    expect(openSheets()).toEqual(['Chat']);
    expect(sheet('Chat')).not.toHaveAttribute('aria-modal');
    expect(useGameStore.getState().sessionTab).toBe('chat');

    press('Dice');
    expect(openSheets()).toEqual(['Dice']);
    expect(useGameStore.getState().sessionTab).toBe('dice');
  });

  // A half sheet is 330 px on an iPhone 15 (659 px tall in Safari), which
  // left the chat one message under its box. Chat opens taller, the map
  // still showing above it; the others keep half the screen.
  it('open Chat taller than the other half sheets, with the map still above it', () => {
    table();
    press('Chat');
    expect(sheet('Chat').style.height).toBe(CHAT_SHEET_HEIGHT);
    press('Dice');
    expect(sheet('Dice').style.height).toBe('50dvh');
  });

  it('name the sheet each opens, say whether it is open, and mark the open one', () => {
    table();
    const chat = within(bar()).getByRole('button', { name: /^Chat/ });
    const party = within(bar()).getByRole('button', { name: /^Party/ });
    const more = within(bar()).getByRole('button', { name: /^More/ });
    expect(chat.getAttribute('aria-controls')).toBe(sheet('Chat').id);
    expect(within(bar()).getByRole('button', { name: /^Dice/ }).getAttribute('aria-controls')).toBe(sheet('Chat').id);
    expect(party.getAttribute('aria-controls')).toBe(sheet('Party').id);
    expect(more.getAttribute('aria-controls')).toBe(sheet('More').id);
    expect(within(bar()).getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'true');

    press('Chat');
    expect(chat).toHaveAttribute('aria-expanded', 'true');
    expect(chat).toHaveAttribute('aria-current', 'true');
  });

  it("close the open one's sheet when pressed again, and Map closes any", () => {
    table();
    press('Chat');
    press('Chat');
    expect(openSheets()).toEqual([]);

    press('Party');
    expect(openSheets()).toEqual(['Party']);
    press('Map');
    expect(openSheets()).toEqual([]);
  });

  it('keep one sheet open at a time', () => {
    table();
    press('Party');
    press('Initiative');
    expect(openSheets()).toEqual(['Initiative']);
    press('More');
    expect(openSheets()).toEqual(['More']);
  });

  it('stay pressable beside More, which stops above them', () => {
    table();
    press('More');
    expect(sheet('More')).toHaveAttribute('aria-modal', 'true');
    expect(sheet('More').style.bottom).toMatch(/3\.5rem/);
    press('Chat');
    expect(openSheets()).toEqual(['Chat']);
  });
});

describe('More', () => {
  it("opens the session sheet on Notes or Session at full height, the bar showing More", () => {
    table();
    press('More');
    fireEvent.click(moreRow('Notes'));

    expect(openSheets()).toEqual(['Notes']);
    expect(sheet('Notes')).toHaveAttribute('aria-modal', 'true');
    expect(within(bar()).getByRole('button', { name: /^More/ })).toHaveAttribute('aria-current', 'true');
    // More's own list is closed, so More is not expanded.
    expect(within(bar()).getByRole('button', { name: /^More/ })).toHaveAttribute('aria-expanded', 'false');
    expect(useGameStore.getState().sessionTab).toBe('notes');

    // From there the bar's Chat moves the same sheet to the chat.
    press('Chat');
    expect(openSheets()).toEqual(['Chat']);
  });

  it("asks the page for its windows: Documents, Shortcuts and the DM's tools", () => {
    page.role = 'DM';
    const openers = table();
    press('More');
    fireEvent.click(moreRow('Documents'));
    expect(openers.onOpenDocuments).toHaveBeenCalledTimes(1);
    expect(openSheets()).toEqual([]);

    press('More');
    fireEvent.click(moreRow('Shortcuts'));
    expect(openers.onOpenShortcuts).toHaveBeenCalledTimes(1);

    press('More');
    fireEvent.click(moreRow('Map Library'));
    expect(openers.onOpenTool).toHaveBeenCalledWith('maps');
  });
});

describe('the unread count', () => {
  it('counts messages while the session sheet is closed, the chat chosen or not, and opening Chat reads them', () => {
    table();
    const count = () => act(() => { useGameStore.getState().countUnreadChat(); });
    expect(useGameStore.getState().sessionTab).toBe('chat');
    count();
    count();
    expect(within(bar()).getByLabelText('2 unread messages')).toBeInTheDocument();

    press('Dice');
    count();
    expect(within(bar()).getByLabelText('3 unread messages')).toBeInTheDocument();

    press('Chat');
    expect(useGameStore.getState().unreadChat).toBe(0);
    count();
    expect(useGameStore.getState().unreadChat).toBe(0);
  });

  it('gives the panels back to the screen as the arrangement goes, for the rail', () => {
    table();
    expect(useGameStore.getState().sessionShown).toBe(false);
    cleanup();
    expect(useGameStore.getState().sessionShown).toBe(true);
  });
});

describe('taking over from the desktop with the keyboard in a part', () => {
  it('opens the sheet that part is in, so the control in use stays in sight', () => {
    // Stands in for the session panels' host in the desktop's rail.
    const host = document.createElement('div');
    host.dataset.tablePart = 'session';
    const box = document.createElement('input');
    host.append(box);
    document.body.append(host);
    box.focus();
    try {
      table();
      expect(openSheets()).toEqual(['Chat']);
    } finally {
      host.remove();
    }
  });
});

describe('on a phone turned on its side', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
      matches: query === SHORT_SCREEN_QUERY, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }));
  });

  it("puts the bar's buttons in the header, and the sheets reach the foot of the screen", () => {
    table();
    expect(screen.getByRole('banner')).toContainElement(bar());
    press('Initiative');
    expect(sheet('Initiative').style.bottom).toBe('0px');
    expect(screen.getByRole('img', { name: 'Live' })).toBeInTheDocument();
  });
});
