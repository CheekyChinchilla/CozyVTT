/**
 * Rolling from a character sheet, as the D&D 5e and Pathfinder 2e sheets do.
 *
 * - A click or a tap on a d20 test (an ability check, a save, a skill, an
 *   attack) rolls it in the sheet's Roll mode; one on a damage roll or a hit
 *   die rolls it as written, since advantage is a rule for tests only.
 * - A right-click on a test, or a finger held on it for half a second, opens
 *   the roll menu (SheetRollPopup) there, whose choice is the roll's mode
 *   whatever Roll mode is set to.
 *
 * The press is told apart at the sheet's root, for every row that carries
 * `rollTarget`'s attributes, so a row in a list needs no handler of its own
 * for it. It is the panels' long-press (hooks/useLongPress.ts), so its
 * numbers, Android's own long-press and the click iOS sends as the finger
 * lifts are handled as they are on the map. Elsewhere on the sheet the
 * browser keeps its own long-press and right-click. The sheet holds no roll
 * state of its own; this holds the open menu.
 */

import { useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { useLongPress } from '@/hooks/useLongPress';
import { applyRollMode, getModeLabels, type RollMode } from '@/utils/rollModes';
import { SheetRollPopup, type RollPoint } from './SheetRollPopup';

/** Roll at the table; resolves whether the roll was made, when the host can tell. */
export type SheetRollHandler = (expression: string, purpose: string) => void | Promise<boolean>;

/** What marks an element as a d20 test the roll menu offers. */
const ROLL_TARGET = '[data-roll]';

/**
 * The attributes of a row that rolls a d20 test: its roll as a Normal one,
 * which the menu reads, and the title that says how to reach the menu. The
 * row adds `select-none [-webkit-touch-callout:none]` to its classes, so a
 * held finger selects no text and iOS shows no callout.
 */
export function rollTarget(expression: string, purpose: string, gameSystem: string | null) {
  const labels = getModeLabels(gameSystem);
  return {
    'data-roll': expression,
    'data-roll-purpose': purpose,
    title: `Click: roll  |  Right-click or press and hold: ${labels.advantage} / ${labels.disadvantage}`,
  };
}

/** What `rollTarget` gives a row. */
export type RollTargetProps = ReturnType<typeof rollTarget>;

interface OpenMenu { at: RollPoint; expression: string; purpose: string }

/** For the sheet's root element. */
export interface SheetRollRootProps {
  onPointerDown?: (event: PointerEvent<Element>) => void;
  onPointerMove?: (event: PointerEvent<Element>) => void;
  onPointerUp?: (event: PointerEvent<Element>) => void;
  onPointerCancel?: (event: PointerEvent<Element>) => void;
  onContextMenu?: (event: MouseEvent<Element>) => void;
}

export interface SheetRolls {
  /** Rolls as written: a damage roll, a hit die. Closes the menu. */
  roll: (expression: string, purpose: string) => void | Promise<boolean>;
  /** Rolls a d20 test, given as a Normal roll, in the sheet's Roll mode. Closes the menu. */
  rollTest: (expression: string, purpose: string) => void | Promise<boolean>;
  /** Spread on the sheet's root: the right-click and the press and hold, for every test in it. None where the sheet cannot roll. */
  rootProps: SheetRollRootProps;
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

  const openFor = (target: Element, at: RollPoint) => {
    if (!(target instanceof HTMLElement)) return;
    const { roll: expression, rollPurpose: purpose } = target.dataset;
    if (expression === undefined || purpose === undefined) return;
    setOpen({ at, expression, purpose });
  };

  const press = useLongPress((at, on) => openFor(on, at), { within: ROLL_TARGET });

  const rootProps: SheetRollRootProps = onRoll ? {
    onPointerDown: press.onPointerDown,
    onPointerMove: press.onPointerMove,
    onPointerUp: press.onPointerUp,
    onPointerCancel: press.onPointerCancel,
    onContextMenu: (event) => {
      const target = event.target instanceof Element ? event.target.closest(ROLL_TARGET) : null;
      if (!target) return;
      // Android's own long-press of a finger the press is timing: it opens
      // the menu once, whichever of the two comes first.
      if (press.takeContextMenu(event)) return;
      event.preventDefault();
      openFor(target, { clientX: event.clientX, clientY: event.clientY });
    },
  } : {};

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

  return { roll, rollTest, rootProps, menu };
}
