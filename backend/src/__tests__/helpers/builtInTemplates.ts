/**
 * Every built-in character template of each game system, for the tests that
 * check them against the schemas and the rules. Keyed by every supported
 * game system, so a system added to SUPPORTED_GAME_SYSTEMS fails the type
 * check until its templates are named here.
 */

import { GameSystem, SUPPORTED_GAME_SYSTEMS, type SupportedGameSystem } from '../../game-systems';
import type { CharacterTemplate } from '../../utils/character-templates';
import { getFifthEditionTemplates } from '../../utils/character-templates/fifthEdition-templates';
import { getFantasyD20Templates } from '../../utils/character-templates/fantasyD20-templates';
import { getHorrorD100Templates } from '../../utils/character-templates/horrorD100-templates';

const BUILT_IN: Record<SupportedGameSystem, () => CharacterTemplate[]> = {
  [GameSystem.FIFTH_EDITION]: getFifthEditionTemplates,
  [GameSystem.FANTASY_D20]: getFantasyD20Templates,
  [GameSystem.HORROR_D100]: getHorrorD100Templates,
};

/** The built-in templates of one game system. */
export function builtInTemplates(gameSystem: SupportedGameSystem): CharacterTemplate[] {
  return BUILT_IN[gameSystem]();
}

/** The built-in templates of every game system. */
export function allBuiltInTemplates(): CharacterTemplate[] {
  return SUPPORTED_GAME_SYSTEMS.flatMap((system) => builtInTemplates(system));
}
