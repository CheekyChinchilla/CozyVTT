/**
 * Dodge on the Call of Cthulhu sheet.
 *
 * Half DEX is only Dodge's base. Like any other skill it takes occupation and
 * personal-interest points and grows with improvement checks, so an
 * investigator with DEX 50 can have Dodge 45. The editor set both the base and
 * the value to half DEX every time it opened, showed the value as plain text
 * so it could not be raised, and the next save stored half DEX over whatever
 * the investigator had.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import { CallOfCthulhu7eCharacterView } from '../CallOfCthulhu7eCharacterView';
import type { CharacterData } from '../../../../types';
import { COC_BLANK_SHEET, cocCharacter } from './cocFixture';

interface SavedDodge {
  skills: { dodge: { baseValue: number; currentValue: number } };
  derivedStats: { dodge: { value: number } };
}

/** The blank investigator (DEX 50) with Dodge stored as given. */
function withDodge(baseValue: number, currentValue: number, dex = 50) {
  const characteristics = COC_BLANK_SHEET.characteristics as Record<string, unknown>;
  return cocCharacter({
    characteristics: {
      ...characteristics,
      DEX: { regular: dex, half: Math.floor(dex / 2), fifth: Math.floor(dex / 5) },
    },
    skills: {
      ...(COC_BLANK_SHEET.skills as Record<string, unknown>),
      dodge: { baseValue, currentValue, improvementChecked: false },
    },
    derivedStats: {
      ...(COC_BLANK_SHEET.derivedStats as Record<string, unknown>),
      dodge: { value: currentValue, formula: 'DEX/2', improvementChecked: false },
    },
  });
}

function renderEditor(character: ReturnType<typeof cocCharacter>) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<CallOfCthulhu7eCharacterEditor character={character} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
}

async function savedDodge(onSave: ReturnType<typeof renderEditor>): Promise<SavedDodge> {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return onSave.mock.calls[0][0] as unknown as SavedDodge;
}

/** The value box on the Dodge row of the Skills tab. */
function dodgeBox(): HTMLInputElement | null {
  const row = screen.getByText('Dodge').closest('.group') as HTMLElement;
  return row.querySelector('input[type="number"]');
}

function dexBox(): HTMLInputElement {
  return screen.getByText('DEX').parentElement!.querySelector('input') as HTMLInputElement;
}

describe('Dodge in the editor', () => {
  it('keeps a raised Dodge when the sheet is opened and saved', async () => {
    const onSave = renderEditor(withDodge(25, 45));

    const saved = await savedDodge(onSave);

    expect(saved.skills.dodge.baseValue).toBe(25);
    expect(saved.skills.dodge.currentValue).toBe(45);
    expect(saved.derivedStats.dodge.value).toBe(45);
  });

  it('can be raised like any other skill', async () => {
    const onSave = renderEditor(withDodge(25, 25));
    fireEvent.click(screen.getByRole('button', { name: 'Skills' }));

    const box = dodgeBox();
    expect(box).not.toBeNull();
    fireEvent.change(box!, { target: { value: '55' } });

    const saved = await savedDodge(onSave);
    expect(saved.skills.dodge.currentValue).toBe(55);
    expect(saved.derivedStats.dodge.value).toBe(55);
  });

  it('sets the base from half DEX and keeps the points spent above it', async () => {
    const onSave = renderEditor(withDodge(25, 45));

    fireEvent.change(dexBox(), { target: { value: '60' } });

    const saved = await savedDodge(onSave);
    expect(saved.skills.dodge.baseValue).toBe(30);
    expect(saved.skills.dodge.currentValue).toBe(50);
  });

  it('follows DEX down as well as up', async () => {
    const onSave = renderEditor(withDodge(25, 25));

    fireEvent.change(dexBox(), { target: { value: '40' } });

    const saved = await savedDodge(onSave);
    expect(saved.skills.dodge.baseValue).toBe(20);
    expect(saved.skills.dodge.currentValue).toBe(20);
  });

  it('corrects a stale base without touching the value on open', async () => {
    // Stored base 20 against DEX 50: the base is put right, the 45 is kept.
    const onSave = renderEditor(withDodge(20, 45));

    const saved = await savedDodge(onSave);
    expect(saved.skills.dodge.baseValue).toBe(25);
    expect(saved.skills.dodge.currentValue).toBe(45);
  });

  it('never leaves Dodge below half DEX', async () => {
    const onSave = renderEditor(withDodge(25, 10));

    const saved = await savedDodge(onSave);
    expect(saved.skills.dodge.currentValue).toBe(25);
  });
});

describe('Dodge in the read-only sheet', () => {
  it('shows the investigator’s Dodge, not half DEX', () => {
    const character = withDodge(25, 45);
    // An older save left the derived copy at half DEX.
    (character.data as unknown as SavedDodge).derivedStats.dodge.value = 25;

    render(<CallOfCthulhu7eCharacterView character={character} />);

    const box = screen.getAllByText('Dodge').find((el) => el.closest('.bg-blue-50'))!.closest('.bg-blue-50')!;
    expect(box.textContent).toContain('45%');
  });
});
