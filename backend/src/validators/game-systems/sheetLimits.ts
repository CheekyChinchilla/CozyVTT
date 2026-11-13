// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

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
 * 5E and Fantasy d20: spell slots of one level, in total. A 20th-level
 * caster has at most four of a level; a 5E sheet draws one mark per slot.
 */
export const SPELL_SLOTS_MAX = 20;

/**
 * Typed sheets: entries in one list. Inventory, attacks, spells, features,
 * conditions, languages and the rest of the lists on a 5E, Fantasy d20
 * or Horror d100 sheet all stop here, unless a list has a lower limit of
 * its own. Even a wizard's spellbook or a party's pooled inventory seldom
 * passes a hundred entries, so this is five times what the longest real list
 * holds, and a sheet drawing this many rows is slow but never frozen.
 */
export const SHEET_LIST_MAX = 500;

/**
 * Typed sheets: entries in a list inside one row, such as the traits of one
 * Fantasy d20 strike. A weapon has about ten, so this is five times that,
 * and low because it multiplies by the rows around it.
 */
export const SHEET_ROW_TAGS_MAX = 50;

/**
 * Horror d100: a characteristic, a skill's rating, MOV or an armour value. A
 * human's characteristics stop near 21 and a master's skill a little past
 * 100, and a creature's run higher, so this only stops a number that is no
 * rating at all.
 */
export const HORROR_D100_VALUE_MAX = 999;

/**
 * Horror d100: the two lists that a sheet converted from the shape before
 * 1.7.0 can hold more entries in than SHEET_LIST_MAX. Up to 500 firearms of
 * the player's own join the old sheet's three printed ones in Firearm, and
 * up to 500 skills of the player's own join the four skills the conversion
 * moves into the character's own skills. Each takes that many more, so such a
 * sheet can still be saved.
 */
export const HORROR_D100_FIREARM_LIST_MAX = SHEET_LIST_MAX + 3;
export const HORROR_D100_OWN_SKILL_LIST_MAX = SHEET_LIST_MAX + 4;

/**
 * Fantasy d20: an item bonus, or an item penalty. In the rules they run
 * from +4 down to -2, so this admits homebrew several times over and stays
 * far below the dice roller's own limit of 9,999 on a modifier.
 */
export const FANTASY_D20_ITEM_BONUS_MIN = -30;
export const FANTASY_D20_ITEM_BONUS_MAX = 30;

/**
 * 5E: skills of the player's own, such as tool proficiencies. A character
 * proficient in every tool in the rules has about forty, and nobody records
 * them all as skills.
 */
export const FIFTH_EDITION_CUSTOM_SKILLS_MAX = 30;

/**
 * 5E: further damage lines on one attack, such as a versatile weapon's
 * two-handed die or a spell's damage at a higher level.
 */
export const FIFTH_EDITION_ATTACK_DAMAGE_ROLLS_MAX = 10;

/**
 * 5E: properties on one attack. The rules name eleven, and a weapon
 * carries a few.
 */
export const FIFTH_EDITION_WEAPON_PROPERTIES_MAX = 20;

/** 5E: one of the four proficiency boxes (armor, weapons, tools, languages). */
export const FIFTH_EDITION_PROFICIENCY_BOX_MAX = 2000;

/** 5E: the name of a skill of the player's own. */
export const FIFTH_EDITION_CUSTOM_SKILL_NAME_MAX = 60;

/** 5E: one row's hit die, such as "d10", or "2d6" where a game uses that. */
export const FIFTH_EDITION_HIT_DIE_MAX = 50;

/** 5E: a further damage line's label ("Two-handed") and its dice. */
export const FIFTH_EDITION_DAMAGE_ROLL_TEXT_MAX = 60;

/** 5E: a further damage line's damage type. */
export const FIFTH_EDITION_DAMAGE_TYPE_MAX = 40;

/** 5E: one property of an attack, bounded so the field cannot be used as storage. */
export const FIFTH_EDITION_WEAPON_PROPERTY_LENGTH_MAX = 60;
