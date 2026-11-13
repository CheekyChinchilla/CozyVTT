// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * Reading the attributes and spellcasting a Fantasy d20 sheet names in the
 * spelling the editor uses.
 *
 * The built-in templates up to 1.5.0 stored skill, lore and key attributes
 * abbreviated ("str", "int") and spellcasting as "Arcane" and "Prepared". The
 * editor looks attributes up by their full lower-case name and offers the
 * traditions and casting types in lower case, so on such a sheet every skill
 * was recomputed without its attribute and saved that way. Read through these
 * as the editor opens, those sheets get their numbers back, and the next save
 * stores the editor's spelling.
 *
 * A value these do not recognise is kept as it was, so nothing is lost.
 */

import { fantasyD20AttributeName } from '@/utils/rules/fantasyD20';
import type { FantasyD20Skills } from '@/types/game-systems';

const TRADITIONS = ['arcane', 'divine', 'primal', 'occult'];
const CASTING_TYPES = ['prepared', 'spontaneous'];

/** An attribute in full ("strength"), or the value as stored if it names none. */
export function fullAttributeName(value: string): string;
export function fullAttributeName(value: string | undefined): string | undefined;
export function fullAttributeName(value: string | undefined): string | undefined {
  return value === undefined ? undefined : (fantasyD20AttributeName(value) ?? value);
}

/** One of `allowed` in lower case, or the value as stored if it is none of them. */
function lowerCaseChoice(value: string | undefined, allowed: readonly string[]): string | undefined {
  const lower = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return allowed.includes(lower) ? lower : value;
}

/** A spellcasting tradition as the editor offers it. */
export function editorTradition(value: string | undefined): string | undefined {
  return lowerCaseChoice(value, TRADITIONS);
}

/** A casting type, prepared or spontaneous, as the editor offers it. */
export function editorCastingType(value: string | undefined): string | undefined {
  return lowerCaseChoice(value, CASTING_TYPES);
}

/** The skills with each attribute spelled in full. */
export function withFullSkillAttributes(skills: FantasyD20Skills): FantasyD20Skills {
  const next = { ...skills };
  for (const key of Object.keys(next) as (keyof FantasyD20Skills)[]) {
    const skill = next[key];
    if (skill && typeof skill.attribute === 'string') {
      next[key] = { ...skill, attribute: fullAttributeName(skill.attribute) };
    }
  }
  return next;
}
