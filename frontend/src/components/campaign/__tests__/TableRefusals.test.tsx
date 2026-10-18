/**
 * A refusal from the table is shown as a message, once.
 *
 * Refusals sent without a request waiting for them (a token moved during a
 * pause, initiative after combat has started, a DM's control) reached only
 * the Dice panel's banner, in a tab that might not be open; now that the
 * panel shows only its own rolls, they are shown here instead.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

const showToast = vi.fn();
let onRefusal: ((data: { message?: string }) => void) | null = null;
let joined = true;
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: {
      onServerRefusal: (fn: (data: { message?: string }) => void) => { onRefusal = fn; },
      off: vi.fn(),
      hasJoined: () => joined,
    },
  }),
}));

import TableRefusals from '../TableRefusals';

beforeEach(() => {
  showToast.mockReset();
  onRefusal = null;
  joined = true;
});

it('shows a refusal as a message', () => {
  render(<TableRefusals />);
  act(() => onRefusal!({ message: 'Combat has started — ask your DM to change your initiative' }));
  expect(showToast).toHaveBeenCalledWith('Combat has started — ask your DM to change your initiative', 'error');
});

it('shows the same refusal once when it repeats at once', () => {
  render(<TableRefusals />);
  act(() => { onRefusal!({ message: 'Token not found' }); onRefusal!({ message: 'Token not found' }); });
  expect(showToast).toHaveBeenCalledTimes(1);
});

it('leaves a refusal before the page has joined to the connection status', () => {
  joined = false;
  render(<TableRefusals />);
  act(() => onRefusal!({ message: 'Too many CozyVTT tabs or devices are open on this account at once' }));
  expect(showToast).not.toHaveBeenCalled();
});
