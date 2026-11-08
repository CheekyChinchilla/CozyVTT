// ============================================
// Feedback for a roll made from a character sheet, which on a phone covers
// the Dice panel: the stat pressed gives a short pulse, the device a short
// buzz where the browser allows one (Chrome on Android; an iPhone lets no
// web page vibrate), and while no Dice log is on the screen a message gives
// the roll's purpose and total once its result arrives.
// ============================================

import { useCallback, useEffect, useRef, type SyntheticEvent } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { diceLogOnScreen } from '@/utils/diceLogOnScreen';
import type { DiceRolledEvent } from '@/types';
import type socketClient from '@/services/socket';

/** How long the pressed stat pulses; the class stays as long under reduced motion, as a highlight. */
export const ROLL_PULSE_MS = 300;
/** How long the device buzzes. */
export const ROLL_BUZZ_MS = 15;
/** How long the result message stays. */
export const ROLL_MESSAGE_MS = 4000;
/** An element of a sheet that rolls when pressed: a d20 test (`rollTarget`) or another roll (`sheetRoll`). */
const ROLLS = '[data-roll], [data-sheet-roll]';
/** Results kept that arrived before the answer to their own roll. */
const KEPT_RESULTS = 20;

function pulse(el: Element | null | undefined) {
  if (!el) return;
  el.classList.remove('roll-pulse');
  el.classList.add('roll-pulse');
  setTimeout(() => el.classList.remove('roll-pulse'), ROLL_PULSE_MS);
}

function buzz() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ROLL_BUZZ_MS);
}

export interface RollFeedback {
  /** For the sheet's container: remembers what each press landed on. */
  onClickCapture: (event: SyntheticEvent) => void;
  /** A roll was just sent from the press remembered: pulse it and buzz. */
  sent: () => void;
  /** The server stored the roll as `id`: say its result as `label` when it arrives. */
  made: (id: string, label: string) => void;
}

export function useRollFeedback(socket: typeof socketClient | null | undefined): RollFeedback {
  const { showToast } = useToast();
  const pressedRef = useRef<Element | null>(null);
  /** Rolls made here whose result has not arrived, by id: the label to give it. */
  const waitingRef = useRef(new Map<string, string>());
  /** Results heard before the answer to their own roll, by id. */
  const heardRef = useRef(new Map<string, DiceRolledEvent>());

  const say = useCallback((label: string, roll: DiceRolledEvent) => {
    if (diceLogOnScreen()) return;
    showToast(`${label}: ${roll.result}${roll.secret ? ' (secret)' : ''}`, 'info', ROLL_MESSAGE_MS);
  }, [showToast]);

  useEffect(() => {
    if (!socket) return;
    const heard = (roll: DiceRolledEvent) => {
      if (!roll.id) return;
      const label = waitingRef.current.get(roll.id);
      if (label !== undefined) {
        waitingRef.current.delete(roll.id);
        say(label, roll);
        return;
      }
      const kept = heardRef.current;
      kept.set(roll.id, roll);
      if (kept.size > KEPT_RESULTS) {
        const oldest = kept.keys().next();
        if (!oldest.done) kept.delete(oldest.value);
      }
    };
    socket.on('dice.rolled', heard);
    socket.on('dice.rolled.secret', heard);
    return () => {
      socket.off('dice.rolled', heard);
      socket.off('dice.rolled.secret', heard);
    };
  }, [socket, say]);

  return {
    onClickCapture: (event) => {
      pressedRef.current = event.target instanceof Element ? event.target : null;
    },
    sent: () => {
      pulse(pressedRef.current?.closest(ROLLS));
      buzz();
      pressedRef.current = null;
    },
    made: (id, label) => {
      const roll = heardRef.current.get(id);
      if (roll) {
        heardRef.current.delete(id);
        say(label, roll);
      } else {
        waitingRef.current.set(id, label);
      }
    },
  };
}
