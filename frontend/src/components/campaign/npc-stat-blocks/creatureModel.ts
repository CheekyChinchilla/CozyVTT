/**
 * How a game system writes a creature's numbers, which decides what the
 * token editor and the Creature Library's form offer (see "Derived versus
 * printed" in docs/GAME_SYSTEMS.md).
 *
 * - `derived`: D&D 5e. Saves and skills are worked out from the ability scores
 *   and the Challenge Rating.
 * - `pf2e`: Pathfinder 2e. A Level and printed attribute modifiers, saves and
 *   skills, checked loosely against the level's benchmarks.
 * - `printed`: Call of Cthulhu 7e and Shadowrun 6e, which have neither a rating
 *   nor a proficiency bonus. The scores and skills are stored as typed.
 */

import type { NpcStatBlock } from '@/types';
import type { AbilityKey } from '@/utils/rules/dnd5e';

export type CreatureModel = 'derived' | 'pf2e' | 'printed';

/** The model for a campaign's game system; D&D 5e's for an unknown or unset one, as `buildNpcRolls` treats it. */
export function creatureModel(gameSystem: string | null | undefined): CreatureModel {
  switch (gameSystem) {
    case 'PATHFINDER_2E':
      return 'pf2e';
    case 'CALL_OF_CTHULHU_7E':
    case 'SHADOWRUN_6E':
      return 'printed';
    default:
      return 'derived';
  }
}

/**
 * The name of one of the stat block's six score slots in a game system. A
 * Call of Cthulhu creature keeps its characteristics in them, POW in Wisdom's
 * slot and APP in Charisma's.
 */
export function scoreLabel(gameSystem: string | null | undefined, ability: AbilityKey): string {
  if (gameSystem === 'CALL_OF_CTHULHU_7E') {
    if (ability === 'wis') return 'POW';
    if (ability === 'cha') return 'APP';
  }
  return ability.toUpperCase();
}

/**
 * The stat block named for the game system it is edited in. The server reads
 * that name to choose the bounds on its scores and skills
 * (statBlockNumberBounds), so a Call of Cthulhu creature may hold STR 60.
 * With no game system the stat block keeps the one it has.
 */
export function withGameSystem<T extends Partial<NpcStatBlock>>(statBlock: T, gameSystem: string | null | undefined): T {
  return gameSystem ? { ...statBlock, gameSystem } : statBlock;
}
