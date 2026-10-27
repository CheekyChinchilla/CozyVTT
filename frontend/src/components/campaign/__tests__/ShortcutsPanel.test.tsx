/**
 * The keyboard shortcuts window: every key the map takes, for whoever is
 * looking. A player is shown the keys that do something for them, the DM the
 * wall and undo keys as well. The list is MAP_SHORTCUTS, which the guides'
 * tables are held to by a backend check.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ShortcutsPanel from '../ShortcutsPanel';
import { MAP_SHORTCUTS } from '../map/keyboard';

/** The rows of the window, each as the text of its two cells. */
function rows(): Array<[string, string]> {
  return screen.getAllByRole('row').filter((r) => within(r).queryAllByRole('cell').length === 2).map((r) => {
    const [keys, does] = within(r).getAllByRole('cell');
    return [keys.textContent ?? '', does.textContent ?? ''];
  });
}

describe('the keyboard shortcuts window', () => {
  it('shows the DM every shortcut, the wall keys among them', () => {
    render(<ShortcutsPanel open onClose={() => undefined} role="DM" />);

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(rows().map(([, does]) => does)).toEqual(MAP_SHORTCUTS.map((s) => s.does));
    expect(screen.getByText('Nudge the selected walls one pixel')).toBeInTheDocument();
  });

  it('shows a player the keys for the map and their own tokens, and none of the wall keys', () => {
    render(<ShortcutsPanel open onClose={() => undefined} role="PLAYER" />);

    const shown = rows().map(([, does]) => does);
    expect(shown).toEqual(MAP_SHORTCUTS.filter((s) => s.who !== 'dm').map((s) => s.does));
    expect(shown).toContain('Move the selected token one square');
    expect(screen.queryByText('Undo the last wall change')).not.toBeInTheDocument();
  });

  it('shows a spectator only what works for everyone', () => {
    render(<ShortcutsPanel open onClose={() => undefined} role="SPECTATOR" />);

    expect(rows().map(([, does]) => does)).toEqual(MAP_SHORTCUTS.filter((s) => s.who === 'everyone').map((s) => s.does));
    expect(screen.queryByText('Move the selected token one square')).not.toBeInTheDocument();
  });

  it('names each key as a key', () => {
    render(<ShortcutsPanel open onClose={() => undefined} role="DM" />);

    const turn = rows().find(([, does]) => does.startsWith('Turn the selected token'));
    expect(turn?.[0]).toBe('[ ]');
    expect(document.querySelectorAll('kbd').length).toBeGreaterThanOrEqual(MAP_SHORTCUTS.length);
  });

  it('closes on its Close button and on Escape', () => {
    const onClose = vi.fn();
    render(<ShortcutsPanel open onClose={onClose} role="PLAYER" />);

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows nothing while closed', () => {
    render(<ShortcutsPanel open={false} onClose={() => undefined} role="DM" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
