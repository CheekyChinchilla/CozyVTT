/**
 * A tooltip is on the page only while it shows.
 *
 * Hidden, it was still laid out, only transparent, so one beside the right
 * edge of the window made the whole page scroll sideways: 32 pixels on the
 * campaign page at any width, because of the header's last button.
 */

import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Tooltip from '../Tooltip';

afterEach(() => {
  vi.useRealTimers();
});

it('is on the page only while it shows', () => {
  vi.useFakeTimers();
  render(<Tooltip content="Hide session panel"><button>Panel</button></Tooltip>);
  const button = screen.getByRole('button', { name: 'Panel' });
  expect(screen.queryByRole('tooltip')).toBeNull();

  fireEvent.mouseEnter(button);
  act(() => { vi.advanceTimersByTime(400); });
  expect(screen.getByRole('tooltip').textContent).toBe('Hide session panel');
  expect(button.parentElement?.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);

  fireEvent.mouseLeave(button);
  expect(screen.queryByRole('tooltip')).toBeNull();
});
