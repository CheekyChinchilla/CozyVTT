/**
 * The game systems a character or campaign can be set to.
 *
 * The values are decided by the GameSystem enum in backend/prisma/schema.prisma;
 * this is the frontend's one copy, re-exported from types/index.ts and
 * types/game-systems/index.ts. backend/src/__tests__/keepInStep.test.ts fails
 * when the two disagree.
 */
export enum GameSystem {
  DND_5E = 'DND_5E',
  PATHFINDER_2E = 'PATHFINDER_2E',
  SHADOWRUN_6E = 'SHADOWRUN_6E',
  CALL_OF_CTHULHU_7E = 'CALL_OF_CTHULHU_7E',
}
