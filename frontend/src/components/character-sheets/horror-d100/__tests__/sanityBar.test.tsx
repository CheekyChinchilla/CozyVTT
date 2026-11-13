/**
 * Sanity's "current / maximum" sits beside its state, not on the bar.
 *
 * Drawn over the bar, the number was half on the coloured fill and half on
 * the empty track, and no one text colour reads on both in every theme (on
 * the Fragile fill it was about 3.5:1 in Shadow Realm).
 */
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SanityTracker } from '../components/SanityTracker';

it('is not drawn on the bar', () => {
  render(<SanityTracker current={30} starting={60} maximum={80} />);
  const number = screen.getByText('30 / 80');
  expect(number.closest('.rounded-full')).toBeNull();
  expect(screen.getByText('Fragile')).toBeInTheDocument();
});

// The state and the bar were current over maximum. A character whose maximum
// has fallen to 1 (Knowledge (Blasphemous Lore) at 99) and who has 1 left then
// showed a full bar and "Stable", the healthiest on the table.
it('judges the state and the bar against the Sanity the character started with', () => {
  const { container, rerender } = render(<SanityTracker current={1} starting={55} maximum={1} />);
  const bar = () => container.querySelector<HTMLElement>('.rounded-full > div')?.style.width;
  expect(screen.getByText('1 / 1')).toBeInTheDocument();
  expect(screen.getByText('Breaking')).toBeInTheDocument();
  expect(bar()).toBe('2%');

  rerender(<SanityTracker current={48} starting={55} maximum={94} />);
  expect(screen.getByText('Stable')).toBeInTheDocument();
  expect(bar()).toBe('87%');

  // Sanity regained past the start fills the bar and no more.
  rerender(<SanityTracker current={70} starting={55} maximum={94} />);
  expect(screen.getByText('Stable')).toBeInTheDocument();
  expect(bar()).toBe('100%');
});

it('judges against the maximum where the sheet holds no starting Sanity', () => {
  const { container } = render(<SanityTracker current={20} starting={0} maximum={80} />);
  expect(screen.getByText('Breaking')).toBeInTheDocument();
  expect(container.querySelector<HTMLElement>('.rounded-full > div')?.style.width).toBe('25%');
});
