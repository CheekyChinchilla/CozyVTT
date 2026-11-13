/**
 * What each typed sheet editor saves for a stored sheet, held to a committed
 * copy.
 *
 * Each sheet in storedSheets/ holds every field its system's schema takes,
 * each with a value of its own (a backend test checks that it still does).
 * The editor opens it, saves it with nothing changed, and saves it again with
 * only the character's name changed. What it saved is compared with the copy
 * in storedSheets/saved/, so a change to a label or a message that also
 * changed what a sheet stores fails here.
 *
 * Each sheet in storedSheets/minimal/ holds only what the server's blank
 * starter sheet held in 1.6.0, in the form it stored it; the Horror d100 one,
 * whose sheet 1.7.0 rebuilt, holds only what its schema requires. The editor
 * must save every value it holds as it is, and may add only its defaults for
 * what it lacks, which the copy in storedSheets/saved/ holds. One more holds
 * a header colour stored by its preset's name, which the editor must keep.
 *
 * The Horror d100 editor works nothing out again as it opens, so it saves a
 * stored sheet exactly as it was stored, the record of its conversion from
 * the sheet before 1.7.0 (`converted`) included, whatever else is edited.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { FifthEditionCharacterEditor } from '../fifth-edition/FifthEditionCharacterEditor';
import { FantasyD20CharacterEditor } from '../fantasy-d20/FantasyD20CharacterEditor';
import { HorrorD100CharacterEditor } from '../horror-d100/HorrorD100CharacterEditor';
import type { Character, CharacterData, GameSystem } from '../../../types';
import fifthSheet from './storedSheets/5e.json';
import fantasySheet from './storedSheets/fantasy-d20.json';
import horrorSheet from './storedSheets/horror-d100.json';
import fifthMinimal from './storedSheets/minimal/5e.json';
import fantasyMinimal from './storedSheets/minimal/fantasy-d20.json';
import horrorMinimal from './storedSheets/minimal/horror-d100.json';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

type EditorProps = {
  character: Character;
  onSave: (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => Promise<void>;
  onCancel: () => void;
};

const EDITORS: { file: string; system: GameSystem; Editor: React.FC<EditorProps>; sheet: Record<string, unknown>; name: string }[] = [
  { file: '5e', system: 'FIFTH_EDITION' as GameSystem, Editor: FifthEditionCharacterEditor, sheet: fifthSheet, name: fifthSheet.characterName },
  { file: 'fantasy-d20', system: 'FANTASY_D20' as GameSystem, Editor: FantasyD20CharacterEditor, sheet: fantasySheet, name: fantasySheet.characterName },
  { file: 'horror-d100', system: 'HORROR_D100' as GameSystem, Editor: HorrorD100CharacterEditor, sheet: horrorSheet, name: horrorSheet.characterName },
];

function open({ system, Editor, sheet, name }: (typeof EDITORS)[number]) {
  const onSave = vi.fn<EditorProps['onSave']>().mockResolvedValue(undefined);
  const character = {
    id: 'char-1',
    userId: 'user-1',
    name,
    gameSystem: system,
    campaignId: null,
    tokenImageUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    data: JSON.parse(JSON.stringify(sheet)),
  } as unknown as Character;
  render(<Editor character={character} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
}

async function saved(onSave: ReturnType<typeof open>): Promise<string> {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  return `${JSON.stringify(onSave.mock.calls[0][0], null, 2)}\n`;
}

describe.each(EDITORS)('the $file editor', (entry) => {
  it('saves a stored sheet opened and saved with nothing changed as it always has', async () => {
    const onSave = open(entry);
    await expect(await saved(onSave)).toMatchFileSnapshot(`./storedSheets/saved/${entry.file}-unchanged.json`);
  });

  it('saves a stored sheet whose name alone was changed as it always has', async () => {
    const onSave = open(entry);
    fireEvent.change(screen.getByDisplayValue(entry.name), { target: { value: 'Renamed in the editor' } });
    await expect(await saved(onSave)).toMatchFileSnapshot(`./storedSheets/saved/${entry.file}-renamed.json`);
  });
});

describe('the horror-d100 editor, given a sheet converted from the one before 1.7.0', () => {
  const entry = EDITORS.find((editor) => editor.file === 'horror-d100')!;

  it('saves every stored value exactly as it was stored', async () => {
    const onSave = open(entry);
    expect(JSON.parse(await saved(onSave))).toEqual(entry.sheet);
  });

  it('saves the conversion record as it was stored, whatever else is edited', async () => {
    const onSave = open(entry);
    fireEvent.change(screen.getByDisplayValue(entry.name), { target: { value: 'Renamed in the editor' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'STR' }), { target: { value: '15' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'POW' }), { target: { value: '9' } });
    const sheet: { converted?: unknown; characterName?: unknown } = JSON.parse(await saved(onSave));
    expect(sheet.characterName).toBe('Renamed in the editor');
    expect(sheet.converted).toEqual(horrorSheet.converted);
  });
});

const MINIMAL: typeof EDITORS = [
  { file: '5e', system: 'FIFTH_EDITION' as GameSystem, Editor: FifthEditionCharacterEditor, sheet: fifthMinimal, name: fifthMinimal.characterName },
  { file: 'fantasy-d20', system: 'FANTASY_D20' as GameSystem, Editor: FantasyD20CharacterEditor, sheet: fantasyMinimal, name: fantasyMinimal.characterName },
  { file: 'horror-d100', system: 'HORROR_D100' as GameSystem, Editor: HorrorD100CharacterEditor, sheet: horrorMinimal, name: horrorMinimal.characterName },
  // A preset other than the first, which a sheet stores by name.
  {
    file: 'fantasy-d20-emerald', system: 'FANTASY_D20' as GameSystem, Editor: FantasyD20CharacterEditor,
    sheet: { ...fantasyMinimal, themeColor: 'Emerald' }, name: fantasyMinimal.characterName,
  },
];

/** Every value in a sheet by its key path, arrays by index; an empty list or object is a value of its own. */
function values(value: unknown, at = ''): [string, unknown][] {
  if (Array.isArray(value)) return value.length ? value.flatMap((entry, i) => values(entry, `${at}[${i}]`)) : [[at, []]];
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length ? entries.flatMap(([key, entry]) => values(entry, at ? `${at}.${key}` : key)) : [[at, {}]];
  }
  return [[at, value]];
}

