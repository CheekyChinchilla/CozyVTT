/**
 * Character Templates Index
 * Unified interface for getting character templates for all game systems
 * Per SOW Section 5.4: Character Management
 */

import { GameSystem } from '@prisma/client';
import {
  CharacterTemplate,
  getDnD5eTemplates,
  getDnD5eTemplate,
} from './dnd5e-templates';
import {
  getPF2eTemplates,
  getPF2eTemplate,
} from './pathfinder2e-templates';
import {
  getSR6Templates,
  getSR6Template,
} from './shadowrun6e-templates';
import {
  getCoC7eTemplates,
  getCoC7eTemplate,
} from './callOfCthulhu7e-templates';

export { CharacterTemplate };

/**
 * Get all available templates for a specific game system
 * @param gameSystem - The game system to get templates for
 * @returns Array of available templates
 */
export function getTemplatesForGameSystem(
  gameSystem: GameSystem
): CharacterTemplate[] {
  switch (gameSystem) {
    case GameSystem.DND_5E:
      return getDnD5eTemplates();
    case GameSystem.PATHFINDER_2E:
      return getPF2eTemplates();
    case GameSystem.SHADOWRUN_6E:
      return getSR6Templates();
    case GameSystem.CALL_OF_CTHULHU_7E:
      return getCoC7eTemplates();
    default:
      return [];
  }
}

/**
 * Get a specific template for a game system
 * @param gameSystem - The game system
 * @param templateName - Optional template name (defaults to 'blank')
 * @returns The character template
 */
export function getCharacterTemplate(
  gameSystem: GameSystem,
  templateName?: string
): CharacterTemplate {
  switch (gameSystem) {
    case GameSystem.DND_5E:
      return getDnD5eTemplate(templateName);
    case GameSystem.PATHFINDER_2E:
      return getPF2eTemplate(templateName);
    case GameSystem.SHADOWRUN_6E:
      return getSR6Template(templateName);
    case GameSystem.CALL_OF_CTHULHU_7E:
      return getCoC7eTemplate(templateName);
    default:
      throw new Error(`Unsupported game system: ${gameSystem}`);
  }
}

/**
 * Get a blank template for any game system
 * @param gameSystem - The game system
 * @returns The blank character template
 */
export function getBlankTemplate(gameSystem: GameSystem): CharacterTemplate {
  return getCharacterTemplate(gameSystem, 'blank');
}

/**
 * Get all templates for all game systems (useful for browsing)
 * @returns Object with game systems as keys and template arrays as values
 */
export function getAllTemplates(): Record<string, CharacterTemplate[]> {
  return {
    [GameSystem.DND_5E]: getDnD5eTemplates(),
    [GameSystem.PATHFINDER_2E]: getPF2eTemplates(),
    [GameSystem.SHADOWRUN_6E]: getSR6Templates(),
    [GameSystem.CALL_OF_CTHULHU_7E]: getCoC7eTemplates(),
  };
}
