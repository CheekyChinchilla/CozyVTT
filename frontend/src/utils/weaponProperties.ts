/**
 * D&D 5e weapon properties.
 *
 * The read-only sheet has always drawn these as badges, but only the built-in
 * templates could set them: the editor offered no control at all, and its notes
 * field suggested "e.g., Versatile, Finesse" — so a player adding their own
 * weapon typed the properties into a free-text note, where they render as
 * italic prose instead of badges and nothing can read them.
 *
 * The eleven below are the complete list from the Basic Rules (p. 48,
 * "Weapon Properties"). Stored lowercase, matching what the templates already
 * write; the sheet capitalises them for display.
 *
 * Anything else a sheet carries is kept and shown. Homebrew weapons are normal,
 * and a list that silently dropped what it did not recognise is the same
 * mistake that filed a player's Thieves' Cant under Weapons.
 */

export const DND5E_WEAPON_PROPERTIES = [
  'ammunition',
  'finesse',
  'heavy',
  'light',
  'loading',
  'range',
  'reach',
  'special',
  'thrown',
  'two-handed',
  'versatile',
] as const;

export type Dnd5eWeaponProperty = (typeof DND5E_WEAPON_PROPERTIES)[number];

const CANONICAL = new Set<string>(DND5E_WEAPON_PROPERTIES);

/** Whether a stored value is one of the properties the rules define. */
export function isCanonicalWeaponProperty(value: string): boolean {
  return CANONICAL.has(value.trim().toLowerCase());
}

/**
 * Whether a weapon has a property, whatever case it was stored in.
 *
 * Templates write lowercase, but a sheet edited by hand or imported from
 * elsewhere may hold "Finesse", so comparing exactly would show a property as
 * unset while the badge for it is on screen.
 */
export function hasWeaponProperty(properties: readonly string[], property: string): boolean {
  const wanted = property.trim().toLowerCase();
  return properties.some((entry) => entry.trim().toLowerCase() === wanted);
}

/**
 * Add or remove a property, preserving the order of everything else.
 *
 * Removal is case-insensitive so a stored "Finesse" can be switched off by the
 * lowercase toggle; addition always stores the canonical lowercase form.
 */
export function toggleWeaponProperty(
  properties: readonly string[],
  property: string
): string[] {
  const wanted = property.trim().toLowerCase();
  if (hasWeaponProperty(properties, wanted)) {
    return properties.filter((entry) => entry.trim().toLowerCase() !== wanted);
  }
  return [...properties, wanted];
}

/**
 * The properties a weapon carries that the rules do not name — homebrew, or
 * anything an import brought with it. Shown alongside the toggles so they are
 * visible and removable rather than silently preserved.
 */
export function customWeaponProperties(properties: readonly string[]): string[] {
  return properties.filter((entry) => entry.trim().length > 0 && !isCanonicalWeaponProperty(entry));
}

/** Longest property a weapon will accept, so the field cannot be used as storage. */
export const MAX_WEAPON_PROPERTY_LENGTH = 60;

/**
 * Add a property of the player's own.
 *
 * The eleven the rules name are the common case, not the limit — a homebrew
 * game may have any number more, and both the stored shape and the badges on
 * the sheet have always allowed them. Only the editor could not create one.
 *
 * Typing the name of a canonical property switches that one on rather than
 * storing a near-duplicate, and an entry already present is left alone whatever
 * case it was stored in. A blank or over-long value is refused: the caller gets
 * the list back unchanged.
 */
export function addCustomWeaponProperty(
  properties: readonly string[],
  value: string
): string[] {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_WEAPON_PROPERTY_LENGTH) return [...properties];
  if (hasWeaponProperty(properties, trimmed)) return [...properties];

  // Canonical names are always stored lowercase, however they were typed, so
  // the toggle above reads as on rather than showing a second amber chip.
  const stored = isCanonicalWeaponProperty(trimmed) ? trimmed.toLowerCase() : trimmed;
  return [...properties, stored];
}
