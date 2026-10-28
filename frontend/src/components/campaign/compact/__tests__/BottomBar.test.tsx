/**
 * The compact layout's bar: a landmark of six buttons, the open one marked
 * current, those that open a sheet saying whether it is open and, once the
 * arrangement gives the sheets' ids, which sheet; and the Chat button's
 * unread count.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useGameStore } from '@/stores/gameStore';
import { unreadBadge } from '@/components/campaign/sessionTabs';
import BottomBar, { BOTTOM_BAR_HEIGHT, COMPACT_TABS, type BottomBarProps, type CompactTab } from '../BottomBar';

beforeEach(() => {
  act(() => { useGameStore.getState().clearGameState(); });
});

function bar(active: CompactTab = 'map', extra: Partial<BottomBarProps> = {}) {
  const onSelect = vi.fn();
  render(<BottomBar active={active} onSelect={onSelect} {...extra} />);
  return onSelect;
}

const buttons = () => within(screen.getByRole('navigation', { name: 'Table' })).getAllByRole('button');

describe('the bottom bar', () => {
  it('is a landmark named Table of six buttons in order, and no tab list', () => {
    bar();
    expect(buttons().map((b) => b.textContent)).toEqual(['Map', 'Chat', 'Dice', 'Initiative', 'Party', 'More']);
    expect(COMPACT_TABS).toEqual(['map', 'chat', 'dice', 'initiative', 'party', 'more']);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('marks the open one current, and says of each that opens a sheet whether it is open', () => {
    bar('dice');
    expect(buttons().map((b) => b.getAttribute('aria-current'))).toEqual([null, null, 'true', null, null, null]);
    // Map closes the sheets and opens none.
    expect(buttons().map((b) => b.getAttribute('aria-expanded'))).toEqual([null, 'false', 'true', 'false', 'false', 'false']);
  });

  it('marks Map current while no sheet is open', () => {
    bar('map');
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'true');
    expect(buttons().filter((b) => b.getAttribute('aria-expanded') === 'true')).toEqual([]);
  });

  it('names the sheet each opens once the arrangement gives their ids, and none before', () => {
    bar('map');
    expect(buttons().filter((b) => b.hasAttribute('aria-controls'))).toEqual([]);
    cleanup();
    bar('map', { sheetIds: { chat: 'session-sheet', dice: 'session-sheet', initiative: 'session-sheet', party: 'party-sheet', more: 'more-sheet' } });
    expect(buttons().map((b) => b.getAttribute('aria-controls'))).toEqual([null, 'session-sheet', 'session-sheet', 'session-sheet', 'party-sheet', 'more-sheet']);
  });

  it('opens what is chosen, every button in the Tab order', () => {
    const onSelect = bar();
    fireEvent.click(screen.getByRole('button', { name: 'Initiative' }));
    expect(onSelect).toHaveBeenCalledWith('initiative');
    expect(buttons().map((b) => b.tabIndex)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("carries the chat's unread count on the Chat button, as the rail does", () => {
    bar();
    expect(within(screen.getByRole('button', { name: 'Chat' })).queryByLabelText(/unread/)).toBeNull();

    act(() => { useGameStore.getState().setSessionTab('dice'); });
    act(() => { for (let i = 0; i < 3; i++) useGameStore.getState().countUnreadChat(); });
    expect(within(screen.getByRole('button', { name: /Chat/ })).getByLabelText('3 unread messages')).toHaveTextContent('3');

    act(() => { for (let i = 0; i < 9; i++) useGameStore.getState().countUnreadChat(); });
    expect(within(screen.getByRole('button', { name: /Chat/ })).getByLabelText('12 unread messages')).toHaveTextContent('9+');
  });

  it('is 56 px tall above the safe area, and its buttons at most 672 px wide, centred', () => {
    bar();
    const nav = screen.getByRole('navigation', { name: 'Table' });
    expect(nav.className).toContain('pb-[env(safe-area-inset-bottom)]');
    expect(nav.className).toContain('border-t');
    const row = buttons()[0].parentElement as HTMLElement;
    expect(row.className).toContain('h-14');
    expect(row.className).toContain('max-w-2xl');
    expect(BOTTOM_BAR_HEIGHT).toBe('calc(3.5rem + 1px + env(safe-area-inset-bottom, 0px))');
  });
});

describe('the unread badge', () => {
  it('shows up to 9, then 9+, and names the count', () => {
    expect(unreadBadge(1)).toEqual({ text: '1', label: '1 unread messages' });
    expect(unreadBadge(9)).toEqual({ text: '9', label: '9 unread messages' });
    expect(unreadBadge(10)).toEqual({ text: '9+', label: '10 unread messages' });
  });
});
