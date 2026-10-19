/**
 * Call of Cthulhu Sanity stays within the maximum the rules give.
 *
 * Sanity begins equal to POW, but a sheet stores no more than 99, so an
 * investigator with POW 100 and no Sanity recorded yet started at 100 and
 * could not be saved. And "current Sanity points can never increase above an
 * investigator's maximum Sanity (99 - Cthulhu Mythos skill)", but raising
 * Cthulhu Mythos left current Sanity above the new maximum.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { COC_BLANK_SHEET, cocCharacter } from './cocFixture';

const characteristics = COC_BLANK_SHEET.characteristics as Record<string, unknown>;
const derivedStats = COC_BLANK_SHEET.derivedStats as Record<string, unknown>;

function open(overrides: Record<string, unknown>) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<CallOfCthulhu7eCharacterEditor character={cocCharacter(overrides)} onSave={onSave} onCancel={vi.fn()} />);
  return async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return (onSave.mock.calls[0][0] as unknown as { derivedStats: { sanity: { starting: number; current: number; maximum: number } } }).derivedStats.sanity;
  };
}

describe('Sanity', () => {
  it('starts at 99 for POW 100', async () => {
    const { sanity: _none, ...rest } = derivedStats;
    const save = open({ characteristics: { ...characteristics, POW: { regular: 100, half: 50, fifth: 20 } }, derivedStats: rest });
    expect(await save()).toMatchObject({ starting: 99, current: 99, maximum: 99 });
  });

  it('comes down to a lowered maximum', async () => {
    const save = open({ derivedStats: { ...derivedStats, sanity: { starting: 90, current: 90, maximum: 99, formula: 'POW' } } });
    fireEvent.click(screen.getByRole('button', { name: /Backstory/ }));
    fireEvent.change(screen.getByLabelText('Cthulhu Mythos'), { target: { value: '20' } });
    expect(await save()).toMatchObject({ current: 79, maximum: 79 });
  });

  it('shows a maximum of 0 as 0', () => {
    const skills = COC_BLANK_SHEET.skills as Record<string, unknown>;
    open({ skills: { ...skills, cthulhuMythos: { baseValue: 0, currentValue: 99, improvementChecked: false } } });
    expect(screen.getByText('Max SAN:').parentElement!.textContent).toContain('Max SAN: 0');
  });
});
