// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * Fantasy d20 spellcasting as the editor reads it from a stored sheet.
 *
 * Kept apart from the editor so each shape can be typed against the sheet's
 * own interfaces, which follow the server's schema: an entry built here that
 * misses a field the server requires fails to compile.
 */

import type { FantasyD20Cantrip, FantasyD20Spell, FantasyD20Spellcasting, FantasyD20SpellSlots } from '@/types/game-systems';

/** The slot ranks the schema requires, 1 to 10. */
export const FANTASY_D20_SLOT_RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * All ten slot ranks, from whatever the sheet stored.
 *
 * How many slots of a rank are used is `expended`. The 1.4.0 editor wrote it
 * as `used`, which the server now drops on save, so a stored `used` is taken
 * whenever `expended` is 0 or missing: a count recorded then survives the first
 * save on this version. A rank the sheet lacks starts at none.
 */
export function readFantasyD20SpellSlots(stored: unknown): FantasyD20SpellSlots {
  const source = asRecord(stored);
  const entries = FANTASY_D20_SLOT_RANKS.map((rank) => {
    const slot = asRecord(source[rank]);
    // No more used than the total: the server refuses it, and the sheet would
    // show a negative number left.
    const total = count(slot.total);
    return [rank, { total, expended: Math.min(count(slot.expended) || count(slot.used), total) }] as const;
  });
  return Object.fromEntries(entries) as unknown as FantasyD20SpellSlots;
}

/**
 * The cantrips a sheet stores, each as an object.
 *
 * The schema wants `{ name, rank, prepared }`. The editor used to tolerate a
 * bare name as well, and editing one turned it into an object with only a
 * name, which the server refused; a bare name is given the rest here.
 */
export function readFantasyD20Cantrips(stored: unknown): FantasyD20Cantrip[] {
  if (!Array.isArray(stored)) return [];
  return stored.map((entry): FantasyD20Cantrip => {
    if (typeof entry === 'string') return { name: entry, rank: 1, prepared: false };
    const cantrip = asRecord(entry);
    return {
      ...cantrip,
      name: typeof cantrip.name === 'string' ? cantrip.name : '',
      rank: typeof cantrip.rank === 'number' ? cantrip.rank : 1,
      prepared: typeof cantrip.prepared === 'boolean' ? cantrip.prepared : false,
    };
  });
}

/** A cantrip as Add Cantrip creates it. */
export function newFantasyD20Cantrip(): FantasyD20Cantrip {
  return { name: 'New Cantrip', rank: 1, prepared: false };
}

/** A spell as Add Spell creates it; a prepared caster's starts prepared. */
export function newFantasyD20Spell(prepared: boolean): FantasyD20Spell {
  return { name: 'New Spell', rank: 1, prepared, ritual: false, heightened: false };
}

/** A focus spell as Add Focus Spell creates it. */
export function newFantasyD20FocusSpell(): FantasyD20Spell {
  return { name: 'New Focus Spell', rank: 1, prepared: false, ritual: false, heightened: false };
}

/** The spellcasting block Enable Spellcasting starts a sheet with. */
export function newFantasyD20Spellcasting(): FantasyD20Spellcasting {
  return {
    tradition: 'arcane',
    type: 'prepared',
    keyAttribute: 'intelligence',
    spellAttackBonus: { proficiencyRank: 'trained', itemBonus: 0, bonus: 0 },
    spellDC: { proficiencyRank: 'trained', itemBonus: 0, dc: 10 },
    cantrips: [],
    slots: readFantasyD20SpellSlots(undefined),
    spells: [],
    focusSpells: { focusPoints: { total: 0, current: 0 }, spells: [] },
    innateSpells: [],
    rituals: [],
  };
}
