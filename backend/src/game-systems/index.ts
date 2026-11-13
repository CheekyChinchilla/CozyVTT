/**
 * The game systems a character or campaign can be set to.
 *
 * Declared once, as the GameSystem enum in prisma/schema.prisma; this module
 * re-exports Prisma's so the rest of the backend imports it from one place.
 * What each system's sheet holds is decided by its Zod schema in
 * validators/game-systems/.
 *
 * Until 1.7.0 the enum held one value more, that of an unreleased system;
 * 1.7.0's migration gave its rows no system and dropped it, so every value
 * the enum holds is supported, and no stored row holds any other. Requests
 * may still name a system by the value an older version used
 * (legacy/gameSystemAliases.ts). isSupportedGameSystem tells a supported
 * system from any other value a request or a file gives.
 */
import { GameSystem } from '@prisma/client';

export { GameSystem };

/** The game systems a character, campaign, template or creature may be given. */
export const SUPPORTED_GAME_SYSTEMS = [GameSystem.FIFTH_EDITION, GameSystem.FANTASY_D20, GameSystem.HORROR_D100] as const;

export type SupportedGameSystem = (typeof SUPPORTED_GAME_SYSTEMS)[number];

/** Whether `value` is one of the supported game systems. */
export function isSupportedGameSystem(value: unknown): value is SupportedGameSystem {
  return (SUPPORTED_GAME_SYSTEMS as readonly unknown[]).includes(value);
}

/**
 * What a request answers for a game system value that is not one of the
 * supported ones. It names no identifier and repeats nothing it was sent,
 * so no system's identifier, the unreleased one's included, reaches a
 * screen from a refusal.
 */
export const GAME_SYSTEM_NOT_SUPPORTED = 'CozyVTT does not support that game system.';
