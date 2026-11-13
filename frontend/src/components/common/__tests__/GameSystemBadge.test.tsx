/**
 * The game system badge, for every code it can be given: the systems this
 * build knows, none (a Flexible sheet), and a code it does not know, such as
 * the value of a system CozyVTT no longer supports.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameSystemBadge from '../GameSystemBadge';
import { GameSystem } from '@/types';
import { GAME_SYSTEM_SHORT_LABELS, UNSUPPORTED_SYSTEM_LABEL } from '@/constants/game-systems';

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

  it('shows a code it does not know as Unsupported system, in the Flexible badge\'s colours', () => {
    render(<GameSystemBadge gameSystem={'MY_SYSTEM' as GameSystem} showFull />);
    expect(screen.queryByText('MY_SYSTEM')).toBeNull();
    const badge = screen.getByText(UNSUPPORTED_SYSTEM_LABEL);
    expect(badge.className).toContain('text-ink-muted');
  });
});
