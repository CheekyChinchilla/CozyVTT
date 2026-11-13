/**
 * Every text field a character sheet stores has a length limit.
 *
 * Most of them had none, so one field could hold anything up to the request
 * limit, and every member of the campaign who opened the sheet received it.
 * The walk below fails for any string a sheet schema accepts without a
 * maximum, so a field added later cannot go without one.
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { GameSystem, type SupportedGameSystem } from '../../../game-systems';
import {
  getBlankCharacterTemplate,
  validateCharacterData,
  fifthEditionCharacterDataSchema,
  fantasyD20CharacterDataSchema,
  HorrorD100SheetSchema,
  flexibleCharacterDataSchema,
} from '../index';
import { walkSheetSchema } from '../../../__tests__/helpers/sheetSchemaWalk';
import { migrateLegacySheetFields } from '../../../utils/sheetFieldMigrations';
import { SHEET_LONG_TEXT_MAX, SHEET_SHORT_TEXT_MAX } from '../sheetLimits';

/** The path of every string in `schema` that has no maximum length. */
function unboundedStrings(schema: z.ZodType, path: string): string[] {
  const found: string[] = [];
  walkSheetSchema(schema, path, (node, at) => {
    if (node instanceof z.ZodString && node.maxLength === null) found.push(at);
  });
  return found;
}

describe('every text field on a sheet', () => {
  it.each([
    ['FIFTH_EDITION', fifthEditionCharacterDataSchema],
    ['FANTASY_D20', fantasyD20CharacterDataSchema],
    // The conversion record is the server's: written when a sheet is
    // converted, kept on every save, and never taken from a request. It holds
    // text copied from an older sheet, so it has no limit of its own.
    ['HORROR_D100', HorrorD100SheetSchema.omit({ converted: true })],
    ['Flexible', flexibleCharacterDataSchema],
  ] as Array<[string, z.ZodType]>)('has a length limit in %s', (_system, schema) => {
    expect(unboundedStrings(schema, '')).toEqual([]);
  });
});

describe('the limits', () => {
  const blank = (system: SupportedGameSystem) => getBlankCharacterTemplate(system) as Record<string, unknown>;
  const paths = (system: SupportedGameSystem, data: unknown) => {
    const result = validateCharacterData(system, data);
    return result.success ? [] : result.errors.issues.map((issue) => issue.path.join('.'));
  };
  const short = 'x'.repeat(SHEET_SHORT_TEXT_MAX + 1);
  const long = 'x'.repeat(SHEET_LONG_TEXT_MAX + 1);

  it('refuse a one-line box over the short limit', () => {
    expect(paths(GameSystem.FIFTH_EDITION, { ...blank(GameSystem.FIFTH_EDITION), class: short })).toContain('class');
    expect(paths(GameSystem.FANTASY_D20, { ...blank(GameSystem.FANTASY_D20), ancestry: short })).toContain('ancestry');
    expect(paths(GameSystem.HORROR_D100, { ...blank(GameSystem.HORROR_D100), profession: short })).toContain('profession');
    expect(paths(GameSystem.FIFTH_EDITION, { ...blank(GameSystem.FIFTH_EDITION), inventory: [{ name: short }] })).toContain('inventory.0.name');
  });

  it('refuse a paragraph box over the long limit', () => {
    expect(paths(GameSystem.FIFTH_EDITION, { ...blank(GameSystem.FIFTH_EDITION), backstory: long })).toContain('backstory');
    expect(paths(GameSystem.FANTASY_D20, { ...blank(GameSystem.FANTASY_D20), notes: long })).toContain('notes');
    expect(
      paths(GameSystem.HORROR_D100, { ...blank(GameSystem.HORROR_D100), story: [{ title: 'Background', text: long }] })
    ).toContain('story.0.text');
  });

  it('take a paragraph box at the long limit, and a one-line box at the short one', () => {
    expect(
      paths(GameSystem.FIFTH_EDITION, {
        ...blank(GameSystem.FIFTH_EDITION),
        backstory: 'y'.repeat(SHEET_LONG_TEXT_MAX),
        race: 'y'.repeat(SHEET_SHORT_TEXT_MAX),
        featuresAndTraits: [{ name: 'Second Wind', description: 'y'.repeat(SHEET_LONG_TEXT_MAX) }],
      })
    ).toEqual([]);
  });

  it('take a feature written before descriptions existed, however long its line', () => {
    expect(paths(GameSystem.FIFTH_EDITION, { ...blank(GameSystem.FIFTH_EDITION), featuresAndTraits: ['z'.repeat(5000)] })).toEqual([]);
  });
});

describe('the allies name', () => {
  const paths = (system: SupportedGameSystem, data: unknown) => {
    const result = validateCharacterData(system, data);
    return result.success ? [] : result.errors.issues.map((issue) => issue.path.join('.'));
  };
  const paragraph = 'y'.repeat(SHEET_SHORT_TEXT_MAX * 5);
  const blank = (system: SupportedGameSystem) => getBlankCharacterTemplate(system) as Record<string, unknown>;

  it('takes the paragraph a 5E sheet from before 1.3.0 had in its allies field, once that is moved', () => {
    const older: Record<string, unknown> = { ...blank(GameSystem.FIFTH_EDITION), allies: paragraph };
    delete older.alliesAndOrganizations;
    const moved = migrateLegacySheetFields(GameSystem.FIFTH_EDITION, older) as { alliesAndOrganizations: { name: string } };

    expect(moved.alliesAndOrganizations.name).toBe(paragraph);
    expect(paths(GameSystem.FIFTH_EDITION, moved)).toEqual([]);
  });

  it.each([GameSystem.FIFTH_EDITION, GameSystem.FANTASY_D20])('takes a paragraph in %s', (system) => {
    expect(paths(system, { ...blank(system), alliesAndOrganizations: { name: paragraph } })).toEqual([]);
  });

  it.each([GameSystem.FIFTH_EDITION, GameSystem.FANTASY_D20])('is still refused past the paragraph limit in %s', (system) => {
    const sheet = { ...blank(system), alliesAndOrganizations: { name: 'x'.repeat(SHEET_LONG_TEXT_MAX + 1) } };
    expect(paths(system, sheet)).toContain('alliesAndOrganizations.name');
  });
});
