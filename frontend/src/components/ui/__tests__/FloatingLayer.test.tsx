/**
 * FloatingLayer draws a menu or a picker on the body, outside the campaign
 * page's panel group, whose dividers take any press inside the group that
 * lands in their strip. It adds no element of its own, so what it holds keeps
 * its own root, and React's events still reach the components it sits in.
 */

import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FloatingLayer from '../FloatingLayer';

it('draws what it holds on the body, from inside the panel group', () => {
  render(
    <div data-group>
      <FloatingLayer>
        <div role="menu" aria-label="Token" />
      </FloatingLayer>
    </div>,
  );

  const menu = screen.getByRole('menu', { name: 'Token' });
  expect(menu.parentElement).toBe(document.body);
  expect(menu.closest('[data-group]')).toBeNull();
});

it('hands a click to the components it sits in, as one drawn in place', () => {
  const onAncestor = vi.fn();
  render(
    <div onClick={onAncestor}>
      <FloatingLayer>
        <button type="button">Item</button>
      </FloatingLayer>
    </div>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Item' }));
  expect(onAncestor).toHaveBeenCalledTimes(1);
});

// The map's menus close on a click anywhere in the window and stop their own
// clicks from reaching it.
it('keeps a click its menu stops from the window', () => {
  const onWindow = vi.fn();
  window.addEventListener('click', onWindow);
  try {
    render(
      <FloatingLayer>
        <div onClick={(e) => e.stopPropagation()}>
          <button type="button">Item</button>
        </div>
      </FloatingLayer>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Item' }));
  } finally {
    window.removeEventListener('click', onWindow);
  }
  expect(onWindow).not.toHaveBeenCalled();
});
