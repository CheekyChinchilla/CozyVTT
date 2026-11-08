/**
 * Checking a character file before it is imported. The file comes off the
 * user's disk, possibly from another CozyVTT instance, so its game system may
 * be one this instance does not have.
 */
import { describe, it, expect } from 'vitest';
import { validateImportedCharacter } from '../character-export';

const file = (gameSystem: unknown) => ({
  cozyVttVersion: '1.0',
  character: { name: 'Aldra', gameSystem, data: { characterName: 'Aldra' } },
});

describe('validateImportedCharacter', () => {
  it('takes a file for a system this instance has, and one with none', () => {
    expect(validateImportedCharacter(file('DND_5E'))).toMatchObject({ valid: true, character: { gameSystem: 'DND_5E' } });
    expect(validateImportedCharacter(file(null))).toMatchObject({ valid: true, character: { gameSystem: null } });
    expect(validateImportedCharacter(file(undefined))).toMatchObject({ valid: true, character: { gameSystem: null } });
  });

  it('refuses a file for a system this instance does not have, and says which', () => {
    expect(validateImportedCharacter(file('MY_SYSTEM'))).toEqual({
      valid: false,
      error: 'This character is for a game system this CozyVTT does not have: MY_SYSTEM',
    });
    expect(validateImportedCharacter(file(5))).toEqual({
      valid: false,
      error: 'This character is for a game system this CozyVTT does not have: 5',
    });
  });
});
