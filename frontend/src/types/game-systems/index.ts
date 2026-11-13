/**
 * Game Systems Type Definitions Index (Frontend)
 * Exports all game system types and provides utility types.
 * Each sheet type follows its Zod schema in backend/src/validators/game-systems/,
 * and backend/src/__tests__/keepInStep.test.ts fails when one drifts.
 */

// Export all 5E types
export * from './fifthEdition';
// Export all Fantasy d20 types
export * from './fantasyD20';
// Export all Horror d100 types
export * from './horrorD100Sheet';

import type { FifthEditionCharacterData } from './fifthEdition';
import type { FantasyD20CharacterData } from './fantasyD20';
import type { HorrorD100Sheet } from './horrorD100Sheet';

import { GameSystem } from '../gameSystem';

export { GameSystem };

/**
 * Mapped type for character data by game system
 */
export type CharacterDataBySystem = {
  [GameSystem.FIFTH_EDITION]: FifthEditionCharacterData;
  [GameSystem.FANTASY_D20]: FantasyD20CharacterData;
  [GameSystem.HORROR_D100]: HorrorD100Sheet;
};

/**
 * Union type of all game system character data
 */
export type GameSystemCharacterData =
  | FifthEditionCharacterData
  | FantasyD20CharacterData
  | HorrorD100Sheet;

export type { SheetChrome } from './sheetChrome';
