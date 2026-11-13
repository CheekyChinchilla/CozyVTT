// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * How a game system writes a creature's numbers, which decides what the
 * token editor and the Creature Library's form offer (see "Derived versus
 * printed" in docs/GAME_SYSTEMS.md).
 *
 * - `derived`: 5E. Saves and skills are worked out from the ability scores
 *   and the Challenge Rating.
 * - `fantasyD20`: Fantasy d20. A Level and printed attribute modifiers, saves and
 *   skills, checked loosely against the level's benchmarks.
 * - `printed`: Horror d100, which has neither a rating nor a proficiency bonus.
 *   The scores and skills are stored as typed.
 */

import type { NpcStatBlock } from '@/types';
import { isGameSystem } from '@/constants/game-systems';
import type { AbilityKey } from '@/utils/rules/fifthEdition';

export type CreatureModel = 'derived' | 'fantasyD20' | 'printed';

/** The model for a campaign's game system; 5E's for an unknown or unset one, as `buildNpcRolls` treats it. */
export function creatureModel(gameSystem: string | null | undefined): CreatureModel {
  switch (gameSystem) {
    case 'FANTASY_D20':
      return 'fantasyD20';
    case 'HORROR_D100':
      return 'printed';
    default:
      return 'derived';
  }
}

/**
 * The name of one of the stat block's six score slots in a game system. A
 * Horror d100 creature keeps its characteristics in them, as the open d100
 * rules name them: POW in Wisdom's slot, and CHA in Charisma's, which the
 * slot's own name already gives.
 */
export function scoreLabel(gameSystem: string | null | undefined, ability: AbilityKey): string {
  if (gameSystem === 'HORROR_D100') {
    if (ability === 'wis') return 'POW';
  }
  return ability.toUpperCase();
}

/**
 * The stat block named for the game system it is edited in. The server reads
 * that name to choose the bounds on its scores and skills
 * (statBlockNumberBounds), so a Horror d100 creature may hold STR 60.
 * With no game system, or one this build does not know (the value of a
 * system CozyVTT no longer supports), the stat block keeps the one it has.
 */
export function withGameSystem<T extends Partial<NpcStatBlock>>(statBlock: T, gameSystem: string | null | undefined): T {
  return isGameSystem(gameSystem) ? { ...statBlock, gameSystem } : statBlock;
}
