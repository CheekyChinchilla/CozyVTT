/**
 * More on the compact layout: what the desktop's header and rail offer that
 * the bar does not, by who is looking, each row closing More and opening
 * what it names.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SessionToolbar from '@/components/campaign/SessionToolbar';

const seat = vi.hoisted(() => ({ role: 'DM' as string }));
vi.mock('@/contexts/CampaignContext', () => ({ useCampaign: () => ({ userRole: seat.role }) }));

import MoreSheet from '../MoreSheet';

const onSheetEntry = () => (window.history.state as Record<string, unknown> | null)?.cozyvttSheet === true;

beforeEach(() => {
  seat.role = 'DM';
});

afterEach(async () => {
  cleanup();
  await waitFor(() => expect(onSheetEntry()).toBe(false));
});

function more({ isOwner = false } = {}) {
  const handlers = {
    onClose: vi.fn(),
    onOpenTool: vi.fn(),
    onOpenDocuments: vi.fn(),
    onOpenShortcuts: vi.fn(),
    onOpenPanel: vi.fn(),
  };
  render(<MoreSheet open isOwner={isOwner} {...handlers} />);
  return handlers;
}

/** Each group's heading and its rows, as the sheet shows them. */
function groups(): Array<[string, string[]]> {
  const sheet = screen.getByRole('dialog', { name: 'More' });
  return within(sheet).getAllByRole('group').map((group) => [
    within(group).getByRole('heading', { level: 3 }).textContent ?? '',
    within(group).getAllByRole('button').map((row) => row.textContent ?? ''),
  ]);
}

const AT_THE_TABLE: [string, string[]] = ['At the table', ['Notes', 'Session', 'Documents', 'Shortcuts']];

describe('More', () => {
  it('is a modal sheet at full height, named More', () => {
    more();
    const sheet = screen.getByRole('dialog', { name: 'More' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
  });

  it("offers the DM the table's panels and every tool of the header's toolbar, in its order", () => {
    more();
    render(<SessionToolbar openPanels={{}} onOpen={() => undefined} />);
    const toolbar = within(screen.getByRole('toolbar', { name: 'DM tools' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(toolbar).toHaveLength(7);
    expect(groups()).toEqual([AT_THE_TABLE, ['DM tools', toolbar]]);
  });

  it('offers a player the table alone', () => {
    seat.role = 'PLAYER';
    more();
    expect(groups()).toEqual([AT_THE_TABLE]);
  });

  it('offers an owner who is not the DM Owner Settings, as the desktop header does', () => {
    seat.role = 'PLAYER';
    more({ isOwner: true });
    expect(groups()).toEqual([AT_THE_TABLE, ['Owner', ['Owner Settings']]]);
  });

  it('offers a DM who owns the campaign Campaign Settings, and no Owner Settings', () => {
    more({ isOwner: true });
    expect(screen.queryByRole('button', { name: 'Owner Settings' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Campaign Settings' })).toBeInTheDocument();
  });

  it.each([
    ['Notes', 'onOpenPanel', ['notes']],
    ['Session', 'onOpenPanel', ['session']],
    ['Documents', 'onOpenDocuments', []],
    ['Shortcuts', 'onOpenShortcuts', []],
    ['Map Library', 'onOpenTool', ['maps']],
    ['Spirit Layer', 'onOpenTool', ['spirit']],
    ['Campaign Settings', 'onOpenTool', ['settings']],
  ] as const)('%s closes More and opens it', (label, handler, args) => {
    const handlers = more();
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(handlers[handler]).toHaveBeenCalledWith(...args);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("Owner Settings opens the campaign's settings", () => {
    seat.role = 'PLAYER';
    const handlers = more({ isOwner: true });
    fireEvent.click(screen.getByRole('button', { name: 'Owner Settings' }));
    expect(handlers.onOpenTool).toHaveBeenCalledWith('settings');
  });

  it('draws rows a finger can press', () => {
    more();
    for (const row of within(screen.getByRole('dialog', { name: 'More' })).getAllByRole('group').flatMap((g) => within(g).getAllByRole('button'))) {
      expect(row.className).toContain('min-h-13');
    }
  });
});
