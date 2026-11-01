import type { DiceMacro } from '@/types';

/** What a saved roll keeps besides its dice. */
type SavedRoll = Pick<DiceMacro, 'name' | 'characterName' | 'purpose'>;

/**
 * Who a roll from the dice panel is made as and what it is for, from the
 * panel's Character and Purpose boxes and, for a saved roll's button, the
 * saved roll.
 *
 * The Character box wins whenever it has something in it; while it is empty
 * a saved roll is made as its own character, if it has one. A saved roll goes
 * out with its own purpose, or its name when it has none, and the Purpose box
 * is left for typed rolls, as it was before a saved roll had a purpose. Empty
 * strings mean none.
 */
export function rollLabels(
  boxes: { characterName: string; purpose: string },
  saved?: SavedRoll
): { characterName: string; purpose: string } {
  return {
    characterName: boxes.characterName.trim() || saved?.characterName?.trim() || '',
    purpose: saved ? saved.purpose?.trim() || saved.name.trim() : boxes.purpose.trim(),
  };
}

/**
 * "as Goblin boss, for Scimitar attack", or the half a saved roll has, or ''
 * for one with neither.
 */
export function savedRollDetail(macro: Pick<DiceMacro, 'characterName' | 'purpose'>): string {
  return [macro.characterName && `as ${macro.characterName}`, macro.purpose && `for ${macro.purpose}`]
    .filter(Boolean)
    .join(', ');
}