describe.each(MINIMAL)('the $file editor, given the sheet a new character was made with', (entry) => {
  it('saves every value the sheet holds as it is', async () => {
    const onSave = open(entry);
    const kept = new Map(values(JSON.parse(await saved(onSave))).map(([at, value]) => [at, JSON.stringify(value)]));
    const changed = values(entry.sheet).filter(([at, value]) => kept.get(at) !== JSON.stringify(value));
    expect(changed.map(([at, value]) => [at, value, kept.get(at)])).toEqual([]);
  });

  it('adds only the defaults it always has', async () => {
    const onSave = open(entry);
    await expect(await saved(onSave)).toMatchFileSnapshot(`./storedSheets/saved/${entry.file}-minimal.json`);
  });
});

/** Opens each of the Horror d100 editor's tabs in turn and passes focus through every box on it. */
function walkEveryBox() {
  let boxes = 0;
  for (const tab of ['Overview', 'Skills', 'Combat', 'Possessions', 'Story']) {
    fireEvent.click(screen.getByRole('tab', { name: tab }));
    for (const box of document.querySelectorAll<HTMLElement>('input:not([type="file"]):not([type="color"]), textarea, select')) {
      fireEvent.focus(box);
      fireEvent.blur(box);
      boxes += 1;
    }
  }
  return boxes;
}

// Focus passing through a box is not an edit. A box that settled its value
// as it lost focus, or wrote a default for a field the sheet lacks, would
// change a sheet whose player only tabbed across it.
describe('the horror-d100 editor, with every tab opened and focus passed through every box', () => {
  const entry = EDITORS.find((editor) => editor.file === 'horror-d100')!;

  it('saves the stored sheet exactly as it was stored', async () => {
    const onSave = open(entry);
    expect(walkEveryBox()).toBeGreaterThan(150);
    expect(JSON.parse(await saved(onSave))).toEqual(entry.sheet);
  });

  it('gives a sheet none of the fields it lacks, and settles none that are outside a box\'s range', async () => {
    const sparse = {
      ...horrorSheet,
      // Current Sanity above the stored maximum, as only a sheet made outside the editor holds.
      sanity: { starting: 70, maximum: 60, current: 65 },
      weapons: [{ name: 'Boat hook' }],
      armor: [{ name: 'Oilskin coat' }],
      wealth: { level: 'Poor' },
      contacts: [{ name: 'Dr Edith Vane' }],
      possessions: [{ name: 'Logbook' }],
      appearance: {},
      conditions: {},
    };
    const onSave = open({ ...entry, sheet: sparse });
    walkEveryBox();
    expect(JSON.parse(await saved(onSave))).toEqual(sparse);
  });

  // The schema takes any amount of cash from 0 up, a fraction included.
  it('keeps a part of a coin in the cash on hand', async () => {
    const fraction = { ...horrorSheet, wealth: { ...horrorSheet.wealth, cash: 12.5 } };
    const onSave = open({ ...entry, sheet: fraction });
    walkEveryBox();
    expect(JSON.parse(await saved(onSave))).toEqual(fraction);
  });

  it('adds to the minimal sheet only what opening it adds', async () => {
    const minimal = MINIMAL.find((editor) => editor.file === 'horror-d100')!;
    const untouched = open(minimal);
    const plain = JSON.parse(await saved(untouched));
    cleanup();
    const onSave = open(minimal);
    walkEveryBox();
    expect(JSON.parse(await saved(onSave))).toEqual(plain);
  });
});

