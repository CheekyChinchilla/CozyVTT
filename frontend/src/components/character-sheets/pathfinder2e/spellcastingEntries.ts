/**
 * Pathfinder 2e spellcasting as the editor reads it from a stored sheet.
 *
 * Kept apart from the editor so each shape can be typed against the sheet's
 * own interfaces, which follow the server's schema: an entry built here that
 * misses a field the server requires fails to compile.
 */

import type { PF2eCantrip, PF2eSpell, PF2eSpellcasting, PF2eSpellSlots } from '@/types/game-systems';

/** The slot ranks the schema requires, 1 to 10. */
export const PF2E_SLOT_RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;

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
export function readPf2eSpellSlots(stored: unknown): PF2eSpellSlots {
  const source = asRecord(stored);
  const entries = PF2E_SLOT_RANKS.map((rank) => {
    const slot = asRecord(source[rank]);
    return [rank, { total: count(slot.total), expended: count(slot.expended) || count(slot.used) }] as const;
  });
  return Object.fromEntries(entries) as unknown as PF2eSpellSlots;
}

/**
 * The cantrips a sheet stores, each as an object.
 *
 * The schema wants `{ name, rank, prepared }`. The editor used to tolerate a
 * bare name as well, and editing one turned it into an object with only a
 * name, which the server refused; a bare name is given the rest here.
 */
export function readPf2eCantrips(stored: unknown): PF2eCantrip[] {
  if (!Array.isArray(stored)) return [];
  return stored.map((entry): PF2eCantrip => {
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
export function newPf2eCantrip(): PF2eCantrip {
  return { name: 'New Cantrip', rank: 1, prepared: false };
}

/** A spell as Add Spell creates it; a prepared caster's starts prepared. */
export function newPf2eSpell(prepared: boolean): PF2eSpell {
  return { name: 'New Spell', rank: 1, prepared, ritual: false, heightened: false };
}

/** A focus spell as Add Focus Spell creates it. */
export function newPf2eFocusSpell(): PF2eSpell {
  return { name: 'New Focus Spell', rank: 1, prepared: false, ritual: false, heightened: false };
}

/** The spellcasting block Enable Spellcasting starts a sheet with. */
export function newPf2eSpellcasting(): PF2eSpellcasting {
  return {
    tradition: 'arcane',
    type: 'prepared',
    keyAttribute: 'intelligence',
    spellAttackBonus: { proficiencyRank: 'trained', itemBonus: 0, bonus: 0 },
    spellDC: { proficiencyRank: 'trained', itemBonus: 0, dc: 10 },
    cantrips: [],
    slots: readPf2eSpellSlots(undefined),
    spells: [],
    focusSpells: { focusPoints: { total: 0, current: 0 }, spells: [] },
    innateSpells: [],
    rituals: [],
  };
}
