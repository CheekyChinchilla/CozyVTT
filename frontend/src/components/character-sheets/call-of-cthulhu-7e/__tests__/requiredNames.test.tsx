/**
 * Names the server requires, cleared in the Call of Cthulhu editor.
 *
 * Clearing the occupation, the era or a weapon's name sent a sheet the server
 * refused, and the player saw only that the save failed. Save now stops, lists
 * what to fill in and opens the tab it is on, as the other editors do.
 */
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { cocCharacter } from './cocFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

function open(overrides: Record<string, unknown> = {}) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<CallOfCthulhu7eCharacterEditor character={cocCharacter(overrides)} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
}

it('refuses a cleared occupation and says so', () => {
  const onSave = open();
  fireEvent.change(screen.getByLabelText('Occupation'), { target: { value: ' ' } });
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Occupation is required');
});

it('refuses a weapon with no name and opens its tab', () => {
  const onSave = open({ combat: { weapons: [{ name: '', skill: 'Brawl', skillValue: 25, damage: '1d3', range: 'Touch', attacks: 1 }] } });
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Name this weapon, or remove it');
  expect(screen.getByLabelText('Name of weapon 1')).toBeInTheDocument();
});
