/**
 * Passive Perception on the 5E sheet
 *
 * The reported bug: give a character expertise in Perception, save, and the
 * view showed the right Perception bonus but the wrong passive score. The two
 * were computed from different places — the skill bonus was derived, while the
 * passive score was read from a stored `passivePerception` field that nothing
 * ever recalculated. So the stored number stayed at whatever it was first
 * given, counting proficiency once instead of twice.
 *
 * These render the real view against data shaped like a character saved before
 * the fix: a correct Perception bonus alongside a stale passive score. The view
 * must show the derived value, not the stored one.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FifthEditionCharacterView } from '../FifthEditionCharacterView';
import type { Character } from '../../../../types';

/** The 18 skills, all unproficient, so a test can override just the ones it cares about. */
function blankSkills(): Record<string, { proficient: boolean; expertise: boolean; bonus: number }> {
  const keys = [
    'acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception', 'history',
    'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception',
    'performance', 'persuasion', 'religion', 'sleightOfHand', 'stealth', 'survival',
  ];
  return Object.fromEntries(
    keys.map((k) => [k, { proficient: false, expertise: false, bonus: 0 }])
  );
}

function characterWith(
  perception: { proficient: boolean; expertise: boolean; bonus: number },
  storedPassivePerception: number | undefined,
  passivePerceptionBonus?: number
): Character {
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'Test Character',
    gameSystem: 'FIFTH_EDITION',
    data: {
      characterName: 'Test Character',
      playerName: 'Tester',
      class: 'Rogue',
      level: 1,
      proficiencyBonus: 2,
      stats: {
        strength: { score: 10, modifier: 0 },
        dexterity: { score: 20, modifier: 5 },
        constitution: { score: 14, modifier: 2 },
        intelligence: { score: 17, modifier: 3 },
        wisdom: { score: 12, modifier: 1 },
        charisma: { score: 8, modifier: -1 },
      },
      skills: { ...blankSkills(), perception },
      passivePerception: storedPassivePerception,
      ...(passivePerceptionBonus === undefined ? {} : { passivePerceptionBonus }),
    },
  } as unknown as Character;
}

/** The number rendered in the "Passive Perception" row. */
function renderedPassivePerception(): number {
  const label = screen.getByText('Passive Perception');
  const row = label.parentElement!;
  const value = row.querySelector('span:last-child')!.textContent!.trim();
  return Number(value);
}

describe('5E passive Perception in the character view', () => {
  // Wisdom 12 (+1), proficiency +2, expertise => Perception +5 => passive 15.
  // This is the case from the bug report, which rendered 13.
  it('counts expertise, ignoring a stale stored value', () => {
    render(
      <FifthEditionCharacterView
        character={characterWith({ proficient: true, expertise: true, bonus: 5 }, 13)}
      />
    );
    expect(renderedPassivePerception()).toBe(15);
  });

  it('counts plain proficiency', () => {
    render(
      <FifthEditionCharacterView
        character={characterWith({ proficient: true, expertise: false, bonus: 3 }, 99)}
      />
    );
    expect(renderedPassivePerception()).toBe(13);
  });

  it('handles no proficiency at all', () => {
    render(
      <FifthEditionCharacterView
        character={characterWith({ proficient: false, expertise: false, bonus: 1 }, 99)}
      />
    );
    expect(renderedPassivePerception()).toBe(11);
  });

  // A character saved before the passive field existed at all.
  it('still renders when the stored field is missing', () => {
    render(
      <FifthEditionCharacterView
        character={characterWith({ proficient: true, expertise: true, bonus: 5 }, undefined)}
      />
    );
    expect(renderedPassivePerception()).toBe(15);
  });

  // Deriving the score from the skill alone would drop everything that raises a
  // passive score without touching the skill, a feat's +5 most of all.
  it('adds the other-bonus field on top of the skill', () => {
    render(
      <FifthEditionCharacterView
        character={characterWith({ proficient: true, expertise: false, bonus: 3 }, 13, 5)}
      />
    );
    expect(renderedPassivePerception()).toBe(18);   // 10 + 3 + 5 (a feat)
  });

  it('handles a negative other bonus', () => {
    render(
      <FifthEditionCharacterView
        character={characterWith({ proficient: false, expertise: false, bonus: 1 }, 11, -2)}
      />
    );
    expect(renderedPassivePerception()).toBe(9);
  });

  // The property that makes the two sheets agree: whatever Perception reads,
  // the passive score is exactly ten more.
  it('is always ten more than the Perception bonus on show', () => {
    for (const bonus of [-1, 0, 3, 5, 11]) {
      const { unmount } = render(
        <FifthEditionCharacterView
          character={characterWith({ proficient: true, expertise: false, bonus }, 13)}
        />
      );
      expect(renderedPassivePerception()).toBe(10 + bonus);
      unmount();
    }
  });
});
