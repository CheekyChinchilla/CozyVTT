/**
 * Game Systems Type Definitions Index (Frontend)
 * Exports all game system types and provides utility types
 * Mirrors backend structure from backend/src/game-systems/index.ts
 */

// Export all D&D 5e types
export * from './dnd5e';
// Export all Pathfinder 2e types
export * from './pathfinder2e';
// Export all Shadowrun 6e types
export * from './shadowrun6e';
// Export all Call of Cthulhu 7e types
export * from './callOfCthulhu7e';

import type { DnD5eCharacterData } from './dnd5e';
import type { PF2eCharacterData } from './pathfinder2e';
import type { SR6CharacterData } from './shadowrun6e';
import type { CoC7eCharacterData } from './callOfCthulhu7e';

/**
 * Game system enum matching backend GameSystem enum
 */
export enum GameSystem {
  DND_5E = 'DND_5E',
  PATHFINDER_2E = 'PATHFINDER_2E',
  SHADOWRUN_6E = 'SHADOWRUN_6E',
  CALL_OF_CTHULHU_7E = 'CALL_OF_CTHULHU_7E',
}

/**
 * Mapped type for character data by game system
 */
export type CharacterDataBySystem = {
  [GameSystem.DND_5E]: DnD5eCharacterData;
  [GameSystem.PATHFINDER_2E]: PF2eCharacterData;
  [GameSystem.SHADOWRUN_6E]: SR6CharacterData;
  [GameSystem.CALL_OF_CTHULHU_7E]: CoC7eCharacterData;
};

/**
 * Union type of all game system character data
 */
export type GameSystemCharacterData =
  | DnD5eCharacterData
  | PF2eCharacterData
  | SR6CharacterData
  | CoC7eCharacterData;
