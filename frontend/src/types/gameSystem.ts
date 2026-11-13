/**
 * The game systems a character or campaign can be set to.
 *
 * The values are the ones the backend supports, SUPPORTED_GAME_SYSTEMS in
 * backend/src/game-systems/index.ts; this is the frontend's one copy,
 * re-exported from types/index.ts and types/game-systems/index.ts.
 * backend/src/__tests__/keepInStep.test.ts fails when the two disagree.
 *
 * Versions before 1.7.0 gave the systems other values, which a character
 * file an older version exported still holds; legacy/gameSystemAliases.ts
 * reads each as its new one. isGameSystem in constants/game-systems.ts tells
 * these from any other value, which the app shows as Unsupported system.
 */
export enum GameSystem {
  FIFTH_EDITION = 'FIFTH_EDITION',
  FANTASY_D20 = 'FANTASY_D20',
  HORROR_D100 = 'HORROR_D100',
}
