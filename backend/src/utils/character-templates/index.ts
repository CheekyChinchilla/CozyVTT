/**
 * Character Templates Index
 * Unified interface for getting character templates for all game systems
 * Character Management
 */

import { GameSystem, type SupportedGameSystem } from '../../game-systems';
import type { CharacterTemplate } from './types';
import { getFifthEditionTemplate } from './fifthEdition-templates';
import { getFantasyD20Template } from './fantasyD20-templates';
import { getHorrorD100Template } from './horrorD100-templates';

export type { CharacterTemplate };

/**
 * Get a specific template for a game system
 * @param gameSystem - The game system
 * @param templateName - Optional template name (defaults to 'blank')
 * @returns The character template
 */
export function getCharacterTemplate(
  gameSystem: SupportedGameSystem,
  templateName?: string
): CharacterTemplate {
  switch (gameSystem) {
    case GameSystem.FIFTH_EDITION:
      return getFifthEditionTemplate(templateName);
    case GameSystem.FANTASY_D20:
      return getFantasyD20Template(templateName);
    case GameSystem.HORROR_D100:
      return getHorrorD100Template(templateName);
    default:
      throw new Error(`Unsupported game system: ${gameSystem}`);
  }
}

/**
 * Get a blank template for any game system
 * @param gameSystem - The game system
 * @returns The blank character template
 */
export function getBlankTemplate(gameSystem: SupportedGameSystem): CharacterTemplate {
  return getCharacterTemplate(gameSystem, 'blank');
}
