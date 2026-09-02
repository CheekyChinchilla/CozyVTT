/**
 * The name a character is created with.
 *
 * A sheet carries its own name field, separate from the `name` column. At
 * creation the two are joined here, from the name typed into the modal.
 *
 * It only worked for blank sheets. The overwrite was gated on a short list of
 * factory placeholders — "New Character" and three siblings — so a character
 * started from one of the *example* templates kept the template's name instead:
 * type "Grimtooth Ashfang", pick "Level 1 Fighter (Example)", get a sheet that
 * says "Brave Fighter". All three implemented systems did it.
 *
 * That was worse than a cosmetic mismatch. `PUT /characters/:id` treats the
 * sheet as the source of truth for the name, so the first save copied the
 * template's name back over the character record and the character was renamed
 * for good.
 *
 * This runs at creation and nowhere else, and creation always carries a name
 * the user has just typed. So the typed name simply wins.
 */

import { applyIdentityToSheet } from '../index';
import { GameSystem } from '../../../game-systems';
import { getCharacterTemplate } from '../../../utils/character-templates';

describe('applyIdentityToSheet', () => {
  describe('the name typed at creation wins', () => {
    it.each([
      [GameSystem.DND_5E, 'fighter', 'characterName', 'Brave Fighter'],
      [GameSystem.PATHFINDER_2E, 'fighter', 'characterName', 'Dwarven Defender'],
      [GameSystem.CALL_OF_CTHULHU_7E, 'privateinvestigator', 'investigatorName', 'Jack Morrison'],
    ])('%s example template no longer keeps %s', (system, templateName, nameField, templateHeld) => {
      const template = getCharacterTemplate(system, templateName);

      // The template really does carry its own name — the thing being overridden.
      expect(template.data[nameField]).toBe(templateHeld);

      const sheet = applyIdentityToSheet(system, template.data, 'Grimtooth Ashfang', 'Tyke');

      expect(sheet[nameField]).toBe('Grimtooth Ashfang');
    });

    it.each([
      [GameSystem.DND_5E, 'characterName'],
      [GameSystem.PATHFINDER_2E, 'characterName'],
      [GameSystem.CALL_OF_CTHULHU_7E, 'investigatorName'],
    ])('%s blank template still takes the typed name', (system, nameField) => {
      const template = getCharacterTemplate(system, 'blank');
      const sheet = applyIdentityToSheet(system, template.data, 'Nakudama', 'Tyke');
      expect(sheet[nameField]).toBe('Nakudama');
    });

    it('overrides a name carried in from anywhere else', () => {
      // Copied sheets and API clients come through the same route, and the
      // caller has still just supplied a name for this new character.
      const sheet = applyIdentityToSheet(
        GameSystem.DND_5E,
        { characterName: 'Somebody Else' },
        'Nakudama',
        'Tyke'
      );
      expect(sheet.characterName).toBe('Nakudama');
    });
  });

  describe('what it leaves alone', () => {
    it('does not blank the sheet name when no name is supplied', () => {
      const sheet = applyIdentityToSheet(
        GameSystem.DND_5E,
        { characterName: 'Keep Me' },
        '',
        'Tyke'
      );
      expect(sheet.characterName).toBe('Keep Me');
    });

    it('trims surrounding whitespace off the typed name', () => {
      const sheet = applyIdentityToSheet(
        GameSystem.DND_5E,
        { characterName: 'Old' },
        '  Nakudama  ',
        'Tyke'
      );
      expect(sheet.characterName).toBe('Nakudama');
    });

    it('always sets the player name from the owner, never from the sheet', () => {
      const sheet = applyIdentityToSheet(
        GameSystem.DND_5E,
        { characterName: 'X', playerName: 'Previous Owner' },
        'Nakudama',
        'Tyke'
      );
      expect(sheet.playerName).toBe('Tyke');
    });

    it('leaves a systemless sheet untouched', () => {
      const flexible = { anything: 'goes', characterName: 'Unchanged' };
      expect(applyIdentityToSheet(null, flexible, 'Nakudama', 'Tyke')).toEqual(flexible);
    });

    it('does not mutate the sheet it was given', () => {
      const original = { characterName: 'Brave Fighter' };
      applyIdentityToSheet(GameSystem.DND_5E, original, 'Nakudama', 'Tyke');
      expect(original.characterName).toBe('Brave Fighter');
    });
  });
});
