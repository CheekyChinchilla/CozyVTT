/**
 * The Pathfinder 2e editor and read-only sheet agree on what a character has.
 *
 * The sheet wrote a Dex Cap of -1 as "+-1" and a land Speed of 0 as 30 ft.,
 * ran the paragraphs of personality, backstory, allies and notes together,
 * and showed an innate spell's notes that the editor had no box for. A
 * strike's proficiency rank did nothing: the editor now shows what the rank,
 * attribute and item bonus give beside the attack bonus typed.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Pathfinder2eCharacterView } from '../Pathfinder2eCharacterView';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { PF2E_BLANK_SHEET, pf2eCharacter } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const armorClass = PF2E_BLANK_SHEET.armorClass as Record<string, unknown>;
const spellcasting = PF2E_BLANK_SHEET.spellcasting as Record<string, unknown>;
const attributes = PF2E_BLANK_SHEET.attributes as Record<string, unknown>;

describe('the read-only sheet', () => {
  it('writes a Dex Cap below 0 with one sign', () => {
    render(<Pathfinder2eCharacterView character={pf2eCharacter({ armorClass: { ...armorClass, capDex: -1 } })} />);
    expect(screen.getByText('DEX Cap: -1')).toBeInTheDocument();
  });

  it('shows a land Speed of 0 as 0', () => {
    render(<Pathfinder2eCharacterView character={pf2eCharacter({ speed: { land: 0, other: [] } })} />);
    expect(screen.getByText('0 ft.')).toBeInTheDocument();
  });

  it('keeps the line breaks in what a player wrote', () => {
    render(
      <Pathfinder2eCharacterView
        character={pf2eCharacter({
          backstory: 'Born in Absalom.\nLeft at sixteen.',
          personality: { traits: 'Quiet.\nWatchful.' },
          alliesAndOrganizations: { name: 'Pathfinder Society', description: 'Joined last year.\nStill a novice.' },
          notes: 'Owes Ghorus 10 gp.\nAvoid the docks.',
        })}
      />
    );
    for (const text of ['Born in Absalom.', 'Quiet.', 'Joined last year.', 'Owes Ghorus 10 gp.']) {
      expect(screen.getByText(text, { exact: false })).toHaveClass('whitespace-pre-wrap');
    }
  });
});

describe('the editor', () => {
  it('edits an innate spell\'s notes', async () => {
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    render(
      <Pathfinder2eCharacterEditor
        character={pf2eCharacter({ spellcasting: { ...spellcasting, innateSpells: [{ name: 'Detect Magic', frequency: 'at will', notes: 'Elf ancestry' }] } })}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Spells/ }));
    const notes = screen.getByLabelText('Notes for innate spell 1');
    expect(notes).toHaveValue('Elf ancestry');
    fireEvent.change(notes, { target: { value: 'Elf ancestry, arcane' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0] as unknown as { spellcasting: { innateSpells: { notes: string }[] } };
    expect(saved.spellcasting.innateSpells[0].notes).toBe('Elf ancestry, arcane');
  });

  it('shows what a strike\'s rank, attribute and item bonus give beside the bonus typed', () => {
    render(
      <Pathfinder2eCharacterEditor
        character={pf2eCharacter({
          level: 1,
          attributes: { ...attributes, strength: { score: 16, modifier: 3 } },
          strikes: [{ name: 'Longsword', type: 'melee', attackBonus: 7, damageRoll: '1d8', damageType: 'slashing', attributeModifier: 'strength', proficiencyRank: 'trained', itemBonus: 1, traits: [], range: null }],
        })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Combat/ }));
    // Strength +3, trained +3, item +1.
    expect(screen.getByText('Rank, attribute and item give +7')).toBeInTheDocument();
  });
});
