/**
 * The game systems a character or campaign can be set to.
 *
 * Declared once, as the GameSystem enum in prisma/schema.prisma; this module
 * re-exports Prisma's so the rest of the backend imports it from one place.
 * What each system's sheet holds is decided by its Zod schema in
 * validators/game-systems/.
 */
export { GameSystem } from '@prisma/client';
