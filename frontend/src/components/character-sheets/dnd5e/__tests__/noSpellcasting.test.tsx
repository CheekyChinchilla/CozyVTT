/**
 * A D&D 5e sheet stored with no spellcasting block can be saved.
 *
 * The editor gives such a sheet an empty block to edit, and that block's slots
 * had none of the nine levels the server requires, so every save was refused.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import type { Character, CharacterData } from '../../../../types';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const ability = { score: 10, modifier: 0 };

const character = {
  id: 'char-1',
  userId: 'user-1',
  name: 'Aldra',
  gameSystem: 'DND_5E',
  campaignId: null,
  tokenImageUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  data: {
    characterName: 'Aldra',
    class: 'Fighter',
    level: 1,
    race: 'Human',
    proficiencyBonus: 2,
    stats: {
      strength: ability, dexterity: ability, constitution: ability,
      intelligence: ability, wisdom: ability, charisma: ability,
    },
    hp: { maximum: 12, current: 12, temporary: 0 },
  },
} as unknown as Character;

describe('a sheet with no spellcasting', () => {
  it('saves all nine slot levels', async () => {
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    render(<DnD5eCharacterEditor character={character} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const slots = (onSave.mock.calls[0][0] as unknown as { spellcasting: { slots: Record<string, unknown> } })
      .spellcasting.slots;
    expect(Object.keys(slots)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(slots['9']).toEqual({ total: 0, expended: 0 });
  });
});
