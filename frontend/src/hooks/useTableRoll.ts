// ============================================
// Rolling at the table from outside the Dice panel
// ============================================

import { useCallback } from 'react';
import { useToast } from '@/contexts/ToastContext';
import type { DiceRollEvent } from '@/types';
import type socketClient from '@/services/socket';

/**
 * Roll from a sheet, a roll picker or the map's menus: sends the roll and,
 * when the server refuses it or there is no table to roll on, says why in a
 * message where it was made. These places used to send it and forget it.
 * Resolves true when the roll was made, so whatever it pays for (a hit die)
 * is spent only then. `socket` is the page's, or none where there is no
 * table (the Characters page).
 */
export function useTableRoll(socket: typeof socketClient | null | undefined): (roll: DiceRollEvent) => Promise<boolean> {
  const { showToast } = useToast();
  return useCallback(async (roll: DiceRollEvent) => {
    const answer = socket ? await socket.rollDice(roll) : { ok: false as const, error: 'Not connected to server' };
    if (!answer.ok) showToast(`Roll not made: ${answer.error}`, 'error');
    return answer.ok;
  }, [socket, showToast]);
}
