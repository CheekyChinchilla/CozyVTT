/**
 * Contacts, and the luck and wealth notes, on the Call of Cthulhu sheet.
 *
 * The read-only sheet listed an investigator's contacts, but the editor had no
 * way to add, change or remove one; and the notes a sheet keeps on Luck and on
 * wealth were shown and edited nowhere.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import { CallOfCthulhu7eCharacterView } from '../CallOfCthulhu7eCharacterView';
import type { CharacterData } from '../../../../types';
import { COC_BLANK_SHEET, cocCharacter } from './cocFixture';

const derivedStats = COC_BLANK_SHEET.derivedStats as Record<string, unknown>;
const wealth = COC_BLANK_SHEET.wealth as Record<string, unknown>;

function open(overrides: Record<string, unknown> = {}) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<CallOfCthulhu7eCharacterEditor character={cocCharacter(overrides)} onSave={onSave} onCancel={vi.fn()} />);
  return async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return onSave.mock.calls[0][0] as unknown as Record<string, never>;
  };
}

describe('contacts in the editor', () => {
  it('can be added and filled in', async () => {
    const save = open();
    fireEvent.click(screen.getByRole('button', { name: /^Possessions$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
    fireEvent.change(screen.getByLabelText('Name of contact 1'), { target: { value: 'Professor Armitage' } });
    fireEvent.change(screen.getByLabelText('Role of contact 1'), { target: { value: 'Librarian' } });
    fireEvent.change(screen.getByLabelText('Notes on contact 1'), { target: { value: 'Miskatonic University' } });

    expect((await save()).contacts).toEqual([{ name: 'Professor Armitage', role: 'Librarian', notes: 'Miskatonic University' }]);
  });

  it('can be removed', async () => {
    const save = open({ contacts: [{ name: 'Wilbur Whateley' }] });
    fireEvent.click(screen.getByRole('button', { name: /^Possessions$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Wilbur Whateley' }));
    expect((await save()).contacts).toEqual([]);
  });
});

describe('the notes on Luck and wealth', () => {
  it('are edited', async () => {
    const save = open();
    fireEvent.change(screen.getByLabelText('Luck notes'), { target: { value: 'Spent 10 at the docks' } });
    fireEvent.click(screen.getByRole('button', { name: /^Possessions$/ }));
    fireEvent.change(screen.getByLabelText('Wealth notes'), { target: { value: 'A trust fund' } });

    const saved = await save();
    expect((saved.derivedStats as { luck: { notes: string } }).luck.notes).toBe('Spent 10 at the docks');
    expect((saved.wealth as { notes: string }).notes).toBe('A trust fund');
  });

  it('are shown on the read-only sheet', () => {
    render(
      <CallOfCthulhu7eCharacterView
        character={cocCharacter({
          derivedStats: { ...derivedStats, luck: { score: 50, notes: 'Spent 10 at the docks' } },
          wealth: { ...wealth, notes: 'A trust fund' },
        })}
      />
    );
    expect(screen.getByText('Spent 10 at the docks')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Possessions$/ }));
    expect(screen.getByText('A trust fund')).toBeInTheDocument();
  });
});
