/**
 * The game system badge, for every code it can be given: the systems this
 * build knows, none (a Flexible sheet), and a code it does not know, such as
 * one read from a file made on an instance with another system.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameSystemBadge from '../GameSystemBadge';
import { GameSystem } from '@/types';
import { GAME_SYSTEM_SHORT_LABELS } from '@/constants/game-systems';

describe('GameSystemBadge', () => {
  it('shows each system by its short label', () => {
    for (const system of Object.values(GameSystem)) {
      const { unmount } = render(<GameSystemBadge gameSystem={system} />);
      expect(screen.getByText(GAME_SYSTEM_SHORT_LABELS[system])).toBeTruthy();
      unmount();
    }
  });

  it('shows Flexible for no system', () => {
    render(<GameSystemBadge gameSystem={null} />);
    expect(screen.getByText('Flexible')).toBeTruthy();
  });

  it('shows a code it does not know as written, in the Flexible badge\'s colours', () => {
    render(<GameSystemBadge gameSystem={'MY_SYSTEM' as GameSystem} showFull />);
    const badge = screen.getByText('MY_SYSTEM');
    expect(badge.className).toContain('text-ink-muted');
  });
});
