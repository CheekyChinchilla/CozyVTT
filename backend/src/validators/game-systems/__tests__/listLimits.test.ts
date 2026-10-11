/**
 * Every list a character sheet stores has a count limit.
 *
 * Only the 1 MB request body limited them, so a player could store tens of
 * thousands of inventory rows, spells or attacks, and every member of the
 * campaign who opened the sheet drew them all. The walk fails for any list a
 * sheet schema accepts without a maximum, so a list added later cannot go
 * without one.
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { GameSystem } from '../../../game-systems';
import {
  getBlankCharacterTemplate,
  validateCharacterData,
  dnd5eCharacterDataSchema,
  flexibleCharacterDataSchema,
} from '../index';
import { unboundedLists } from '../../../__tests__/helpers/sheetSchemaWalk';
import { SHEET_LIST_MAX } from '../sheetLimits';

describe('every list on a sheet', () => {
  it.each([
    ['DND_5E', dnd5eCharacterDataSchema],
    ['Flexible', flexibleCharacterDataSchema],
  ] as Array<[string, z.ZodType]>)('has a count limit in %s', (_system, schema) => {
    expect(unboundedLists(schema)).toEqual([]);
  });
});

/** The issues a sheet is refused with, as `path: message` lines. */
function refusals(system: GameSystem, data: unknown): string[] {
  const result = validateCharacterData(system, data);
  return result.success ? [] : result.errors.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

const blank = (system: GameSystem) => getBlankCharacterTemplate(system) as Record<string, unknown>;
const rows = (count: number, row: unknown) => Array.from({ length: count }, () => row);

describe('the D&D 5e lists', () => {
  const sheet = (fields: Record<string, unknown>) => ({ ...blank(GameSystem.DND_5E), ...fields });
  const item = { name: 'Rope' };
  const named = (name: string) => ({ name, attackBonus: 0 });

  it.each([
    ['inventory', rows(SHEET_LIST_MAX + 1, item)],
    ['attacks', rows(SHEET_LIST_MAX + 1, named('Dagger'))],
    ['hitDice', rows(SHEET_LIST_MAX + 1, { class: 'Fighter', remaining: 1 })],
    ['conditions', rows(SHEET_LIST_MAX + 1, 'prone')],
    ['featuresAndTraits', rows(SHEET_LIST_MAX + 1, 'Second Wind')],
    ['proficienciesAndLanguages', rows(SHEET_LIST_MAX + 1, 'Common')],
    ['proficiencies', rows(SHEET_LIST_MAX + 1, 'Common')],
  ])('refuse %s past the limit, naming the list', (field, list) => {
    expect(refusals(GameSystem.DND_5E, sheet({ [field]: list }))).toEqual([
      `${field}: Can hold at most ${SHEET_LIST_MAX} entries`,
    ]);
  });

  it('refuse spells and cantrips past the limit, naming the list', () => {
    const spell = { level: 1, name: 'Shield', prepared: true, ritual: false, concentration: false };
    expect(
      refusals(GameSystem.DND_5E, sheet({ spellcasting: { spells: rows(SHEET_LIST_MAX + 1, spell) } }))
    ).toEqual([`spellcasting.spells: Can hold at most ${SHEET_LIST_MAX} entries`]);
    expect(
      refusals(GameSystem.DND_5E, sheet({ spellcasting: { cantrips: rows(SHEET_LIST_MAX + 1, 'Light') } }))
    ).toEqual([`spellcasting.cantrips: Can hold at most ${SHEET_LIST_MAX} entries`]);
  });

  it('take every list at the limit', () => {
    const spell = { level: 1, name: 'Shield', prepared: true, ritual: false, concentration: false };
    expect(
      refusals(
        GameSystem.DND_5E,
        sheet({
          inventory: rows(SHEET_LIST_MAX, item),
          attacks: rows(SHEET_LIST_MAX, named('Dagger')),
          hitDice: rows(SHEET_LIST_MAX, { class: 'Fighter', remaining: 1 }),
          conditions: rows(SHEET_LIST_MAX, 'prone'),
          featuresAndTraits: rows(SHEET_LIST_MAX, 'Second Wind'),
          proficienciesAndLanguages: rows(SHEET_LIST_MAX, 'Common'),
          spellcasting: { spells: rows(SHEET_LIST_MAX, spell), cantrips: rows(SHEET_LIST_MAX, 'Light') },
        })
      )
    ).toEqual([]);
  });
});
