/**
 * A D&D 5e sheet stored without its saving throws or skills can be saved.
 *
 * The editor opened such a sheet with an empty block, and ticking one saving
 * throw stored that one alone. The server takes all six or none, so the save
 * was refused. A sheet comes to lack the blocks from an import, the API, or a
 * version that did not write them.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { dnd5eCharacter } from './dnd5eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

async function saveAfterTickingStrength(overrides: Record<string, unknown>) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<DnD5eCharacterEditor character={dnd5eCharacter(overrides)} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByLabelText('strength'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return onSave.mock.calls[0][0] as unknown as {
    savingThrows: Record<string, { proficient: boolean; bonus: number }>;
    skills: Record<string, { proficient: boolean; expertise: boolean; bonus: number }>;
  };
}

describe('a sheet stored without saving throws or skills', () => {
  it('saves all six saving throws once one is ticked', async () => {
    const saved = await saveAfterTickingStrength({ savingThrows: undefined, skills: undefined });

    expect(Object.keys(saved.savingThrows).sort()).toEqual([...ABILITIES].sort());
    expect(saved.savingThrows.strength).toEqual({ proficient: true, bonus: 2 });
    expect(saved.savingThrows.wisdom).toEqual({ proficient: false, bonus: 0 });
  });

  it('saves all eighteen skills', async () => {
    const saved = await saveAfterTickingStrength({ savingThrows: undefined, skills: undefined });

    expect(Object.keys(saved.skills)).toHaveLength(18);
    expect(saved.skills.athletics).toEqual({ proficient: false, expertise: false, bonus: 0 });
  });

  it('fills in the saving throws and skills a sheet left out of its blocks', async () => {
    const saved = await saveAfterTickingStrength({
      savingThrows: { wisdom: { proficient: true, bonus: 2 } },
      skills: { stealth: { proficient: true, expertise: true, bonus: 4 } },
    });

    expect(Object.keys(saved.savingThrows)).toHaveLength(6);
    expect(saved.savingThrows.wisdom).toEqual({ proficient: true, bonus: 2 });
    expect(Object.keys(saved.skills)).toHaveLength(18);
    expect(saved.skills.stealth).toEqual({ proficient: true, expertise: true, bonus: 4 });
  });
});
