/**
 * A Call of Cthulhu investigator's own language follows EDU.
 *
 * Language (Own) "automatically starts as equal to the investigator's EDU",
 * like Dodge at half DEX: EDU is its base, and points put into it sit above.
 * Changing EDU in the editor left it where it was.
 */
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { COC_BLANK_SHEET, cocCharacter } from './cocFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

it('moves the base with EDU and keeps the points above it', async () => {
  const skills = COC_BLANK_SHEET.skills as Record<string, unknown>;
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(
    <CallOfCthulhu7eCharacterEditor
      character={cocCharacter({ skills: { ...skills, languageOwn: { baseValue: 50, currentValue: 55, improvementChecked: false, language: 'English' } } })}
      onSave={onSave}
      onCancel={vi.fn()}
    />
  );
  const edu = screen.getByText('EDU').parentElement!.querySelector('input') as HTMLInputElement;
  fireEvent.change(edu, { target: { value: '70' } });

  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  const saved = (onSave.mock.calls[0][0] as unknown as { skills: { languageOwn: { baseValue: number; currentValue: number } } }).skills;
  expect(saved.languageOwn).toMatchObject({ baseValue: 70, currentValue: 75 });
});
