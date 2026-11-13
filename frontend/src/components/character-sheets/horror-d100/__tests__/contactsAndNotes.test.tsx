/**
 * Contacts and the wealth notes on the Horror d100 sheet.
 *
 * The read-only sheet listed a character's contacts, but the editor had no
 * way to add, change or remove one; and the notes a sheet keeps on wealth
 * were shown and edited nowhere.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HorrorD100CharacterEditor } from '../HorrorD100CharacterEditor';
import { HorrorD100CharacterView } from '../HorrorD100CharacterView';
import type { CharacterData } from '../../../../types';
import type { HorrorD100Sheet } from '@/types/game-systems/horrorD100Sheet';
import { blankSheet, horrorD100Character } from './sheetFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

function open(overrides: Partial<HorrorD100Sheet> = {}) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<HorrorD100CharacterEditor character={horrorD100Character(overrides)} onSave={onSave} onCancel={vi.fn()} />);
  return async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return onSave.mock.calls[0][0] as HorrorD100Sheet;
  };
}

describe('contacts in the editor', () => {
  it('can be added and filled in', async () => {
    const save = open();
    fireEvent.click(screen.getByRole('tab', { name: /^Possessions$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
    fireEvent.change(screen.getByLabelText('Name of contact 1'), { target: { value: 'Dr Edith Vane' } });
    fireEvent.change(screen.getByLabelText('Role of contact 1'), { target: { value: 'Librarian' } });
    fireEvent.change(screen.getByLabelText('Notes on contact 1'), { target: { value: 'Halloway College' } });

    expect((await save()).contacts).toEqual([{ name: 'Dr Edith Vane', role: 'Librarian', notes: 'Halloway College' }]);
  });

  it('can be removed', async () => {
    const save = open({ contacts: [{ name: 'Edwin Hale' }] });
    fireEvent.click(screen.getByRole('tab', { name: /^Possessions$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Edwin Hale' }));
    expect((await save()).contacts).toEqual([]);
  });
});

describe('wealth', () => {
  it('is edited, its level and its notes', async () => {
    const save = open();
    fireEvent.click(screen.getByRole('tab', { name: /^Possessions$/ }));
    fireEvent.change(screen.getByLabelText('Wealth Level'), { target: { value: 'Affluent' } });
    fireEvent.change(screen.getByLabelText('Wealth notes'), { target: { value: 'A trust fund' } });

    expect((await save()).wealth).toEqual({ level: 'Affluent', cash: 0, assets: '', notes: 'A trust fund' });
  });

  it('is shown on the read-only sheet, beside the character\'s Status', () => {
    render(
      <HorrorD100CharacterView
        character={horrorD100Character({ wealth: { ...blankSheet().wealth, level: 'Affluent', cash: 12, notes: 'A trust fund' } })}
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: /^Possessions$/ }));
    expect(screen.getByText('A trust fund')).toBeInTheDocument();
    expect(screen.getByText('Affluent')).toBeInTheDocument();
    expect(screen.getByText('$12')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
  });

  it('is not given a cash figure by passing through the box of a sheet that has none', async () => {
    const save = open({ wealth: { level: 'Poor' } });
    fireEvent.click(screen.getByRole('tab', { name: /^Possessions$/ }));
    const cash = screen.getByLabelText('Cash on Hand');
    fireEvent.focus(cash);
    fireEvent.blur(cash);
    expect((await save()).wealth).toEqual({ level: 'Poor' });
  });
});

describe('a contact with no name', () => {
  it('is shown on the read-only sheet as unnamed', () => {
    render(<HorrorD100CharacterView character={horrorD100Character({ contacts: [{ name: '', role: 'Librarian' }] })} />);
    const tabs = screen.getAllByRole('tab', { name: /^Possessions$/ });
    fireEvent.click(tabs[tabs.length - 1]);
    expect(screen.getByText('Unnamed contact')).toBeInTheDocument();
  });
});
