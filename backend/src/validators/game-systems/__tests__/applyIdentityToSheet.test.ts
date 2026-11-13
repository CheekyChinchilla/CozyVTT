/**
 * The name a character is created with.
 *
 * A sheet carries its own name field, separate from the `name` column. At
 * creation the two are joined here, from the name typed into the modal.
 *
 * It only worked for blank sheets. The overwrite was gated on a short list of
 * factory placeholders — "New Character" and three siblings — so a character
 * started from one of the *example* templates kept the template's name instead:
 * type "Gorrun Ashfield", pick "Level 1 Fighter (Example)", get a sheet that
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
      [GameSystem.FIFTH_EDITION, 'fighter', 'characterName', 'Brave Fighter'],
      [GameSystem.FANTASY_D20, 'fighter', 'characterName', 'Stout Defender'],
      [GameSystem.HORROR_D100, 'privateinvestigator', 'characterName', 'Leo Marchbank'],
    ])('%s example template no longer keeps %s', (system, templateName, nameField, templateHeld) => {
      const template = getCharacterTemplate(system, templateName);

      // The template really does carry its own name — the thing being overridden.
      expect(template.data[nameField]).toBe(templateHeld);

      const sheet = applyIdentityToSheet(system, template.data, 'Gorrun Ashfield', 'Tyke');

      expect(sheet[nameField]).toBe('Gorrun Ashfield');
    });

    it.each([
      [GameSystem.FIFTH_EDITION, 'characterName'],
      [GameSystem.FANTASY_D20, 'characterName'],
      [GameSystem.HORROR_D100, 'characterName'],
    ])('%s blank template still takes the typed name', (system, nameField) => {
      const template = getCharacterTemplate(system, 'blank');
      const sheet = applyIdentityToSheet(system, template.data, 'Marshkin', 'Tyke');
      expect(sheet[nameField]).toBe('Marshkin');
    });

    it('overrides a name carried in from anywhere else', () => {
      // Copied sheets and API clients come through the same route, and the
      // caller has still just supplied a name for this new character.
      const sheet = applyIdentityToSheet(
        GameSystem.FIFTH_EDITION,
        { characterName: 'Somebody Else' },
        'Marshkin',
        'Tyke'
      );
      expect(sheet.characterName).toBe('Marshkin');
    });
  });

  describe('what it leaves alone', () => {
    it('does not blank the sheet name when no name is supplied', () => {
      const sheet = applyIdentityToSheet(
        GameSystem.FIFTH_EDITION,
        { characterName: 'Keep Me' },
        '',
        'Tyke'
      );
      expect(sheet.characterName).toBe('Keep Me');
    });

    it('trims surrounding whitespace off the typed name', () => {
      const sheet = applyIdentityToSheet(
        GameSystem.FIFTH_EDITION,
        { characterName: 'Old' },
        '  Marshkin  ',
        'Tyke'
      );
      expect(sheet.characterName).toBe('Marshkin');
    });

    it('always sets the player name from the owner, never from the sheet', () => {
      const sheet = applyIdentityToSheet(
        GameSystem.FIFTH_EDITION,
        { characterName: 'X', playerName: 'Previous Owner' },
        'Marshkin',
        'Tyke'
      );
      expect(sheet.playerName).toBe('Tyke');
    });

    it('leaves a systemless sheet untouched', () => {
      const flexible = { anything: 'goes', characterName: 'Unchanged' };
      expect(applyIdentityToSheet(null, flexible, 'Marshkin', 'Tyke')).toEqual(flexible);
    });

    it('does not mutate the sheet it was given', () => {
      const original = { characterName: 'Brave Fighter' };
      applyIdentityToSheet(GameSystem.FIFTH_EDITION, original, 'Marshkin', 'Tyke');
      expect(original.characterName).toBe('Brave Fighter');
    });
  });
});
