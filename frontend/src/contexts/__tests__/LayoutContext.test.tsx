/**
 * Which arrangement the campaign page draws: compact only under a
 * LayoutProvider that says so, and never on any other page.
 */

import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LayoutProvider, useCompactLayout } from '../LayoutContext';

function Says() {
  return <p>{useCompactLayout() ? 'compact' : 'desktop'}</p>;
}

it('is the desktop arrangement outside a provider', () => {
  render(<Says />);

  expect(screen.getByText('desktop')).toBeTruthy();
});

it('is what the provider says', () => {
  const { rerender } = render(<LayoutProvider compact><Says /></LayoutProvider>);
  expect(screen.getByText('compact')).toBeTruthy();

  rerender(<LayoutProvider compact={false}><Says /></LayoutProvider>);
  expect(screen.getByText('desktop')).toBeTruthy();
});
