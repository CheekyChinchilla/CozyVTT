/**
 * Every built-in character template of each game system, for the tests that
 * check them against the schemas and the rules. Keyed by every GameSystem, so
 * a system added to the enum fails the type check until its templates are
 * named here.
 */

import { GameSystem } from '../../game-systems';
import type { CharacterTemplate } from '../../utils/character-templates';
import { getDnD5eTemplates } from '../../utils/character-templates/dnd5e-templates';
import { getPF2eTemplates } from '../../utils/character-templates/pathfinder2e-templates';
import { getSR6Templates } from '../../utils/character-templates/shadowrun6e-templates';
import { getCoC7eTemplates } from '../../utils/character-templates/callOfCthulhu7e-templates';

const BUILT_IN: Record<GameSystem, () => CharacterTemplate[]> = {
  [GameSystem.DND_5E]: getDnD5eTemplates,
  [GameSystem.PATHFINDER_2E]: getPF2eTemplates,
  [GameSystem.SHADOWRUN_6E]: getSR6Templates,
  [GameSystem.CALL_OF_CTHULHU_7E]: getCoC7eTemplates,
};

/** The built-in templates of one game system. */
export function builtInTemplates(gameSystem: GameSystem): CharacterTemplate[] {
  return BUILT_IN[gameSystem]();
}

/** The built-in templates of every game system. */
export function allBuiltInTemplates(): CharacterTemplate[] {
  return Object.values(GameSystem).flatMap((system) => builtInTemplates(system));
}
