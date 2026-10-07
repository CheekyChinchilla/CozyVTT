/**
 * The D&D 5e editor works on its own copy of the sheet.
 *
 * Its form shared the inner objects of the character it was handed, and the
 * effects that recompute modifiers, saving throws and skill bonuses wrote into
 * them. Opening the editor therefore changed the character the page, the
 * sheet behind it and the Characters page's list were holding, before
 * anything was saved: cancel, and they showed numbers the server did not have.
 *
 * Saving parsed the Cantrips box into the same shared spellcasting block, so a
 * sheet whose cantrips had been typed into still counted as changed once the
 * save had gone through.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { dnd5eCharacter } from './dnd5eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

describe('opening the D&D 5e editor', () => {
  it('leaves the character it was handed as it was', () => {
    // Imported with a modifier, a save and a skill bonus that do not match
    // Strength 16, so the editor has something to correct.
    const character = dnd5eCharacter();
    const data = character.data as unknown as {
      stats: Record<string, { score: number; modifier: number }>;
    };
    data.stats.strength = { score: 16, modifier: 0 };
    const before = JSON.parse(JSON.stringify(character.data));

    render(<DnD5eCharacterEditor character={character} onSave={vi.fn()} onCancel={vi.fn()} />);

    // The editor itself shows the corrected modifier...
    expect(screen.getAllByText('+3').length).toBeGreaterThan(0);
    // ...without having written it into the character.
    expect(character.data).toEqual(before);
  });

  it('still saves the numbers it worked out from the scores', async () => {
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    const character = dnd5eCharacter();
    const data = character.data as unknown as {
      stats: Record<string, { score: number; modifier: number }>;
      savingThrows: Record<string, { proficient: boolean; bonus: number }>;
      skills: Record<string, { proficient: boolean; expertise: boolean; bonus: number }>;
    };
    data.stats.strength = { score: 16, modifier: 0 };
    data.savingThrows.strength = { proficient: true, bonus: 0 };
    data.skills.perception = { proficient: false, expertise: true, bonus: 0 };
    render(<DnD5eCharacterEditor character={character} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const saved = onSave.mock.calls[0][0] as unknown as typeof data & { passivePerception: number };
    expect(saved.stats.strength.modifier).toBe(3);
    expect(saved.savingThrows.strength.bonus).toBe(5);
    expect(saved.skills.athletics.bonus).toBe(3);
    expect(saved.skills.perception.bonus).toBe(4);
    expect(saved.passivePerception).toBe(14);
  });
});

describe('saving typed cantrips', () => {
  it('counts the sheet as saved once the save has gone through', async () => {
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    const onDirtyChange = vi.fn();
    const character = dnd5eCharacter({
      spellcasting: {
        ability: 'intelligence', spellSaveDC: 10, spellAttackBonus: 2, cantrips: [], spells: [],
        slots: Object.fromEntries(['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((l) => [l, { total: 0, expended: 0 }])),
      },
    });
    render(
      <DnD5eCharacterEditor character={character} onSave={onSave} onCancel={vi.fn()} onDirtyChange={onDirtyChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Spells/ }));
    fireEvent.change(screen.getByPlaceholderText(/Enter cantrips separated by commas/), {
      target: { value: 'Fire Bolt, Light' },
    });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    expect((onSave.mock.calls[0][0] as unknown as { spellcasting: { cantrips: unknown } }).spellcasting.cantrips)
      .toEqual(['Fire Bolt', 'Light']);
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });
});
