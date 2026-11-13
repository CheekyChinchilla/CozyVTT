/**
 * The read-only sheet and the editor each show every field a rebuilt Horror
 * d100 sheet stores.
 *
 * The stored sheet the editor test saves holds every field the schema takes,
 * each piece of text different from every other (a backend test holds it to
 * that), and carries a conversion record. Every piece of its text has to be
 * readable somewhere on the read-only sheet, and in the editor, across their
 * tabs: a field one of them lacked would be a value a player could not see,
 * or could not change.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HorrorD100CharacterEditor } from '../HorrorD100CharacterEditor';
import { HorrorD100CharacterView } from '../HorrorD100CharacterView';
import type { Character } from '../../../../types';
import stored from '../../__tests__/storedSheets/horror-d100.json';
import { extractCharacterHp } from '@/utils/characterHp';
import { getCharacterRolls } from '@/utils/characterRolls';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const character = {
  id: 'char-1', userId: 'user-1', name: stored.characterName, gameSystem: 'HORROR_D100', campaignId: null, tokenImageUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', data: JSON.parse(JSON.stringify(stored)),
} as unknown as Character;

/** Every piece of text the sheet stores, by where it is stored. */
function texts(value: unknown, at = ''): [string, string][] {
  if (Array.isArray(value)) return value.flatMap((entry, index) => texts(entry, `${at}[${index}]`));
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([key, entry]) => texts(entry, at ? `${at}.${key}` : key));
  return typeof value === 'string' ? [[at, value]] : [];
}

/** Text that is not shown as it is stored: the header colour, and the record's time, shown as a date. */
const NOT_SHOWN_AS_STORED = new Set(['themeColor', 'converted.at']);
const STORED_TEXT = texts(stored).filter(([at]) => !NOT_SHOWN_AS_STORED.has(at));

/** Everything readable on every tab: the page's text and the value of every box. */
function everyTab(): string {
  return ['Overview', 'Skills', 'Combat', 'Possessions', 'Story'].map((tab) => {
    fireEvent.click(screen.getByRole('tab', { name: tab }));
    const boxes = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')).map((box) => box.value);
    return [document.body.textContent ?? '', ...boxes].join('\n');
  }).join('\n');
}

const missingFrom = (shown: string) => STORED_TEXT.filter(([, text]) => !shown.includes(text)).map(([at]) => at);

describe('a converted Horror d100 sheet holding every field', () => {
  it('holds text in every part the sheet has', () => {
    expect(STORED_TEXT.length).toBeGreaterThan(120);
    for (const part of ['skills.appraise.notes', 'skills.own[0].name', 'weapons[0].notes', 'armor[0].notes', 'story[0].title', 'converted.kept[0]', 'notes']) {
      expect(STORED_TEXT.map(([at]) => at)).toContain(part);
    }
  });

  it('is shown whole on the read-only sheet, to the owner or the GM', () => {
    render(<HorrorD100CharacterView character={character} showOriginalValues />);
    expect(missingFrom(everyTab())).toEqual([]);
  });

  it('is shown whole in the editor', () => {
    render(<HorrorD100CharacterEditor character={character} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(missingFrom(everyTab())).toEqual([]);
  });

  it('shows its numbers on the read-only sheet', () => {
    render(<HorrorD100CharacterView character={character} showOriginalValues />);
    const overview = document.body.textContent ?? '';
    // Characteristics with their rolls, hit points, power points, Sanity and MOV as stored.
    for (const shown of ['STR12', 'Effort60%', 'POW14', 'Luck70%', 'EDU17', 'Knowledge85%', '8 / 13', 'Major Wound: 7 HP', '5 / 15', '58 / 90', 'MOV10']) {
      expect(overview).toContain(shown);
    }
    // STR 12 and SIZ 11 give no damage modifier; INT 15 gives an experience bonus of 8.
    expect(overview).toContain('Damage ModifierNone');
    expect(overview).toContain('Experience Bonus+8%');
  });

  it('ticks its conditions on the read-only sheet', () => {
    render(<HorrorD100CharacterView character={character} />);
    expect(screen.getByRole('checkbox', { name: 'Major Wound' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Temporary Insanity' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Dying' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Unconscious' })).not.toBeChecked();
  });
});

describe('a sheet holding only what the server requires', () => {
  const minimal = { ...character, data: { characterName: 'Ines Okafor', profession: 'Sailor', era: '1920s', characteristics: { STR: 12, CON: 13, SIZ: 11, INT: 15, POW: 14, DEX: 16, CHA: 9 } } } as unknown as Character;

  // The roster card, the token's bar and the roll menu read the stored
  // sheet, so the read-only sheet shows no hit points or skills they lack.
  // The editor adds them, and they are stored with its first save.
  it('is shown on the read-only sheet with what it stores, and nothing the roster and the roll menu do not have', () => {
    render(<HorrorD100CharacterView character={minimal} onRoll={vi.fn()} />);
    const overview = document.body.textContent ?? '';
    for (const shown of ['STR12', 'Effort60%', 'CHA9', 'Damage ModifierNone', 'Experience Bonus+8%']) expect(overview).toContain(shown);
    for (const absent of ['EDU', 'Hit Points', 'Power Points', 'Sanity Points', 'MOV']) expect(overview).not.toContain(absent);
    expect(extractCharacterHp('HORROR_D100', minimal.data as unknown as Record<string, unknown>)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    expect(screen.queryByText('Dodge')).toBeNull();
    expect(getCharacterRolls('HORROR_D100', minimal.data).skills).toEqual([]);
  });
});
