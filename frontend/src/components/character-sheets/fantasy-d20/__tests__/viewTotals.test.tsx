/**
 * The Fantasy d20 read-only sheet works saves, Perception and skills out
 * from their parts.
 *
 * It printed the totals last stored, so a character the editor had not saved
 * since (one made from a template or imported, or one whose check penalty was
 * stored with the old sign) showed, and rolled, numbers its own parts do not
 * give. AC, Class DC and initiative were already worked out this way.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FantasyD20CharacterView } from '../FantasyD20CharacterView';
import { FANTASY_D20_BLANK_SHEET, fantasyD20Character } from './fantasyD20Fixture';

const skills = FANTASY_D20_BLANK_SHEET.skills as Record<string, Record<string, unknown>>;

/** Level 1, Wisdom 16 (+3), Strength 14 (+2); every stored total left at 0. */
const character = () =>
  fantasyD20Character({
    attributes: {
      ...(FANTASY_D20_BLANK_SHEET.attributes as Record<string, unknown>),
      wisdom: { score: 16, modifier: 3 },
      strength: { score: 14, modifier: 2 },
    },
    savingThrows: {
      fortitude: { proficiencyRank: 'untrained', itemBonus: 0, bonus: 0 },
      reflex: { proficiencyRank: 'untrained', itemBonus: 0, bonus: 0 },
      will: { proficiencyRank: 'expert', itemBonus: 0, bonus: 0 },
    },
    perception: { proficiencyRank: 'trained', itemBonus: 1, bonus: 0, senses: [] },
    skills: { ...skills, athletics: { ...skills.athletics, proficiencyRank: 'trained', armorPenalty: 1, bonus: 0 } },
  });

const total = (label: string, selector: string) =>
  (screen.getAllByText(label).map((el) => el.closest(selector)).find(Boolean) as HTMLElement).textContent;

describe('the read-only sheet', () => {
  it('works out a save', () => {
    render(<FantasyD20CharacterView character={character()} />);
    // Wisdom +3, level 1 expert +5.
    expect(total('will', 'div.bg-paper')).toContain('+8');
  });

  it('works out Perception', () => {
    render(<FantasyD20CharacterView character={character()} />);
    // Wisdom +3, trained +3, item +1.
    expect(total('Perception', 'div.bg-ink\\/5')).toContain('+7');
  });

  it('works out a skill, its check penalty taken off', () => {
    render(<FantasyD20CharacterView character={character()} />);
    // Strength +2, trained +3, check penalty -1.
    expect(total('Athletics', 'div.bg-paper')).toContain('+4');
  });
});
