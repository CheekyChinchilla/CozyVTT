/**
 * Features and traits, across every shape a real sheet holds them in.
 *
 * The danger in moving this field to objects is a migration that tries to be
 * clever. Players type whatever they like into a comma-separated box, and real
 * lists look like:
 *
 *   NakuDama-Amphibious, NakuDama-Prehensile Tongue, NakuDama-Frog Leap,
 *   Aspiring Shadow Warrior
 *
 * Any rule that split a name on a hyphen or a colon to invent a description
 * would turn "NakuDama-Amphibious" into "NakuDama" described as "Amphibious",
 * and would do it to thousands of sheets at once. So the rule is that a typed
 * string becomes the name, whole, and nothing else. These tests exist mostly to
 * hold that line.
 */

import { readFileSync } from 'fs';
import path from 'path';
import {
  readFeatureEntries,
  readFeatureEntriesForEditing,
  mergeFeatureEntries,
  collectSheetFeatures,
  alreadyMigrated,
} from '../featureEntries';

describe('readFeatureEntriesForEditing', () => {
  // The storage reader drops nameless entries. An editor cannot: a row just
  // added and not yet typed into has no name, and discarding it made the
  // "Add Feature" button appear to do nothing at all.

  it('keeps a blank row, so a new one can be typed into', () => {
    expect(readFeatureEntriesForEditing([{ name: '', description: '' }])).toEqual([
      { name: '', description: '' },
    ]);
  });

  it('keeps blank rows alongside real ones, in order', () => {
    expect(
      readFeatureEntriesForEditing([
        { name: 'NakuDama-Amphibious', description: '' },
        { name: '', description: '' },
      ])
    ).toEqual([
      { name: 'NakuDama-Amphibious', description: '' },
      { name: '', description: '' },
    ]);
  });

  it('does not trim, so a space can be typed between words', () => {
    // Trimming on every keystroke would eat the space the moment it was typed.
    expect(readFeatureEntriesForEditing([{ name: 'Frog ', description: '' }])).toEqual([
      { name: 'Frog ', description: '' },
    ]);
  });

  it('keeps a row that has a description but no name yet', () => {
    expect(readFeatureEntriesForEditing([{ description: 'Typed first.' }])).toEqual([
      { name: '', description: 'Typed first.' },
    ]);
  });

  it('reads the stored shapes the same way the storage reader does', () => {
    expect(readFeatureEntriesForEditing(['Darkvision'])).toEqual([
      { name: 'Darkvision', description: '' },
    ]);
    expect(readFeatureEntriesForEditing(undefined)).toEqual([]);
  });

  it('is undone by the storage reader, which drops the blanks again', () => {
    const editing = readFeatureEntriesForEditing([
      { name: 'Real', description: '' },
      { name: '', description: '' },
    ]);
    expect(readFeatureEntries(editing)).toEqual([{ name: 'Real', description: '' }]);
  });
});

describe('parity with the frontend copy', () => {
  // The migration, the editor and the read-only view all have to agree about
  // what a player's features are. Drift here would show one list on the sheet
  // and write another to the database.
  it('is byte-for-byte identical to frontend/src/utils/featureEntries.ts', () => {
    const backendCopy = readFileSync(path.resolve(__dirname, '../featureEntries.ts'), 'utf8');
    const frontendCopy = readFileSync(
      path.resolve(__dirname, '../../../../frontend/src/utils/featureEntries.ts'),
      'utf8'
    );
    expect(backendCopy).toBe(frontendCopy);
  });
});

describe('a real player list survives untouched', () => {
  const typed = [
    'NakuDama-Amphibious',
    'NakuDama-Prehensile Tongue',
    'NakuDama-Frog Leap',
    'Aspiring Shadow Warrior',
  ];

  it('keeps each entry whole, in order, with no description invented', () => {
    expect(readFeatureEntries(typed)).toEqual([
      { name: 'NakuDama-Amphibious', description: '' },
      { name: 'NakuDama-Prehensile Tongue', description: '' },
      { name: 'NakuDama-Frog Leap', description: '' },
      { name: 'Aspiring Shadow Warrior', description: '' },
    ]);
  });

  it('reads the same list from the raw textbox contents', () => {
    expect(readFeatureEntries(typed.join(', '))).toEqual(readFeatureEntries(typed));
  });

  it('round-trips back to exactly the original strings', () => {
    // What the player would see if the field were rendered back as a list.
    expect(readFeatureEntries(typed).map((f) => f.name)).toEqual(typed);
  });
});

