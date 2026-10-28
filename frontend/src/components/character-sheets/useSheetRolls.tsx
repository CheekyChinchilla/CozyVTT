/**
 * Rolling from a character sheet, as the D&D 5e and Pathfinder 2e sheets do.
 * A click on a d20 test (an ability check, a save, a skill, an attack) rolls
 * it in the sheet's Roll mode; a click on a damage roll or a hit die rolls it
 * as written, since advantage is a rule for tests only. A right-click on a
 * test opens the roll menu (SheetRollPopup), whose choice is the roll's mode
 * whatever Roll mode is set to. The sheet holds no roll state of its own;
 * this holds the open menu.
 */

import { useState, type MouseEvent, type ReactNode } from 'react';
import { applyRollMode, type RollMode } from '@/utils/rollModes';
import { SheetRollPopup, type RollPoint } from './SheetRollPopup';

/** Roll at the table; resolves whether the roll was made, when the host can tell. */
export type SheetRollHandler = (expression: string, purpose: string) => void | Promise<boolean>;

interface OpenMenu { at: RollPoint; expression: string; purpose: string }

export interface SheetRolls {
  /** Rolls as written: a damage roll, a hit die. Closes the menu. */
  roll: (expression: string, purpose: string) => void | Promise<boolean>;
  /** Rolls a d20 test, given as a Normal roll, in the sheet's Roll mode. Closes the menu. */
  rollTest: (expression: string, purpose: string) => void | Promise<boolean>;
  /** A right-click on a d20 test: opens its menu at the pointer. */
  openMenu: (event: MouseEvent, expression: string, purpose: string) => void;
  /** The open menu, for the sheet to render; null while none is. */
  menu: ReactNode;
}

export function useSheetRolls(
  onRoll: SheetRollHandler | undefined,
  gameSystem: string | null,
  rollMode: RollMode = 'normal'
): SheetRolls {
  const [open, setOpen] = useState<OpenMenu | null>(null);

  const roll = (expression: string, purpose: string) => {
    setOpen(null);
    return onRoll?.(expression, purpose);
  };

  const rollTest = (expression: string, purpose: string) => {
    const inMode = applyRollMode(expression, purpose, rollMode, gameSystem);
    return roll(inMode.expression, inMode.purpose);
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

  return { roll, rollTest, openMenu, menu };
}
