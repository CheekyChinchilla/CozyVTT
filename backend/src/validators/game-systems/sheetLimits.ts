/**
 * The limits on what a character sheet holds, shared by every system's
 * schema and by the sheet editors.
 *
 * These are abuse ceilings, set far above anything a player types: a sheet is
 * shown to the whole table, so one field the size of a novel, or a list of a
 * million rows, lands in everyone's browser. A sheet stored before a limit
 * existed still loads; a save over one is refused, naming the field.
 *
 * This file exists twice, as backend/src/validators/game-systems/sheetLimits.ts
 * and frontend/src/constants/sheetLimits.ts, and a test keeps the two copies
 * identical, so an editor never lets a player type more than the server takes.
 */

/**
 * A character's name, and any other name or heading: the most the
 * character's own name column takes.
 */
export const SHEET_NAME_MAX = 200;

/** Any other one-line box: a class, a damage roll, a list entry. */
export const SHEET_SHORT_TEXT_MAX = 1000;

/**
 * A multi-line box: a backstory, notes, a feature's rules text. The same
 * limit as a personal note.
 */
export const SHEET_LONG_TEXT_MAX = 100_000;

/** An id the sheet gives a row, section or column so it can be told apart. */
export const SHEET_ID_MAX = 100;

/** Flexible sheets: sections on one sheet. */
export const FLEXIBLE_MAX_SECTIONS = 100;

/** Flexible sheets: stats in one stats section. */
export const FLEXIBLE_MAX_FIELDS = 200;

/** Flexible sheets: entries in one list section, and rows in one table. */
export const FLEXIBLE_MAX_ROWS = 1000;

/** Flexible sheets: columns in one table. */
export const FLEXIBLE_MAX_COLUMNS = 50;

/**
 * D&D 5e and Pathfinder 2e: spell slots of one level, in total. A 20th-level
 * caster has at most four of a level; a D&D sheet draws one mark per slot.
 */
export const SPELL_SLOTS_MAX = 20;

/**
 * Typed sheets: entries in one list. Inventory, attacks, spells, features,
 * conditions, languages and the rest of the lists on a D&D 5e, Pathfinder 2e
 * or Call of Cthulhu sheet all stop here, unless a list has a lower limit of
 * its own. Even a wizard's spellbook or a party's pooled inventory seldom
 * passes a hundred entries, so this is five times what the longest real list
 * holds, and a sheet drawing this many rows is slow but never frozen.
 */
export const SHEET_LIST_MAX = 500;

/**
 * Typed sheets: entries in a list inside one row, such as the traits of one
 * Pathfinder 2e strike. A weapon has about ten, so this is five times that,
 * and low because it multiplies by the rows around it.
 */
export const SHEET_ROW_TAGS_MAX = 50;

/**
 * Pathfinder 2e: an item bonus, or an item penalty. The Core Rulebook's run
 * from +4 down to -2, so this admits homebrew several times over and stays far
 * below the dice roller's own limit of 9,999 on a modifier.
 */
export const PF2E_ITEM_BONUS_MIN = -30;
export const PF2E_ITEM_BONUS_MAX = 30;