describe('names that would tempt a parser', () => {
  it.each([
    'NakuDama-Amphibious',
    'Fighting Style: Defense',
    'Eldritch Invocations — Agonizing Blast',
    'Rage (2/day)',
    'Unarmored Defense [Barbarian]',
    'Extra Attack, improved',
    'Ki: Step of the Wind',
    'Draconic Resilience - AC 13 + DEX',
  ])('keeps %j intact as a name', (name) => {
    expect(readFeatureEntries([name])[0]).toEqual({ name, description: '' });
  });

  it('splits on commas only when reading raw textbox contents, not stored entries', () => {
    // The distinction matters. A stored array has already been split, so an
    // element containing a comma is a name that genuinely contains one and is
    // left alone. Only the unsplit contents of the textbox are divided up, and
    // that is the same splitting the editor has always done.
    expect(readFeatureEntries(['Extra Attack, improved'])).toEqual([
      { name: 'Extra Attack, improved', description: '' },
    ]);
    expect(readFeatureEntries('Extra Attack, improved')).toEqual([
      { name: 'Extra Attack', description: '' },
      { name: 'improved', description: '' },
    ]);
  });
});

describe('readFeatureEntries', () => {
  it('reads the object form the templates write', () => {
    expect(
      readFeatureEntries([
        { name: 'Second Wind', description: 'Regain 1d10 + fighter level hit points.' },
      ])
    ).toEqual([
      { name: 'Second Wind', description: 'Regain 1d10 + fighter level hit points.' },
    ]);
  });

  it('reads a mixture of both forms', () => {
    expect(
      readFeatureEntries(['Darkvision', { name: 'Second Wind', description: 'Regain HP.' }])
    ).toEqual([
      { name: 'Darkvision', description: '' },
      { name: 'Second Wind', description: 'Regain HP.' },
    ]);
  });

  it('trims surrounding whitespace without touching the middle', () => {
    expect(readFeatureEntries(['  Frog  Leap  '])).toEqual([
      { name: 'Frog  Leap', description: '' },
    ]);
  });

  it('drops blanks rather than creating nameless features', () => {
    expect(readFeatureEntries(['', '   ', 'Real'])).toEqual([
      { name: 'Real', description: '' },
    ]);
    expect(readFeatureEntries('Real, , ,')).toEqual([{ name: 'Real', description: '' }]);
  });

  it('drops entries with no usable name', () => {
    expect(readFeatureEntries([{ description: 'orphaned' }, { name: '   ' }, 42, null])).toEqual(
      []
    );
  });

  it('reads anything unexpected as empty rather than throwing', () => {
    expect(readFeatureEntries(undefined)).toEqual([]);
    expect(readFeatureEntries(null)).toEqual([]);
    expect(readFeatureEntries(123)).toEqual([]);
    expect(readFeatureEntries({ name: 'not in an array' })).toEqual([]);
  });
});

