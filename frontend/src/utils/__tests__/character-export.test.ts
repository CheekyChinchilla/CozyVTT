/**
 * Checking a character file before it is imported. The file comes off the
 * user's disk, possibly from another CozyVTT instance, so its game system may
 * be one this instance does not have.
 */
import { describe, it, expect } from 'vitest';
import { validateImportedCharacter } from '../character-export';
import { LEGACY_GAME_SYSTEMS } from '@/legacy/gameSystemAliases';
import { RETIRED_GAME_SYSTEM } from '@/legacy/retiredGameSystem';
// A Horror d100 sheet as 1.6.0 stored and exported it, from the server's
// fixtures of the shape before 1.7.0.
import horrorD100Sheet160 from '../../../../backend/src/legacy/__fixtures__/horror-d100-sheets/v1.6.0-example.json';

const file = (gameSystem: unknown) => ({
  cozyVttVersion: '1.0',
  character: { name: 'Aldra', gameSystem, data: { characterName: 'Aldra' } },
});

describe('validateImportedCharacter', () => {
  it('takes a file for a system this instance has, and one with none', () => {
    expect(validateImportedCharacter(file('FIFTH_EDITION'))).toMatchObject({ valid: true, character: { gameSystem: 'FIFTH_EDITION' } });
    expect(validateImportedCharacter(file(null))).toMatchObject({ valid: true, character: { gameSystem: null } });
    expect(validateImportedCharacter(file(undefined))).toMatchObject({ valid: true, character: { gameSystem: null } });
  });

  // A file an older version exported names its system by the value that
  // version used.
  it.each(Object.entries(LEGACY_GAME_SYSTEMS))('takes a file an older version made for %s, as one for %s', (old, now) => {
    expect(validateImportedCharacter(file(old))).toMatchObject({ valid: true, character: { gameSystem: now } });
  });

  // Versions before 1.7.0 could export a character of an unreleased system.
  // The upgrade gave such characters no system, and a file is read the same.
  it('takes a file an older version made for the unreleased system as one with no system, and says so without its code', () => {
    const result = validateImportedCharacter(file(RETIRED_GAME_SYSTEM));
    expect(result).toEqual({
      valid: true,
      character: { name: 'Aldra', gameSystem: null, data: { characterName: 'Aldra' } },
      notice: "This file's game system is no longer supported, so the character is imported with none, as a Flexible sheet.",
    });
    expect(JSON.stringify(result)).not.toContain(RETIRED_GAME_SYSTEM);
    expect(validateImportedCharacter(file('FIFTH_EDITION')).notice).toBeUndefined();
  });

  // The code is not shown: the window that shows this names no system by code.
  it('refuses a file for a system this instance does not have, without naming its code', () => {
    const refused = { valid: false, error: 'This character is for a game system this CozyVTT does not have.' };
    expect(validateImportedCharacter(file('MY_SYSTEM'))).toEqual(refused);
    expect(validateImportedCharacter(file(5))).toEqual(refused);
  });

  // The server converts the sheet when the file is imported
  // (POST /api/characters), so the browser takes it as it is.
  it('takes a Horror d100 character file 1.6.0 exported, its sheet as the file holds it', () => {
    const oldValue = Object.keys(LEGACY_GAME_SYSTEMS).find((old) => LEGACY_GAME_SYSTEMS[old] === 'HORROR_D100');
    const exported = {
      cozyVttVersion: '1.0',
      exportedAt: '2026-11-01T00:00:00.000Z',
      character: { name: 'Dr. Ilse Varga', gameSystem: oldValue, data: horrorD100Sheet160 },
    };
    expect(validateImportedCharacter(exported)).toEqual({
      valid: true,
      character: { name: 'Dr. Ilse Varga', gameSystem: 'HORROR_D100', data: horrorD100Sheet160 },
    });
  });
});
