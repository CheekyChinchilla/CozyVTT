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
import { GameSystem } from '../../../game-systems';
import {
  getBlankCharacterTemplate,
  validateCharacterData,
  dnd5eCharacterDataSchema,
  pathfinder2eCharacterDataSchema,
  callOfCthulhu7eCharacterDataSchema,
  shadowrun6eCharacterDataSchema,
  flexibleCharacterDataSchema,
} from '../index';
import { migrateLegacySheetFields } from '../../../utils/sheetFieldMigrations';
import { SHEET_LONG_TEXT_MAX, SHEET_SHORT_TEXT_MAX } from '../sheetLimits';

/** The path of every string in `schema` that has no maximum length. */
function unboundedStrings(schema: z.ZodType, path: string): string[] {
  if (schema instanceof z.ZodString) return schema.maxLength === null ? [path] : [];
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape as Record<string, z.ZodType>).flatMap(([key, field]) =>
      unboundedStrings(field, path ? `${path}.${key}` : key)
    );
  }
  if (schema instanceof z.ZodArray) return unboundedStrings(schema.element as z.ZodType, `${path}[]`);
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) {
    return unboundedStrings(schema.unwrap() as z.ZodType, path);
  }
  if (schema instanceof z.ZodUnion) {
    return (schema.options as readonly z.ZodType[]).flatMap((option, i) => unboundedStrings(option, `${path}|${i}`));
  }
  if (schema instanceof z.ZodPipe) {
    return [...unboundedStrings(schema.in as z.ZodType, path), ...unboundedStrings(schema.out as z.ZodType, path)];
  }
  if (schema instanceof z.ZodRecord) {
    return [
      ...unboundedStrings(schema.keyType as z.ZodType, `${path}{key}`),
      ...unboundedStrings(schema.valueType as z.ZodType, `${path}{}`),
    ];
  }
  if (
    schema instanceof z.ZodNumber ||
    schema instanceof z.ZodBoolean ||
    schema instanceof z.ZodEnum ||
    schema instanceof z.ZodLiteral ||
    schema instanceof z.ZodTransform ||
    schema instanceof z.ZodNull ||
    schema instanceof z.ZodUnknown
  ) {
    return [];
  }
  throw new Error(`${path}: a kind of schema this walk does not know; teach it before trusting it`);
}

describe('every text field on a sheet', () => {
  it.each([
    ['DND_5E', dnd5eCharacterDataSchema],
    ['PATHFINDER_2E', pathfinder2eCharacterDataSchema],
    ['CALL_OF_CTHULHU_7E', callOfCthulhu7eCharacterDataSchema],
    ['SHADOWRUN_6E', shadowrun6eCharacterDataSchema],
    ['Flexible', flexibleCharacterDataSchema],
  ] as Array<[string, z.ZodType]>)('has a length limit in %s', (_system, schema) => {
    expect(unboundedStrings(schema, '')).toEqual([]);
  });
});

describe('the limits', () => {
  const blank = (system: GameSystem) => getBlankCharacterTemplate(system) as Record<string, unknown>;
  const paths = (system: GameSystem, data: unknown) => {
    const result = validateCharacterData(system, data);
    return result.success ? [] : result.errors.issues.map((issue) => issue.path.join('.'));
  };
  const short = 'x'.repeat(SHEET_SHORT_TEXT_MAX + 1);
  const long = 'x'.repeat(SHEET_LONG_TEXT_MAX + 1);

  it('refuse a one-line box over the short limit', () => {
    expect(paths(GameSystem.DND_5E, { ...blank(GameSystem.DND_5E), class: short })).toContain('class');
    expect(paths(GameSystem.PATHFINDER_2E, { ...blank(GameSystem.PATHFINDER_2E), ancestry: short })).toContain('ancestry');
    expect(paths(GameSystem.CALL_OF_CTHULHU_7E, { ...blank(GameSystem.CALL_OF_CTHULHU_7E), occupation: short })).toContain('occupation');
    expect(paths(GameSystem.DND_5E, { ...blank(GameSystem.DND_5E), inventory: [{ name: short }] })).toContain('inventory.0.name');
  });

  it('refuse a paragraph box over the long limit', () => {
    expect(paths(GameSystem.DND_5E, { ...blank(GameSystem.DND_5E), backstory: long })).toContain('backstory');
    expect(paths(GameSystem.PATHFINDER_2E, { ...blank(GameSystem.PATHFINDER_2E), notes: long })).toContain('notes');
    const coc = blank(GameSystem.CALL_OF_CTHULHU_7E);
    expect(
      paths(GameSystem.CALL_OF_CTHULHU_7E, { ...coc, backstory: { ...(coc.backstory as object), description: long } })
    ).toContain('backstory.description');
  });

  it('take a paragraph box at the long limit, and a one-line box at the short one', () => {
    expect(
      paths(GameSystem.DND_5E, {
        ...blank(GameSystem.DND_5E),
        backstory: 'y'.repeat(SHEET_LONG_TEXT_MAX),
        race: 'y'.repeat(SHEET_SHORT_TEXT_MAX),
        featuresAndTraits: [{ name: 'Second Wind', description: 'y'.repeat(SHEET_LONG_TEXT_MAX) }],
      })
    ).toEqual([]);
  });

  it('take a feature written before descriptions existed, however long its line', () => {
    expect(paths(GameSystem.DND_5E, { ...blank(GameSystem.DND_5E), featuresAndTraits: ['z'.repeat(5000)] })).toEqual([]);
  });
});

describe('the allies name', () => {
  const paths = (system: GameSystem, data: unknown) => {
    const result = validateCharacterData(system, data);
    return result.success ? [] : result.errors.issues.map((issue) => issue.path.join('.'));
  };
  const paragraph = 'y'.repeat(SHEET_SHORT_TEXT_MAX * 5);
  const blank = (system: GameSystem) => getBlankCharacterTemplate(system) as Record<string, unknown>;

  it('takes the paragraph a pre-1.3.0 D&D 5e sheet had in its allies field, once that is moved', () => {
    const older: Record<string, unknown> = { ...blank(GameSystem.DND_5E), allies: paragraph };
    delete older.alliesAndOrganizations;
    const moved = migrateLegacySheetFields(GameSystem.DND_5E, older) as { alliesAndOrganizations: { name: string } };

    expect(moved.alliesAndOrganizations.name).toBe(paragraph);
    expect(paths(GameSystem.DND_5E, moved)).toEqual([]);
  });

  it.each([GameSystem.DND_5E, GameSystem.PATHFINDER_2E])('takes a paragraph in %s', (system) => {
    expect(paths(system, { ...blank(system), alliesAndOrganizations: { name: paragraph } })).toEqual([]);
  });

  it.each([GameSystem.DND_5E, GameSystem.PATHFINDER_2E])('is still refused past the paragraph limit in %s', (system) => {
    const sheet = { ...blank(system), alliesAndOrganizations: { name: 'x'.repeat(SHEET_LONG_TEXT_MAX + 1) } };
    expect(paths(system, sheet)).toContain('alliesAndOrganizations.name');
  });
});
