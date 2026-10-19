/**
 * One spellcasting rank for a Pathfinder 2e spell attack and spell DC.
 *
 * The rules give a caster one proficiency for "spell attack rolls and spell
 * DCs" (Core Rulebook p. 27). The editor showed a rank selector and an item box
 * for each, but worked the DC out from the attack's rank and item bonus, so the
 * DC's own two boxes did nothing, and the read-only sheet badged the DC with a
 * rank it did not use. Now one Spellcasting proficiency sets both, and each
 * item box counts toward its own total only.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import { Pathfinder2eCharacterView } from '../Pathfinder2eCharacterView';
import type { CharacterData } from '../../../../types';
import { PF2E_BLANK_SHEET, pf2eCharacter } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const attributes = PF2E_BLANK_SHEET.attributes as Record<string, { score: number; modifier: number }>;
const spellcasting = PF2E_BLANK_SHEET.spellcasting as Record<string, unknown>;

/** A level 3 wizard, Intelligence 18 (+4), expert in spell attacks. */
function wizard(attack: Record<string, unknown>, dc: Record<string, unknown>) {
  return pf2eCharacter({
    level: 3,
    attributes: { ...attributes, intelligence: { score: 18, modifier: 4 } },
    spellcasting: { ...spellcasting, spellAttackBonus: { bonus: 0, ...attack }, spellDC: { dc: 10, ...dc } },
  });
}

interface Saved {
  spellcasting: {
    spellAttackBonus: { proficiencyRank: string; itemBonus: number; bonus: number };
    spellDC: { proficiencyRank: string; itemBonus: number; dc: number };
  };
}

function open(character: ReturnType<typeof wizard>) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<Pathfinder2eCharacterEditor character={character} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Spells/ }));
  return async (): Promise<Saved> => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return onSave.mock.calls[0][0] as unknown as Saved;
  };
}

describe('the editor', () => {
  it('works the DC out from the spellcasting rank, and records that rank on it', async () => {
    const save = open(wizard({ proficiencyRank: 'expert', itemBonus: 0 }, { proficiencyRank: 'trained', itemBonus: 0 }));

    const saved = (await save()).spellcasting;
    // 3 + 4 expert, + 4 Intelligence.
    expect(saved.spellAttackBonus.bonus).toBe(11);
    expect(saved.spellDC).toMatchObject({ dc: 21, proficiencyRank: 'expert' });
  });

  it('counts each item box toward its own total', async () => {
    const save = open(wizard({ proficiencyRank: 'trained', itemBonus: 1 }, { proficiencyRank: 'trained', itemBonus: 2 }));

    const saved = (await save()).spellcasting;
    expect(saved.spellAttackBonus.bonus).toBe(4 + 5 + 1);
    expect(saved.spellDC.dc).toBe(10 + 4 + 5 + 2);
  });

  it('offers one rank, which sets both', async () => {
    const save = open(wizard({ proficiencyRank: 'trained', itemBonus: 0 }, { proficiencyRank: 'trained', itemBonus: 0 }));
    fireEvent.change(screen.getByLabelText('Spellcasting proficiency'), { target: { value: 'master' } });

    const saved = (await save()).spellcasting;
    expect(saved.spellAttackBonus.proficiencyRank).toBe('master');
    expect(saved.spellDC).toMatchObject({ proficiencyRank: 'master', dc: 10 + 4 + 9 });
  });
});

describe('the read-only sheet', () => {
  it('shows the DC worked out with the spellcasting rank', () => {
    render(<Pathfinder2eCharacterView character={wizard({ proficiencyRank: 'expert', itemBonus: 0 }, { proficiencyRank: 'trained', itemBonus: 0, dc: 15 })} />);
    const dc = screen.getByText('Spell DC').closest('div.bg-paper') as HTMLElement;
    expect(dc.textContent).toContain('21');
  });
});

describe('opening a sheet whose DC followed the old rule', () => {
  const note = () => screen.queryByText(/changed to follow the rules as it opened/);

  it('names the DC rank and the DC that change', () => {
    open(wizard({ proficiencyRank: 'expert', itemBonus: 1 }, { proficiencyRank: 'trained', itemBonus: 0, dc: 22 }));
    expect(note()).toHaveTextContent(
      'Some numbers on this sheet changed to follow the rules as it opened: spell DC rank (trained to expert), spell DC (22 to 21). Saving keeps the new values.'
    );
  });

  it('says nothing when the sheet already agrees', () => {
    open(wizard({ proficiencyRank: 'expert', itemBonus: 0 }, { proficiencyRank: 'expert', itemBonus: 0, dc: 21 }));
    expect(note()).toBeNull();
  });
});

describe('the note, on a sheet whose stored modifier is out of date', () => {
  it('works the DC out from the score, as the editor does', () => {
    // Intelligence 18 stored with modifier 3; the editor makes it +4, and the
    // stored DC 21 is right for that.
    render(
      <Pathfinder2eCharacterEditor
        character={pf2eCharacter({
          level: 3,
          attributes: { ...attributes, intelligence: { score: 18, modifier: 3 } },
          spellcasting: { ...spellcasting, spellAttackBonus: { proficiencyRank: 'expert', itemBonus: 0, bonus: 11 }, spellDC: { proficiencyRank: 'expert', itemBonus: 0, dc: 21 } },
        })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByText(/changed to follow the rules as it opened/)).toBeNull();
  });
});
