import { z } from 'zod';
import { GAME_SYSTEM_NOT_SUPPORTED, SUPPORTED_GAME_SYSTEMS } from '../game-systems';
import { normaliseGameSystem } from '../legacy/gameSystemAliases';

/**
 * A game system a request may name: one CozyVTT supports, by its value or by
 * the value an older version gave it (legacy/gameSystemAliases.ts), which is
 * read as the new one. Any other value is refused with
 * GAME_SYSTEM_NOT_SUPPORTED, in place of the list of the identifiers it
 * would take.
 */
export const GameSystemSchema = z.preprocess(
  (value) => normaliseGameSystem(value) ?? value,
  z.enum(SUPPORTED_GAME_SYSTEMS, { error: GAME_SYSTEM_NOT_SUPPORTED }),
);
