/**
 * Character Templates Index
 * Unified interface for getting character templates for all game systems
 * Character Management
 */

import { GameSystem } from '@prisma/client';
import { CharacterTemplate, getDnD5eTemplate } from './dnd5e-templates';
import { getPF2eTemplate } from './pathfinder2e-templates';
import { getSR6Template } from './shadowrun6e-templates';
import { getCoC7eTemplate } from './callOfCthulhu7e-templates';

export { CharacterTemplate };

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
