/**
 * A Pathfinder 2e sheet stored with spellcasting but no spell attack or spell
 * DC can be saved.
 *
 * The editor wrote the totals it works out into whatever was there, so a
 * block without them was saved as `{ bonus }` and `{ dc }` alone, which the
 * server refuses for lacking a rank and an item bonus. Such a block comes from
 * an import or a program.
 */
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { pf2eCharacter } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

it('saves the spell attack and spell DC whole', async () => {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(
    <Pathfinder2eCharacterEditor
      character={pf2eCharacter({ spellcasting: { tradition: 'divine', type: 'prepared', keyAttribute: 'wis' } })}
      onSave={onSave}
      onCancel={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());

  const saved = (onSave.mock.calls[0][0] as unknown as { spellcasting: Record<string, unknown> }).spellcasting;
  expect(saved.spellAttackBonus).toEqual({ proficiencyRank: 'untrained', itemBonus: 0, bonus: 0 });
  expect(saved.spellDC).toEqual({ proficiencyRank: 'untrained', itemBonus: 0, dc: 10 });
});
