/**
 * A Pathfinder 2e sheet made from a built-in template keeps its numbers.
 *
 * The templates stored skill and lore attributes abbreviated ("str", "int")
 * and spellcasting as "Arcane", "Prepared" and "int", while the editor looks
 * them up by full lower-case name. Opening such a sheet recomputed every skill
 * without its attribute modifier and the next save stored that: the Level 1
 * Fighter's Athletics +6 became +3. Sheets made that way have to recover when
 * they are next opened.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { PF2E_BLANK_SHEET, pf2eCharacter } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

type Skill = { attribute: string; proficiencyRank: string; armorPenalty: number; itemBonus: number; bonus: number };
interface Saved {
  skills: Record<string, Skill>;
  loreSkills: Skill[];
  classDC: { keyAttribute: string; total: number };
  spellcasting: {
    tradition: string;
    type: string;
    keyAttribute: string;
    spellAttackBonus: { bonus: number };
    spells: { prepared: boolean }[];
  };
}

const skill = (attribute: string, proficiencyRank: string, bonus: number): Skill =>
  ({ attribute, proficiencyRank, armorPenalty: 0, itemBonus: 0, bonus });

/** The Level 1 Fighter as the 1.5.0 template stored it. */
function fighterAsStored() {
  const blankSkills = PF2E_BLANK_SHEET.skills as Record<string, Skill>;
  return pf2eCharacter({
    attributes: {
      strength: { score: 16, modifier: 3 },
      dexterity: { score: 12, modifier: 1 },
      constitution: { score: 14, modifier: 2 },
      intelligence: { score: 18, modifier: 4 },
      wisdom: { score: 12, modifier: 1 },
      charisma: { score: 8, modifier: -1 },
    },
    skills: {
      ...blankSkills,
      athletics: skill('str', 'trained', 6),
      stealth: skill('dex', 'trained', 4),
      arcana: skill('int', 'untrained', 4),
    },
    loreSkills: [{ name: 'Warfare Lore', ...skill('int', 'trained', 7) }],
    classDC: { total: 16, keyAttribute: 'str', proficiencyRank: 'trained' },
    spellcasting: {
      ...(PF2E_BLANK_SHEET.spellcasting as Record<string, unknown>),
      spellAttackBonus: { proficiencyRank: 'trained', itemBonus: 0, bonus: 7 },
    },
  });
}

async function openAndSave(edit?: () => void): Promise<Saved> {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<Pathfinder2eCharacterEditor character={fighterAsStored()} onSave={onSave} onCancel={vi.fn()} />);
  edit?.();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return onSave.mock.calls[0][0] as unknown as Saved;
}

describe('a sheet made from a built-in Pathfinder 2e template', () => {
  it('keeps its skill and lore totals when opened and saved', async () => {
    const saved = await openAndSave();

    expect(saved.skills.athletics.bonus).toBe(6);
    expect(saved.skills.stealth.bonus).toBe(4);
    expect(saved.skills.arcana.bonus).toBe(4);
    expect(saved.loreSkills[0].bonus).toBe(7);
  });

  it('is saved with the attribute names the editor offers', async () => {
    const saved = await openAndSave();

    expect(saved.skills.athletics.attribute).toBe('strength');
    expect(saved.skills.stealth.attribute).toBe('dexterity');
    expect(saved.loreSkills[0].attribute).toBe('intelligence');
    expect(saved.classDC.keyAttribute).toBe('strength');
    expect(saved.spellcasting.keyAttribute).toBe('intelligence');
    expect(saved.spellcasting.tradition).toBe('arcane');
    expect(saved.spellcasting.type).toBe('prepared');
  });

  it('counts the key attribute in the spell attack', async () => {
    const saved = await openAndSave();

    // Trained at level 1 is +3, and Intelligence 18 is +4.
    expect(saved.spellcasting.spellAttackBonus.bonus).toBe(7);
  });

  it('adds a spell to a prepared caster already prepared', async () => {
    const saved = await openAndSave(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Spells' }));
      fireEvent.click(screen.getByRole('button', { name: 'Add Spell' }));
    });

    expect(saved.spellcasting.spells).toHaveLength(1);
    expect(saved.spellcasting.spells[0].prepared).toBe(true);
  });
});
