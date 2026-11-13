/**
 * Names the server requires, cleared in the Horror d100 editor.
 *
 * Clearing the profession, the era or the name of a weapon or a piece of
 * armor sent a sheet the server
 * refused, and the player saw only that the save failed. Save now stops, lists
 * what to fill in and opens the tab it is on, as the other editors do.
 */
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HorrorD100CharacterEditor } from '../HorrorD100CharacterEditor';
import type { CharacterData } from '../../../../types';
import { horrorD100Character } from './sheetFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

function open(overrides: Parameters<typeof horrorD100Character>[0] = {}) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<HorrorD100CharacterEditor character={horrorD100Character(overrides)} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
}

it('refuses a cleared profession and says so', () => {
  const onSave = open();
  fireEvent.change(screen.getByLabelText('Profession'), { target: { value: ' ' } });
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Profession is required');
});

it('refuses a weapon with no name and opens its tab', () => {
  const onSave = open({ weapons: [{ name: '', skill: 'Brawl', skillValue: 25, damage: '1d3', range: 'Short', attacks: 1 }] });
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Name this weapon, or remove it');
  expect(screen.getByLabelText('Name of weapon 1')).toBeInTheDocument();
});

it('refuses a piece of armor with no name, opens its tab and marks the box', () => {
  const onSave = open({ armor: [{ name: 'Coat' }, { name: ' ' }] });
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Name this armor, or remove it');
  expect(screen.getByLabelText('Name of armor 2')).toBeInvalid();
  expect(screen.getByLabelText('Name of armor 1')).toBeValid();
});

it('saves once the name is filled in', async () => {
  const onSave = open({ armor: [{ name: '' }] });
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  fireEvent.change(screen.getByLabelText('Name of armor 1'), { target: { value: 'Coat' } });
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).toBeNull();
});
