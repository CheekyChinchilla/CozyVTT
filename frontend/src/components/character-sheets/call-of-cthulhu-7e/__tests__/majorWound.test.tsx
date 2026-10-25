/**
 * The Call of Cthulhu major wound threshold rounds up.
 *
 * A major wound is damage "equal to or greater than half of the character's
 * maximum hit points in a single attack". The editor halved and rounded down,
 * so at 13 hit points it marked 6 as the threshold, where a 6 is under half.
 */
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { COC_BLANK_SHEET, cocCharacter } from './cocFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

it('saves half the maximum hit points, rounded up', async () => {
  const characteristics = COC_BLANK_SHEET.characteristics as Record<string, unknown>;
  // CON 65 and SIZ 65: 13 hit points.
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(
    <CallOfCthulhu7eCharacterEditor
      character={cocCharacter({
        characteristics: { ...characteristics, CON: { regular: 65, half: 32, fifth: 13 }, SIZ: { regular: 65, half: 32, fifth: 13 } },
      })}
      onSave={onSave}
      onCancel={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  const saved = onSave.mock.calls[0][0] as unknown as { derivedStats: { hp: { maximum: number; majorWoundThreshold: number } } };
  expect(saved.derivedStats.hp).toMatchObject({ maximum: 13, majorWoundThreshold: 7 });
});
