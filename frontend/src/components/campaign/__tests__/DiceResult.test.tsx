/**
 * A single roll in the dice panel.
 *
 * `breakdown` is a JSON column. Its TypeScript type says `rolls` is a required
 * array, but nothing enforces that at runtime — the type is erased, and the row
 * could have been written by an older version, restored from another instance's
 * backup, or imported. When one arrived without `rolls`, this component threw on
 * `breakdown.rolls.some(...)`, and because the error boundary sits at the page
 * level a single malformed row took down the **entire campaign** for everyone in
 * it: no map, no roster, no chat, just "Something went wrong".
 *
 * A roll that cannot be drawn in full should degrade to what it does know — the
 * expression and the total, which is the part people actually read.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import DiceResult from '../DiceResult';
import type { DiceRolledEvent } from '@/types';

// The animation wrapper contributes nothing to what is being checked here, and
// its props would land on a real DOM node and warn.
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: () => ({ children, ...rest }: { children?: unknown }) =>
      createElement('div', rest, children as never),
  }),
}));

/** A well-formed roll, as the dice handler actually writes one. */
const wellFormed = (): DiceRolledEvent => ({
  id: 'roll-1',
  userId: 'u1',
  userName: 'Mara Voss',
  characterName: 'Bramble Nettlefoot',
  expression: '1d20+6',
  result: 24,
  purpose: 'Dexterity save',
  timestamp: '2026-01-01T12:00:00.000Z',
  secret: false,
  breakdown: {
    expression: '1d20+6',
    formula: '18 + 6',
    total: 24,
    rolls: [
      { type: 'dice', notation: '1d20', count: 1, sides: 20, results: [18], total: 18 },
      { type: 'modifier', total: 6 },
    ],
  },
}) as DiceRolledEvent;

/** Strip a field the type insists on, the way a real stored row can lack it. */
const without = (roll: DiceRolledEvent, key: string): DiceRolledEvent => {
  const breakdown = { ...roll.breakdown } as Record<string, unknown>;
  delete breakdown[key];
  return { ...roll, breakdown } as unknown as DiceRolledEvent;
};

describe('DiceResult', () => {
  it('shows a well-formed roll', () => {
    render(<DiceResult roll={wellFormed()} isCurrentUser={false} />);
    expect(screen.getByText('1d20+6')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('1d20:')).toBeInTheDocument();
  });

  it('marks a natural 20 as a critical', () => {
    const crit = wellFormed();
    crit.breakdown.rolls[0].results = [20];
    render(<DiceResult roll={crit} isCurrentUser={false} />);
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  describe('a stored roll the type promised but the database did not deliver', () => {
    it('renders when breakdown has no rolls array', () => {
      render(<DiceResult roll={without(wellFormed(), 'rolls')} isCurrentUser={false} />);
      // The two things worth reading survive.
      expect(screen.getByText('1d20+6')).toBeInTheDocument();
      expect(screen.getByText('24')).toBeInTheDocument();
    });

    it('renders when rolls is not an array at all', () => {
      const odd = wellFormed();
      (odd.breakdown as unknown as Record<string, unknown>).rolls = 'not an array';
      render(<DiceResult roll={odd} isCurrentUser={false} />);
      expect(screen.getByText('24')).toBeInTheDocument();
    });

    it('renders when breakdown has no formula', () => {
      render(<DiceResult roll={without(wellFormed(), 'formula')} isCurrentUser={false} />);
      expect(screen.getByText('24')).toBeInTheDocument();
    });

    it('renders when breakdown is missing entirely', () => {
      const bare = { ...wellFormed() } as unknown as Record<string, unknown>;
      delete bare.breakdown;
      render(<DiceResult roll={bare as unknown as DiceRolledEvent} isCurrentUser={false} />);
      expect(screen.getByText('24')).toBeInTheDocument();
    });

    it('renders when breakdown is null', () => {
      const nulled = { ...wellFormed(), breakdown: null } as unknown as DiceRolledEvent;
      render(<DiceResult roll={nulled} isCurrentUser={false} />);
      expect(screen.getByText('24')).toBeInTheDocument();
    });
  });
});
