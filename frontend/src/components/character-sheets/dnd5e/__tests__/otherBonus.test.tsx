/**
 * Skills and saving throws on the D&D 5e sheet carry an "other" bonus.
 *
 * The editor worked every skill and save out from the ability modifier and the
 * proficiency bonus and had nowhere to record anything else, so a Bard's Jack
 * of All Trades, a Paladin's Aura of Protection or a Ring of Protection could
 * not be entered. A sheet whose stored bonus already included one, from an
 * import or an older version, lost it the first time it was saved from the
 * editor: the dice and the read-only sheet use the stored number.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import { DnD5eCharacterView } from '../DnD5eCharacterView';
import type { CharacterData } from '../../../../types';
import { DND5E_SHEET, dnd5eCharacter } from './dnd5eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

type Entry = { proficient: boolean; expertise?: boolean; bonus: number; otherBonus?: number };
interface Saved {
  skills: Record<string, Entry>;
  savingThrows: Record<string, Entry>;
  passivePerception: number;
}

const skills = DND5E_SHEET.skills as Record<string, Entry>;
const saves = DND5E_SHEET.savingThrows as Record<string, Entry>;
const stats = DND5E_SHEET.stats as Record<string, { score: number; modifier: number }>;

/**
 * A level 6 Bard and Paladin rolled into one, as an import would store it:
 * DEX 12 (+1), WIS 12 (+1), CHA 16 (+3), proficiency +3. Stealth +2 counts Jack
 * of All Trades (+1); the Wisdom save +7 counts Aura of Protection (+3).
 */
const MODIFIERS: Record<string, number> = { dexterity: 1, wisdom: 1, charisma: 3 };
const SKILL_ABILITY: Record<string, string> = {
  acrobatics: 'dexterity', sleightOfHand: 'dexterity', stealth: 'dexterity',
  animalHandling: 'wisdom', insight: 'wisdom', medicine: 'wisdom', perception: 'wisdom', survival: 'wisdom',
  deception: 'charisma', intimidation: 'charisma', performance: 'charisma', persuasion: 'charisma',
};

function imported() {
  // Every other entry holds exactly what the scores give.
  const consistentSkills = Object.fromEntries(
    Object.keys(skills).map((key) => [key, { proficient: false, expertise: false, bonus: MODIFIERS[SKILL_ABILITY[key]] ?? 0 }])
  );
  const consistentSaves = Object.fromEntries(
    Object.keys(saves).map((key) => [key, { proficient: false, bonus: MODIFIERS[key] ?? 0 }])
  );
  return dnd5eCharacter({
    level: 6,
    proficiencyBonus: 3,
    stats: {
      ...stats,
      dexterity: { score: 12, modifier: 1 },
      wisdom: { score: 12, modifier: 1 },
      charisma: { score: 16, modifier: 3 },
    },
    skills: {
      ...consistentSkills,
      stealth: { proficient: false, expertise: false, bonus: 2 },
      perception: { proficient: true, expertise: false, bonus: 4 },
      persuasion: { proficient: true, expertise: false, bonus: 6 },
    },
    savingThrows: {
      ...consistentSaves,
      wisdom: { proficient: true, bonus: 7 },
      charisma: { proficient: true, bonus: 6 },
    },
    passivePerception: 14,
  });
}

function renderEditor(character = imported()) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<DnD5eCharacterEditor character={character} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
}

async function save(onSave: ReturnType<typeof renderEditor>): Promise<Saved> {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return onSave.mock.calls[0][0] as unknown as Saved;
}

describe('opening and saving a sheet whose bonuses include something else', () => {
  it('keeps every skill and save total exactly', async () => {
    const saved = await save(renderEditor());

    expect(saved.skills.stealth.bonus).toBe(2);
    expect(saved.skills.perception.bonus).toBe(4);
    expect(saved.skills.persuasion.bonus).toBe(6);
    expect(saved.savingThrows.wisdom.bonus).toBe(7);
    expect(saved.savingThrows.charisma.bonus).toBe(6);
    expect(saved.passivePerception).toBe(14);
  });

  it('records the difference as the other bonus', async () => {
    const saved = await save(renderEditor());

    expect(saved.skills.stealth.otherBonus).toBe(1);
    expect(saved.savingThrows.wisdom.otherBonus).toBe(3);
  });

  it('adds nothing to a total the maths already gives', async () => {
    const saved = await save(renderEditor());

    expect(saved.skills.perception).not.toHaveProperty('otherBonus');
    expect(saved.skills.acrobatics).not.toHaveProperty('otherBonus');
    expect(saved.savingThrows.charisma).not.toHaveProperty('otherBonus');
  });

  it('goes on adding the other bonus when an ability score changes', async () => {
    const onSave = renderEditor();
    const dex = screen.getByText('dex').parentElement!.querySelector('input') as HTMLInputElement;

    fireEvent.change(dex, { target: { value: '14' } });

    const saved = await save(onSave);
    expect(saved.skills.stealth.bonus).toBe(3);
    expect(saved.savingThrows.dexterity.bonus).toBe(2);
  });
});

describe('a stored total that does not follow from the scores', () => {
  it('is kept, with the difference shown as the other bonus', async () => {
    // Strength 16 with a proficient save stored at +0, as a program might
    // write it. The total is what this sheet has always rolled, so it is kept
    // and the -5 is there to see and correct.
    const character = dnd5eCharacter({
      stats: { ...stats, strength: { score: 16, modifier: 3 } },
      savingThrows: { ...saves, strength: { proficient: true, bonus: 0 } },
    });
    const onSave = renderEditor(character);

    expect((screen.getByLabelText('Other bonus to Strength saves') as HTMLInputElement).value).toBe('-5');
    const saved = await save(onSave);
    expect(saved.savingThrows.strength).toEqual({ proficient: true, bonus: 0, otherBonus: -5 });
  });
});

describe('the other bonus boxes', () => {
  it('add to a skill', async () => {
    const onSave = renderEditor(dnd5eCharacter());

    fireEvent.change(screen.getByLabelText('Other bonus to Athletics'), { target: { value: '2' } });

    const saved = await save(onSave);
    expect(saved.skills.athletics.otherBonus).toBe(2);
    expect(saved.skills.athletics.bonus).toBe(2);
  });

  it('add to a saving throw', async () => {
    const onSave = renderEditor(dnd5eCharacter());

    fireEvent.change(screen.getByLabelText('Other bonus to Constitution saves'), { target: { value: '1' } });

    const saved = await save(onSave);
    expect(saved.savingThrows.constitution.otherBonus).toBe(1);
    expect(saved.savingThrows.constitution.bonus).toBe(1);
  });
});

describe('the read-only sheet', () => {
  it('shows a skill with its other bonus, worked out from the scores', () => {
    const character = dnd5eCharacter({
      skills: { ...skills, athletics: { proficient: true, expertise: false, bonus: 0, otherBonus: 1 } },
    });

    render(<DnD5eCharacterView character={character} />);

    // Strength 10 and proficiency +2, plus 1: the stored 0 is out of date.
    const row = screen.getByText('Athletics').closest('div')!.parentElement!;
    expect(row.textContent).toContain('+3');
  });
});
