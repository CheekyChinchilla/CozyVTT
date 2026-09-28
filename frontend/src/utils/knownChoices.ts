import { TokenDisposition, TokenType, type CreatureTemplate, type TokenTemplate, type TokenDisplayMode } from '@/types';

const KNOWN_DISPOSITIONS: readonly string[] = Object.values(TokenDisposition);
const KNOWN_DISPLAY_MODES: readonly TokenDisplayMode[] = ['pog', 'top-down', 'full-art'];

/**
 * A creature template as the client types it, whatever the row holds.
 *
 * The disposition and display mode columns are free text. New templates are
 * checked, but one imported by an earlier release could hold any short
 * string ("Hostile", "cutout"), and CreatureTemplate claims one of the values
 * the app knows. Read through this, the claim is true: an unknown
 * disposition becomes hostile and an unknown display mode pog, the defaults
 * the columns and the importer have always used, and the creature can be
 * placed.
 */
export function withKnownCreatureChoices<T extends Pick<CreatureTemplate, 'disposition' | 'displayMode'>>(creature: T): T {
  const disposition: unknown = creature.disposition;
  const displayMode: unknown = creature.displayMode;
  const dispositionKnown = typeof disposition === 'string' && KNOWN_DISPOSITIONS.includes(disposition);
  const displayModeKnown = typeof displayMode === 'string' && (KNOWN_DISPLAY_MODES as readonly string[]).includes(displayMode);
  if (dispositionKnown && displayModeKnown) return creature;
  return {
    ...creature,
    ...(!dispositionKnown && { disposition: TokenDisposition.HOSTILE }),
    ...(!displayModeKnown && { displayMode: 'pog' as TokenDisplayMode }),
  };
}

const KNOWN_TYPES: readonly string[] = Object.values(TokenType);

/**
 * A token template as the client types it, whatever the row holds: the
 * earlier importer stored its kind, disposition and display mode unchecked,
 * and placing one sends them to the token route, which refuses a value it
 * does not know. Unknown values read as the columns' defaults: an object,
 * no disposition, pog.
 */
export function withKnownTemplateChoices<T extends Pick<TokenTemplate, 'type' | 'disposition' | 'displayMode'>>(template: T): T {
  const type: unknown = template.type;
  const disposition: unknown = template.disposition;
  const displayMode: unknown = template.displayMode;
  const typeKnown = typeof type === 'string' && KNOWN_TYPES.includes(type);
  const dispositionKnown = disposition === null || (typeof disposition === 'string' && KNOWN_DISPOSITIONS.includes(disposition));
  const displayModeKnown = typeof displayMode === 'string' && (KNOWN_DISPLAY_MODES as readonly string[]).includes(displayMode);
  if (typeKnown && dispositionKnown && displayModeKnown) return template;
  return {
    ...template,
    ...(!typeKnown && { type: TokenType.OBJECT }),
    ...(!dispositionKnown && { disposition: null }),
    ...(!displayModeKnown && { displayMode: 'pog' as TokenDisplayMode }),
  };
}

