/**
 * Which arrangement the campaign page draws: compact only under a
 * LayoutProvider that says so, and never on any other page. And the page's
 * root while the compact one is up: no pull to refresh.
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

// On Android a downward swipe on the compact header or bar, at the top of a
// page that does not scroll, reloaded the page: the table, mid-session.
it('turns the page root’s overscroll off while the compact arrangement is up, and only then', () => {
  const root = document.documentElement;
  const { rerender, unmount } = render(<LayoutProvider compact={false}><Says /></LayoutProvider>);
  expect(root.style.overscrollBehavior).toBe('');
  expect(document.body.style.overscrollBehavior).toBe('');

  rerender(<LayoutProvider compact><Says /></LayoutProvider>);
  expect(root.style.overscrollBehavior).toBe('none');
  expect(document.body.style.overscrollBehavior).toBe('none');

  rerender(<LayoutProvider compact={false}><Says /></LayoutProvider>);
  expect(root.style.overscrollBehavior).toBe('');
  expect(document.body.style.overscrollBehavior).toBe('');

  rerender(<LayoutProvider compact><Says /></LayoutProvider>);
  unmount();
  expect(root.style.overscrollBehavior).toBe('');
  expect(document.body.style.overscrollBehavior).toBe('');
});
