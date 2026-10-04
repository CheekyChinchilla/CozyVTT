/**
 * A D&D 5e sheet written before 1.3.0 keeps its proficiencies and languages
 * through a save.
 *
 * Those templates kept a flat list under `proficiencies` and the languages in
 * a list of their own. The editor built its four boxes from neither, so the
 * first save replaced the list with four empty boxes and the languages were
 * never shown.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import type { Character, CharacterData } from '../../../../types';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const ability = { score: 10, modifier: 0 };

function sheet122(): Character {
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'Brave Fighter',
    gameSystem: 'DND_5E',
    campaignId: null,
    tokenImageUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    data: {
      characterName: 'Brave Fighter',
      class: 'Fighter',
      level: 1,
      race: 'Human',
      proficiencyBonus: 2,
      stats: {
        strength: ability, dexterity: ability, constitution: ability,
        intelligence: ability, wisdom: ability, charisma: ability,
      },
      proficiencies: ['All armor', 'Simple weapons', 'Martial weapons'],
      languages: ['Common'],
    },
  } as unknown as Character;
}

describe('a sheet written before 1.3.0', () => {
  it('saves its proficiencies and languages in the four boxes', async () => {
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    render(<DnD5eCharacterEditor character={sheet122()} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0] as unknown as Record<string, unknown>;

    expect(saved.proficiencies).toEqual({
      armor: 'All armor',
      weapons: 'Simple weapons, Martial weapons',
      tools: '',
      languages: 'Common',
    });
    expect(saved.proficienciesAndLanguages).toEqual(['All armor', 'Simple weapons', 'Martial weapons', 'Common']);
    expect(saved).not.toHaveProperty('languages');
  });
});
