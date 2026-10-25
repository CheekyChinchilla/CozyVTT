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
