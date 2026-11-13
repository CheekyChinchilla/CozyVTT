/**
 * Names the server requires, cleared in the Fantasy d20 editor.
 *
 * Clearing the ancestry, heritage or class, or the name of a strike, lore,
 * spell, item or feat, sent a sheet the server refused, and the player saw
 * only that the save failed. Save now stops, lists what to fix and opens the
 * tab it is on, as the 5E editor does.
 */
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FantasyD20CharacterEditor } from '../FantasyD20CharacterEditor';
import type { CharacterData } from '../../../../types';
import { fantasyD20Character } from './fantasyD20Fixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

function open(overrides: Record<string, unknown> = {}) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<FantasyD20CharacterEditor character={fantasyD20Character(overrides)} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
}

it('refuses a cleared ancestry and says so', () => {
  const onSave = open();
  fireEvent.change(screen.getByLabelText('Ancestry'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Ancestry is required');
});

it('refuses a strike with no name and opens its tab', () => {
  const onSave = open({ strikes: [{ name: '', type: 'melee', attackBonus: 5 }] });
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Name this strike, or remove it');
  expect(screen.getByLabelText('Name of strike 1')).toBeInTheDocument();
});
