/**
 * The shape of a built-in starter sheet, declared once for every system's
 * template file.
 */

import type { GameSystem } from '@prisma/client';

export interface CharacterTemplate {
  name: string;
  description: string;
  gameSystem: GameSystem;
  /** The sheet itself. Shaped by `gameSystem`; validated by that system's Zod schema. */
  data: Record<string, unknown>;
}

/** A Flexible sheet's starter: the same, with no game system. */
export type FlexibleCharacterTemplate = Omit<CharacterTemplate, 'gameSystem'> & { gameSystem: null };
