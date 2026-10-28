/**
 * Rolling from a character sheet, as the D&D 5e and Pathfinder 2e sheets do:
 * a click on a stat rolls it, and a right-click opens the roll menu
 * (SheetRollPopup) for Advantage or Disadvantage. The sheet holds no roll
 * state of its own; this holds the open menu.
 */

import { useState, type MouseEvent, type ReactNode } from 'react';
import { SheetRollPopup, type RollPoint } from './SheetRollPopup';

/** Roll at the table; resolves whether the roll was made, when the host can tell. */
export type SheetRollHandler = (expression: string, purpose: string) => void | Promise<boolean>;

interface OpenMenu { at: RollPoint; expression: string; purpose: string }

export interface SheetRolls {
  /** Rolls as written, and closes the menu. */
  roll: (expression: string, purpose: string) => void | Promise<boolean>;
  /** A right-click on a d20 test: opens its menu at the pointer. */
  openMenu: (event: MouseEvent, expression: string, purpose: string) => void;
  /** The open menu, for the sheet to render; null while none is. */
  menu: ReactNode;
}

export function useSheetRolls(onRoll: SheetRollHandler | undefined, gameSystem: string | null): SheetRolls {
  const [open, setOpen] = useState<OpenMenu | null>(null);

  const roll = (expression: string, purpose: string) => {
    setOpen(null);
    return onRoll?.(expression, purpose);
  };

  const openMenu = (event: MouseEvent, expression: string, purpose: string) => {
    event.preventDefault();
    setOpen({ at: { clientX: event.clientX, clientY: event.clientY }, expression, purpose });
  };

  const menu = open && onRoll ? (
    <SheetRollPopup
      at={open.at}
      expression={open.expression}
      purpose={open.purpose}
      gameSystem={gameSystem}
      onRoll={(expression, purpose) => { void roll(expression, purpose); }}
      onClose={() => setOpen(null)}
    />
  ) : null;

  return { roll, openMenu, menu };
}
