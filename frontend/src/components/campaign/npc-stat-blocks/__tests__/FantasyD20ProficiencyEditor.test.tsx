/**
 * The Fantasy d20 creature editor's save and skill boxes take what the
 * server stores: the bounds of STAT_BLOCK_LIMITS, as the printed-skills
 * editor's do, not a copy of them.
 */
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { NpcStatBlock } from '@/types';
import { STAT_BLOCK_LIMITS } from '@/constants/statBlockLimits';
import FantasyD20ProficiencyEditor from '../FantasyD20ProficiencyEditor';

const creature: NpcStatBlock = {
  ac: 18,
  speed: '25 feet',
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  level: 5,
  savingThrows: { fortitude: 11, reflex: 7, will: 9 },
  skills: { Athletics: 12 },
};

it('bounds every save and skill box as the server does', () => {
  render(<FantasyD20ProficiencyEditor statBlock={creature} onChange={vi.fn()} />);
  const boxes = screen.getAllByRole('spinbutton', { name: / modifier$/ });
  expect(boxes).toHaveLength(4);
  for (const box of boxes) {
    expect(box).toHaveAttribute('min', String(STAT_BLOCK_LIMITS.minBonus));
    expect(box).toHaveAttribute('max', String(STAT_BLOCK_LIMITS.maxBonus));
  }
});

it('names the system Fantasy d20 in the note on the printed modifiers', () => {
  render(<FantasyD20ProficiencyEditor statBlock={creature} onChange={vi.fn()} />);
  expect(screen.getByText(/^Fantasy d20 stat blocks list final modifiers/)).toBeInTheDocument();
});
