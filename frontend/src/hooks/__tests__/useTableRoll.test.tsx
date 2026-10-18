/**
 * A roll made from a sheet, a roll picker or the map's menus says when it is
 * refused.
 *
 * These sent the roll and forgot it: refused (too many rolls, no connection),
 * nothing happened where it was made, and the Dice panel, which caught every
 * error on the socket, showed the reason in a tab that might not be open.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DiceRollAck, DiceRollEvent } from '@/types';

const showToast = vi.fn();
const rollDice = vi.fn<(roll: DiceRollEvent) => Promise<DiceRollAck>>();
let socket: { rollDice: typeof rollDice } | null = { rollDice };

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));

import { useTableRoll } from '../useTableRoll';

beforeEach(() => {
  showToast.mockReset();
  rollDice.mockReset();
  socket = { rollDice };
});

it('makes the roll and says nothing more when it is made', async () => {
  rollDice.mockResolvedValueOnce({ ok: true, id: 'r-1' });
  const { result } = renderHook(() => useTableRoll(socket as never));

  let made: boolean | undefined;
  await act(async () => { made = await result.current({ expression: '1d20+5', purpose: 'Athletics', characterName: 'Brann' }); });

  expect(made).toBe(true);
  expect(rollDice).toHaveBeenCalledWith({ expression: '1d20+5', purpose: 'Athletics', characterName: 'Brann' });
  expect(showToast).not.toHaveBeenCalled();
});

it('says why when the roll is refused', async () => {
  rollDice.mockResolvedValueOnce({ ok: false, error: 'Rate limit exceeded. Wait a moment.' });
  const { result } = renderHook(() => useTableRoll(socket as never));

  let made: boolean | undefined;
  await act(async () => { made = await result.current({ expression: '1d20' }); });

  expect(made).toBe(false);
  expect(showToast).toHaveBeenCalledWith('Roll not made: Rate limit exceeded. Wait a moment.', 'error');
});

it('says so when there is no table to roll on', async () => {
  socket = null;
  const { result } = renderHook(() => useTableRoll(socket as never));

  let made: boolean | undefined;
  await act(async () => { made = await result.current({ expression: '1d20' }); });

  expect(made).toBe(false);
  expect(showToast).toHaveBeenCalledWith('Roll not made: Not connected to server', 'error');
});