describe('mergeFeatureEntries', () => {
  it('keeps the order given, player list first', () => {
    const player = readFeatureEntries(['Aspiring Shadow Warrior']);
    const template = readFeatureEntries([
      { name: 'Second Wind', description: 'Regain HP.' },
    ]);
    expect(mergeFeatureEntries(player, template).map((f) => f.name)).toEqual([
      'Aspiring Shadow Warrior',
      'Second Wind',
    ]);
  });

  it('does not duplicate a feature the player already typed', () => {
    const player = readFeatureEntries(['Second Wind']);
    const template = readFeatureEntries([
      { name: 'Second Wind', description: 'Regain 1d10 + fighter level.' },
    ]);
    const merged = mergeFeatureEntries(player, template);
    expect(merged).toHaveLength(1);
  });

  it('fills in the description for a feature the player typed by name', () => {
    const merged = mergeFeatureEntries(
      readFeatureEntries(['second wind']),
      readFeatureEntries([{ name: 'Second Wind', description: 'Regain 1d10.' }])
    );
    // The player's spelling is kept; only the missing description is taken.
    expect(merged).toEqual([{ name: 'second wind', description: 'Regain 1d10.' }]);
  });

  it('never lets a later list overwrite a description already present', () => {
    const merged = mergeFeatureEntries(
      readFeatureEntries([{ name: 'Second Wind', description: 'Mine.' }]),
      readFeatureEntries([{ name: 'Second Wind', description: 'Theirs.' }])
    );
    expect(merged).toEqual([{ name: 'Second Wind', description: 'Mine.' }]);
  });
});

describe('collectSheetFeatures', () => {
  it('reads a sheet that only ever used the editor', () => {
    const sheet = {
      featuresAndTraits: ['NakuDama-Amphibious', 'Aspiring Shadow Warrior'],
    };
    expect(collectSheetFeatures(sheet).map((f) => f.name)).toEqual([
      'NakuDama-Amphibious',
      'Aspiring Shadow Warrior',
    ]);
  });

  it('recovers a template sheet whose features were never shown', () => {
    const sheet = {
      features: [
        { name: 'Second Wind', description: 'Regain 1d10 + fighter level.' },
        { name: 'Fighting Style: Defense', description: '+1 AC while armored.' },
      ],
    };
    expect(collectSheetFeatures(sheet)).toEqual([
      { name: 'Second Wind', description: 'Regain 1d10 + fighter level.' },
      { name: 'Fighting Style: Defense', description: '+1 AC while armored.' },
    ]);
  });

  it('puts what the player sees today ahead of what is being restored', () => {
    // A character built from the Fighter template and then edited: the typed
    // list is the only thing that has ever been visible, so it stays first.
    const sheet = {
      featuresAndTraits: ['NakuDama-Frog Leap'],
      features: [{ name: 'Second Wind', description: 'Regain 1d10.' }],
    };
    expect(collectSheetFeatures(sheet).map((f) => f.name)).toEqual([
      'NakuDama-Frog Leap',
      'Second Wind',
    ]);
  });

  it('is empty for a sheet with neither field', () => {
    expect(collectSheetFeatures({ class: 'Fighter' })).toEqual([]);
    expect(collectSheetFeatures(null)).toEqual([]);
  });
});

describe('alreadyMigrated', () => {
  it('is true once the field holds objects and the orphan is gone', () => {
    expect(
      alreadyMigrated({ featuresAndTraits: [{ name: 'Second Wind', description: '' }] })
    ).toBe(true);
  });

  it('is true for a sheet with an empty migrated list', () => {
    expect(alreadyMigrated({ featuresAndTraits: [] })).toBe(true);
  });

  it('is false while the orphan field is still present', () => {
    expect(
      alreadyMigrated({ featuresAndTraits: [{ name: 'X', description: '' }], features: [] })
    ).toBe(false);
  });

  it('is false for the string form', () => {
    expect(alreadyMigrated({ featuresAndTraits: ['NakuDama-Amphibious'] })).toBe(false);
  });

  it('is false for a sheet that has neither field, so it gets normalised once', () => {
    expect(alreadyMigrated({ class: 'Fighter' })).toBe(false);
  });
});

describe('the conversion is idempotent', () => {
  it('reading its own output changes nothing', () => {
    const once = collectSheetFeatures({
      featuresAndTraits: ['NakuDama-Amphibious', 'Aspiring Shadow Warrior'],
      features: [{ name: 'Second Wind', description: 'Regain 1d10.' }],
    });
    const twice = collectSheetFeatures({ featuresAndTraits: once });
    expect(twice).toEqual(once);

    const thrice = collectSheetFeatures({ featuresAndTraits: twice });
    expect(thrice).toEqual(once);
  });
});
