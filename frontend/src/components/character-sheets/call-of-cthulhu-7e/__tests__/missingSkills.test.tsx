/**
 * A Call of Cthulhu sheet stored without its skills can be saved.
 *
 * The editor opened such a sheet with an empty skills block, which the server
 * refuses for lacking every skill, so it could never be saved. The skills
 * are now filled in with the rulebook's base values: Dodge at half DEX and
 * the investigator's own language at EDU, the rest from the skill list.
 */
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { COC_BLANK_SHEET, cocCharacter } from './cocFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

it('fills in every skill at its base', async () => {
  const characteristics = COC_BLANK_SHEET.characteristics as Record<string, unknown>;
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(
    <CallOfCthulhu7eCharacterEditor
      character={cocCharacter({
        skills: undefined,
        characteristics: { ...characteristics, DEX: { regular: 60, half: 30, fifth: 12 }, EDU: { regular: 70, half: 35, fifth: 14 } },
      })}
      onSave={onSave}
      onCancel={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());

  const skills = (onSave.mock.calls[0][0] as unknown as { skills: Record<string, { baseValue: number; currentValue: number }> }).skills;
  expect(skills.accounting).toMatchObject({ baseValue: 5, currentValue: 5 });
  expect(skills.spotHidden).toMatchObject({ baseValue: 25, currentValue: 25 });
  expect(skills.dodge).toMatchObject({ baseValue: 30, currentValue: 30 });
  expect(skills.languageOwn).toMatchObject({ baseValue: 70, currentValue: 70 });
  expect(skills.fighting).toMatchObject({ brawl: { baseValue: 25 } });
});
