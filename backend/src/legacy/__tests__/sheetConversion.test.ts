/**
 * Where the server converts a Horror d100 sheet: only for a character or
 * template whose system is Horror d100 (its old value read as its new one),
 * every old shape an older version could store or a row could hold, and the
 * conversion record kept as the server wrote it.
 */

import fs from 'fs';
import path from 'path';
import type { Prisma } from '@prisma/client';
import { LEGACY_GAME_SYSTEMS } from '../gameSystemAliases';
import { convertHorrorD100Sheet } from '../horrorD100Sheet';
import { isHorrorD100, sheetAsRead, sheetAsSent, sheetKeepingConversionRecord, sheetWithoutConversionRecord } from '../sheetConversion';
import { isJsonValue } from '../../utils/prisma-json';

type Fields = Record<string, unknown>;

const FIXTURES = path.join(__dirname, '../__fixtures__/horror-d100-sheets');
const ALL_FIXTURES = ['v1.3.0-detective', 'v1.5.0-blank', 'v1.6.0-detective-played', 'v1.6.0-example', 'v1.6.0-example-minimal', 'pre-1.3.0-player', 'malformed'];
const NOW = new Date('2026-11-12T08:00:00.000Z');

function fixture(name: string): Prisma.JsonValue {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));
  if (!isJsonValue(parsed)) throw new Error(`${name}.json is not JSON`);
  return parsed;
}

const oldHorrorValue = Object.keys(LEGACY_GAME_SYSTEMS).find((old) => LEGACY_GAME_SYSTEMS[old] === 'HORROR_D100');

describe('isHorrorD100', () => {
  it('reads the system by its new value and its old one, and nothing else', () => {
    expect(isHorrorD100('HORROR_D100')).toBe(true);
    expect(isHorrorD100(oldHorrorValue)).toBe(true);
    expect([null, undefined, 'FIFTH_EDITION', 'FANTASY_D20', 'SOMETHING_ELSE', 5].map(isHorrorD100)).toEqual([false, false, false, false, false, false]);
  });
});

describe('sheetAsRead', () => {
  it.each(ALL_FIXTURES)('answers %s converted, without changing the stored value', (name) => {
    const stored = fixture(name);
    const before = JSON.stringify(stored);
    const read = sheetAsRead('HORROR_D100', stored, NOW);
    expect(read).toEqual(convertHorrorD100Sheet(stored, NOW).sheet);
    expect(read).not.toBe(stored);
    expect(JSON.stringify(stored)).toBe(before);
  });

  it('answers a converted sheet, and the sheet of any other system, as the same value', () => {
    const converted = sheetAsRead('HORROR_D100', fixture('v1.6.0-example'), NOW);
    expect(sheetAsRead('HORROR_D100', converted, NOW)).toBe(converted);
    const old = fixture('v1.6.0-example');
    for (const system of [null, 'FIFTH_EDITION', 'FANTASY_D20', 'SOMETHING_ELSE']) expect(sheetAsRead(system, old, NOW)).toBe(old);
  });
});

describe('sheetAsSent', () => {
  it('converts an old sheet of a Horror d100 character, with the record its conversion wrote', () => {
    const sent = sheetAsSent(oldHorrorValue, fixture('v1.6.0-example'), NOW) as Fields;
    expect(sent.converted).toMatchObject({ from: 1, at: NOW.toISOString() });
  });

  it('takes a Flexible sheet holding the old sheet\'s keys as it was sent', () => {
    const flexible = { investigatorName: 'Iris', occupation: 'Sailor', characteristics: { APP: { regular: 60 } } };
    expect(sheetAsSent(null, flexible, NOW)).toBe(flexible);
  });

  it('takes a rebuilt sheet, a record it carries and all, as it was sent', () => {
    const sheet = { characterName: 'Wren', converted: { from: 1 } };
    expect(sheetAsSent('HORROR_D100', sheet, NOW)).toBe(sheet);
  });
});

describe('sheetKeepingConversionRecord', () => {
  const sent = { characterName: 'Wren', converted: { from: 1, at: 'sent' } };
  const record = { from: 1, at: 'stored', characteristics: {}, skills: [], kept: [] };

  it('keeps the stored record, whatever the save sends or leaves out', () => {
    expect(sheetKeepingConversionRecord('HORROR_D100', sent, { characterName: 'Wren', converted: record }, NOW)).toEqual({ characterName: 'Wren', converted: record });
    expect(sheetKeepingConversionRecord('HORROR_D100', { characterName: 'Wren' }, { converted: record }, NOW)).toEqual({ characterName: 'Wren', converted: record });
  });

  it('takes the record a stored old sheet\'s conversion gives', () => {
    const kept = sheetKeepingConversionRecord('HORROR_D100', sent, fixture('v1.6.0-example'), NOW) as Fields;
    expect(kept.converted).toEqual((convertHorrorD100Sheet(fixture('v1.6.0-example'), NOW).sheet as Fields).converted);
  });

  it('stores no record where the stored sheet has none, whatever the save carries', () => {
    expect(sheetKeepingConversionRecord('HORROR_D100', sent, { characterName: 'Wren' }, NOW)).toEqual({ characterName: 'Wren' });
    const convertedBody = sheetAsSent('HORROR_D100', fixture('v1.6.0-example'), NOW);
    expect(sheetKeepingConversionRecord('HORROR_D100', convertedBody, { characterName: 'Wren' }, NOW)).not.toHaveProperty('converted');
  });

  it('leaves the sheet of any other system as it is', () => {
    expect(sheetKeepingConversionRecord(null, sent, { converted: record }, NOW)).toBe(sent);
    expect(sheetKeepingConversionRecord('FIFTH_EDITION', sent, { converted: record }, NOW)).toBe(sent);
  });
});

describe('sheetWithoutConversionRecord', () => {
  it('takes the record off a Horror d100 sheet, as a template keeps it, and leaves any other sheet as it is', () => {
    const sheet = { characterName: 'Wren', converted: { from: 1 } };
    expect(sheetWithoutConversionRecord('HORROR_D100', sheet)).toEqual({ characterName: 'Wren' });
    expect(sheetWithoutConversionRecord(null, sheet)).toBe(sheet);
    const none = { characterName: 'Wren' };
    expect(sheetWithoutConversionRecord('HORROR_D100', none)).toBe(none);
  });
});
