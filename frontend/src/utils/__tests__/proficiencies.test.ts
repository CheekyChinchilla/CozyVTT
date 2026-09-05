/**
 * Reading the four proficiency boxes off a D&D 5e sheet.
 *
 * Reported from a live game: languages typed comma-separated came back with
 * most of them missing. Reproduced in the browser — typing
 * "Common, Elvish, Dwarvish, Thieves' Cant, Druidic" into Languages and
 * reopening the sheet showed **Weapons: Thieves' Cant, Druidic** and
 * **Languages: Common, Elvish, Dwarvish**.
 *
 * The view was re-deriving the categories from a hardcoded list of language
 * names, because storage flattens all four boxes into one array. Anything the
 * list did not know fell through to weapons, so a player whose languages were
 * mostly homebrew saw only the few it recognised.
 */

import { describe, it, expect } from 'vitest';
import {
  readProficiencyGroups,
  categorizeProficiencyList,
  flattenProficiencyGroups,
  type ProficiencyGroups,
} from '../proficiencies';

const groups = (over: Partial<ProficiencyGroups> = {}): ProficiencyGroups => ({
  armor: '', weapons: '', tools: '', languages: '', ...over,
});

describe('readProficiencyGroups', () => {
  // The reported case.
  it('keeps a language no word list knows', () => {
    const sheet = {
      proficiencies: { languages: "Common, Elvish, Dwarvish, Thieves' Cant, Druidic" },
    };
    expect(readProficiencyGroups(sheet).languages).toBe(
      "Common, Elvish, Dwarvish, Thieves' Cant, Druidic"
    );
    expect(readProficiencyGroups(sheet).weapons).toBe('');
  });

  it('returns each box exactly as it was typed', () => {
    const sheet = {
      proficiencies: {
        armor: 'All armor, shields',
        weapons: 'Simple, martial',
        tools: "Thieves' tools",
        languages: 'Common, Aarakocra',
      },
    };
    expect(readProficiencyGroups(sheet)).toEqual(sheet.proficiencies);
  });

  // Free-form is the point: no splitting, no reordering, no tidying.
  it('does not parse or reformat what the player wrote', () => {
    const messy = 'common;elvish / dwarvish  ,, and a bit of Giant';
    expect(readProficiencyGroups({ proficiencies: { languages: messy } }).languages).toBe(messy);
  });

  it('treats a missing box as empty rather than dropping the others', () => {
    const sheet = { proficiencies: { languages: 'Common' } };
    expect(readProficiencyGroups(sheet)).toEqual(groups({ languages: 'Common' }));
  });

  it('ignores a non-string box', () => {
    const sheet = { proficiencies: { languages: ['Common'], armor: 'Shields' } };
    expect(readProficiencyGroups(sheet)).toEqual(groups({ armor: 'Shields' }));
  });

  describe('sheets saved before the boxes were stored separately', () => {
    it('falls back to guessing from the flat list', () => {
      const sheet = {
        proficienciesAndLanguages: ['Light armor', 'Longsword', "Thieves' tools", 'Elvish'],
      };
      expect(readProficiencyGroups(sheet)).toEqual(
        groups({ armor: 'Light armor', weapons: 'Longsword', tools: "Thieves' tools", languages: 'Elvish' })
      );
    });

    // The structured object is the player's own answer; it always wins.
    it('prefers the structured object when both are present', () => {
      const sheet = {
        proficiencies: { languages: 'Druidic' },
        proficienciesAndLanguages: ['Elvish', 'Longsword'],
      };
      expect(readProficiencyGroups(sheet).languages).toBe('Druidic');
      expect(readProficiencyGroups(sheet).weapons).toBe('');
    });

    it('skips entries that are not strings', () => {
      const sheet = { proficienciesAndLanguages: ['Elvish', 42, null] };
      expect(readProficiencyGroups(sheet).languages).toBe('Elvish');
    });
  });

  it.each([
    ['nothing at all', undefined],
    ['an empty sheet', {}],
    ['a sheet that is not an object', 'nonsense'],
    ['a flat list that is not an array', { proficienciesAndLanguages: 'Common' }],
  ])('returns four empty boxes for %s', (_label, sheet) => {
    expect(readProficiencyGroups(sheet)).toEqual(groups());
  });
});

describe('categorizeProficiencyList', () => {
  it('sorts a recognisable list the way it always did', () => {
    expect(categorizeProficiencyList(['Heavy armor', 'Shields', 'Common', 'Smith\'s tools'])).toEqual(
      groups({ armor: 'Heavy armor, Shields', languages: 'Common', tools: "Smith's tools" })
    );
  });

  // This is the failure the fix exists to stop mattering. It is pinned so the
  // legacy path's behaviour is documented rather than accidental.
  it('still mis-files an unknown language, which is why it is legacy-only', () => {
    expect(categorizeProficiencyList(["Thieves' Cant"]).weapons).toBe("Thieves' Cant");
    expect(categorizeProficiencyList(["Thieves' Cant"]).languages).toBe('');
  });

  it('sorts an unrecognised entry into weapons', () => {
    expect(categorizeProficiencyList(['Longbow']).weapons).toBe('Longbow');
  });
});

describe('flattenProficiencyGroups', () => {
  it('writes every box into the compatibility array in order', () => {
    expect(
      flattenProficiencyGroups(
        groups({ armor: 'Light armor', weapons: 'Longsword', tools: 'Lute', languages: 'Common, Druidic' })
      )
    ).toEqual(['Light armor', 'Longsword', 'Lute', 'Common', 'Druidic']);
  });

  it('drops blanks and trims, so an empty box adds nothing', () => {
    expect(flattenProficiencyGroups(groups({ languages: ' Common ,, Elvish , ' }))).toEqual([
      'Common',
      'Elvish',
    ]);
  });

  it('produces nothing for four empty boxes', () => {
    expect(flattenProficiencyGroups(groups())).toEqual([]);
  });
});
