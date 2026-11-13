/**
 * The shape of a built-in starter sheet, declared once for every system's
 * template file.
 */

import type { SupportedGameSystem } from '../../game-systems';

export interface CharacterTemplate {
  name: string;
  description: string;
  gameSystem: SupportedGameSystem;
  /** The sheet itself. Shaped by `gameSystem`; validated by that system's Zod schema. */
  data: Record<string, unknown>;
}

/** A Flexible sheet's starter: the same, with no game system. */
export type FlexibleCharacterTemplate = Omit<CharacterTemplate, 'gameSystem'> & { gameSystem: null };
