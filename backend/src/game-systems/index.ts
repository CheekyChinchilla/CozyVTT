/**
 * Game Systems Type Definitions Index
 * Exports all game system types and provides utility types and type guards
 */

// Export all D&D 5e types
export * from './dnd5e';
// Export all Pathfinder 2e types
export * from './pathfinder2e';
// Export all Shadowrun 6e types
export * from './shadowrun6e';
// Export all Call of Cthulhu 7e types
export * from './callOfCthulhu7e';

import { DnD5eCharacterData } from './dnd5e';
import { PF2eCharacterData } from './pathfinder2e';
import { SR6CharacterData } from './shadowrun6e';
import { CoC7eCharacterData } from './callOfCthulhu7e';

/**
 * Game system enum matching Prisma GameSystem enum
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

/**
 * Type guard for D&D 5e character data
 * @param data - The character data to check
 * @param gameSystem - Optional game system to validate against
 * @returns True if the data matches D&D 5e structure
 */
export function isDnD5eData(
  data: unknown,
  gameSystem?: string
): data is DnD5eCharacterData {
  if (gameSystem && gameSystem !== GameSystem.DND_5E) {
    return false;
  }

  const candidate = data as DnD5eCharacterData;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'characterName' in candidate &&
    'class' in candidate &&
    'level' in candidate &&
    'race' in candidate &&
    'stats' in candidate &&
    typeof candidate.stats === 'object' &&
    'strength' in candidate.stats &&
    'hitDice' in candidate
  );
}

/**
 * Type guard for Pathfinder 2e character data
 * @param data - The character data to check
 * @param gameSystem - Optional game system to validate against
 * @returns True if the data matches Pathfinder 2e structure
 */
export function isPathfinder2eData(
  data: unknown,
  gameSystem?: string
): data is PF2eCharacterData {
  if (gameSystem && gameSystem !== GameSystem.PATHFINDER_2E) {
    return false;
  }

  const candidate = data as PF2eCharacterData;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'characterName' in candidate &&
    'class' in candidate &&
    'level' in candidate &&
    'ancestry' in candidate &&
    'heritage' in candidate &&
    'attributes' in candidate &&
    typeof candidate.attributes === 'object' &&
    'heroPoints' in candidate &&
    'armorClass' in candidate &&
    typeof candidate.armorClass === 'object' &&
    'proficiencyRank' in candidate.armorClass
  );
}

/**
 * Type guard for Shadowrun 6e character data
 * @param data - The character data to check
 * @param gameSystem - Optional game system to validate against
 * @returns True if the data matches Shadowrun 6e structure
 */
export function isShadowrun6eData(
  data: unknown,
  gameSystem?: string
): data is SR6CharacterData {
  if (gameSystem && gameSystem !== GameSystem.SHADOWRUN_6E) {
    return false;
  }

  const candidate = data as SR6CharacterData;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'characterName' in candidate &&
    'metatype' in candidate &&
    'archetype' in candidate &&
    'karma' in candidate &&
    typeof candidate.karma === 'object' &&
    'attributes' in candidate &&
    typeof candidate.attributes === 'object' &&
    'physical' in candidate.attributes &&
    'mental' in candidate.attributes &&
    'special' in candidate.attributes &&
    'edgePoints' in candidate &&
    'conditionMonitors' in candidate
  );
}

/**
 * Type guard for Call of Cthulhu 7e character data
 * @param data - The character data to check
 * @param gameSystem - Optional game system to validate against
 * @returns True if the data matches Call of Cthulhu 7e structure
 */
export function isCallOfCthulhu7eData(
  data: unknown,
  gameSystem?: string
): data is CoC7eCharacterData {
  if (gameSystem && gameSystem !== GameSystem.CALL_OF_CTHULHU_7E) {
    return false;
  }

  const candidate = data as CoC7eCharacterData;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'investigatorName' in candidate &&
    'occupation' in candidate &&
    'era' in candidate &&
    'characteristics' in candidate &&
    typeof candidate.characteristics === 'object' &&
    'STR' in candidate.characteristics &&
    'CON' in candidate.characteristics &&
    'derivedStats' in candidate &&
    typeof candidate.derivedStats === 'object' &&
    'sanity' in candidate.derivedStats
  );
}

/**
 * Get character data for a specific game system with type safety
 * @param gameSystem - The game system
 * @param data - The character data
 * @returns Typed character data or null if validation fails
 */
export function getTypedCharacterData<T extends GameSystem>(
  gameSystem: T,
  data: unknown
): CharacterDataBySystem[T] | null {
  switch (gameSystem) {
    case GameSystem.DND_5E:
      return isDnD5eData(data) ? (data as CharacterDataBySystem[T]) : null;
    case GameSystem.PATHFINDER_2E:
      return isPathfinder2eData(data) ? (data as CharacterDataBySystem[T]) : null;
    case GameSystem.SHADOWRUN_6E:
      return isShadowrun6eData(data) ? (data as CharacterDataBySystem[T]) : null;
    case GameSystem.CALL_OF_CTHULHU_7E:
      return isCallOfCthulhu7eData(data) ? (data as CharacterDataBySystem[T]) : null;
    default:
      return null;
  }
}

/**
 * Validate that character data matches its declared game system
 * @param gameSystem - The declared game system
 * @param data - The character data to validate
 * @returns True if data structure matches the game system
 */
export function validateCharacterData(
  gameSystem: GameSystem | string,
  data: unknown
): boolean {
  switch (gameSystem) {
    case GameSystem.DND_5E:
      return isDnD5eData(data, gameSystem);
    case GameSystem.PATHFINDER_2E:
      return isPathfinder2eData(data, gameSystem);
    case GameSystem.SHADOWRUN_6E:
      return isShadowrun6eData(data, gameSystem);
    case GameSystem.CALL_OF_CTHULHU_7E:
      return isCallOfCthulhu7eData(data, gameSystem);
    default:
      return false;
  }
}
