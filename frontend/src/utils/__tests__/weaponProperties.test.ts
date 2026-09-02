/**
 * D&D 5e weapon properties.
 *
 * Reported from a live game: weapons from the built-in templates show badges
 * like Finesse, Light and Thrown, but adding your own weapon offers no way to
 * set them.
 *
 * The list is checked against the Basic Rules table (p. 48), and the
 * case-insensitive behaviour exists because templates store lowercase while a
 * hand-edited or imported sheet may not.
 */

import { describe, it, expect } from 'vitest';
import {
  DND5E_WEAPON_PROPERTIES,
  isCanonicalWeaponProperty,
  hasWeaponProperty,
  toggleWeaponProperty,
  customWeaponProperties,
  addCustomWeaponProperty,
  MAX_WEAPON_PROPERTY_LENGTH,
} from '../weaponProperties';

describe('DND5E_WEAPON_PROPERTIES', () => {
  // Basic Rules p. 48, "Weapon Properties" plus the Weapons table.
  it('is the eleven the rules define, and nothing else', () => {
    expect([...DND5E_WEAPON_PROPERTIES]).toEqual([
      'ammunition', 'finesse', 'heavy', 'light', 'loading', 'range',
      'reach', 'special', 'thrown', 'two-handed', 'versatile',
    ]);
  });

  it('stores them lowercase, as the templates already do', () => {
    for (const property of DND5E_WEAPON_PROPERTIES) {
      expect(property).toBe(property.toLowerCase());
    }
  });
});

describe('isCanonicalWeaponProperty', () => {
  it.each(['finesse', 'Finesse', '  THROWN  ', 'two-handed'])('accepts %s', (value) => {
    expect(isCanonicalWeaponProperty(value)).toBe(true);
  });

  it.each(['silvered', 'magical', 'returning', ''])('rejects %s', (value) => {
    expect(isCanonicalWeaponProperty(value)).toBe(false);
  });
});

describe('hasWeaponProperty', () => {
  it('matches whatever case the sheet stored', () => {
    expect(hasWeaponProperty(['Finesse'], 'finesse')).toBe(true);
    expect(hasWeaponProperty(['finesse'], 'Finesse')).toBe(true);
  });

  it('is false when absent', () => {
    expect(hasWeaponProperty(['light'], 'finesse')).toBe(false);
    expect(hasWeaponProperty([], 'finesse')).toBe(false);
  });

  it('does not match a partial word', () => {
    expect(hasWeaponProperty(['two-handed'], 'handed')).toBe(false);
  });
});

describe('toggleWeaponProperty', () => {
  it('adds a property that is absent', () => {
    expect(toggleWeaponProperty([], 'finesse')).toEqual(['finesse']);
  });

  it('removes a property that is present', () => {
    expect(toggleWeaponProperty(['finesse', 'light'], 'finesse')).toEqual(['light']);
  });

  // A template or an import may have stored it capitalised; the toggle still
  // has to be able to switch it off.
  it('removes a differently-cased property', () => {
    expect(toggleWeaponProperty(['Finesse', 'light'], 'finesse')).toEqual(['light']);
  });

  it('stores the canonical lowercase form when adding', () => {
    expect(toggleWeaponProperty([], 'Thrown')).toEqual(['thrown']);
  });

  it('leaves everything else in place and in order', () => {
    expect(toggleWeaponProperty(['silvered', 'light'], 'finesse')).toEqual([
      'silvered', 'light', 'finesse',
    ]);
  });
});

describe('addCustomWeaponProperty', () => {
  // The eleven are the common case, not the limit. A homebrew game may name any
  // number more, and the stored shape and the sheet's badges always allowed
  // them — only the editor could not create one.
  it('adds a property the rules do not name', () => {
    expect(addCustomWeaponProperty(['finesse'], 'moonforged')).toEqual(['finesse', 'moonforged']);
  });

  it('keeps the case the player typed for their own property', () => {
    expect(addCustomWeaponProperty([], 'Moon-Forged')).toEqual(['Moon-Forged']);
  });

  it('trims surrounding space', () => {
    expect(addCustomWeaponProperty([], '  returning  ')).toEqual(['returning']);
  });

  // Typing a canonical name should light the toggle, not add a second chip.
  it('stores a canonical name lowercase however it was typed', () => {
    expect(addCustomWeaponProperty([], 'Finesse')).toEqual(['finesse']);
  });

  it('does not duplicate one already present, whatever its case', () => {
    expect(addCustomWeaponProperty(['Moonforged'], 'moonforged')).toEqual(['Moonforged']);
    expect(addCustomWeaponProperty(['finesse'], 'Finesse')).toEqual(['finesse']);
  });

  it.each([['nothing', ''], ['only spaces', '   ']])('refuses %s', (_label, value) => {
    expect(addCustomWeaponProperty(['light'], value)).toEqual(['light']);
  });

  it('refuses a value long enough to be used as storage', () => {
    expect(addCustomWeaponProperty(['light'], 'x'.repeat(MAX_WEAPON_PROPERTY_LENGTH + 1)))
      .toEqual(['light']);
  });

  it('accepts one exactly at the limit', () => {
    const atLimit = 'x'.repeat(MAX_WEAPON_PROPERTY_LENGTH);
    expect(addCustomWeaponProperty([], atLimit)).toEqual([atLimit]);
  });

  it('does not mutate the list it was given', () => {
    const original = ['finesse'];
    addCustomWeaponProperty(original, 'moonforged');
    expect(original).toEqual(['finesse']);
  });
});

describe('customWeaponProperties', () => {
  // Homebrew is normal; a list that dropped what it did not recognise is the
  // same mistake that filed a player's Thieves' Cant under Weapons.
  it('reports the ones the rules do not name', () => {
    expect(customWeaponProperties(['finesse', 'silvered', 'light', 'returning'])).toEqual([
      'silvered', 'returning',
    ]);
  });

  it('reports nothing when every property is canonical', () => {
    expect(customWeaponProperties(['finesse', 'Light'])).toEqual([]);
  });

  it('ignores blanks', () => {
    expect(customWeaponProperties(['', '   ', 'silvered'])).toEqual(['silvered']);
  });
});
