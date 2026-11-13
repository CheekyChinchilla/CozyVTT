/**
 * The name, short name and description each game system is shown with. They
 * are CozyVTT's own words, written once in constants/game-systems.ts and read
 * everywhere a system is labelled.
 */
import { describe, it, expect } from 'vitest';
import { GameSystem } from '@/types';
import {
  GAME_SYSTEM_DESCRIPTIONS,
  GAME_SYSTEM_LABELS,
  GAME_SYSTEM_SHORT_LABELS,
} from '@/constants/game-systems';

describe('game system names', () => {
  it('calls the fifth edition system 5E', () => {
    expect(GAME_SYSTEM_LABELS[GameSystem.FIFTH_EDITION]).toBe('5E (SRD 5.1)');
    expect(GAME_SYSTEM_SHORT_LABELS[GameSystem.FIFTH_EDITION]).toBe('5E');
    expect(GAME_SYSTEM_DESCRIPTIONS[GameSystem.FIFTH_EDITION]).toBe(
      'Heroic fantasy with classes, levels and a d20. Compatible with fifth edition.',
    );
  });

  it('calls the three-action fantasy system Fantasy d20', () => {
    expect(GAME_SYSTEM_LABELS[GameSystem.FANTASY_D20]).toBe('Fantasy d20 (ORC)');
    expect(GAME_SYSTEM_SHORT_LABELS[GameSystem.FANTASY_D20]).toBe('ORC d20');
    expect(GAME_SYSTEM_DESCRIPTIONS[GameSystem.FANTASY_D20]).toBe(
      'Tactical fantasy with three actions a turn, proficiency ranks and four degrees of success.',
    );
  });

  it('calls the percentile horror system Horror d100', () => {
    expect(GAME_SYSTEM_LABELS[GameSystem.HORROR_D100]).toBe('Horror d100');
    expect(GAME_SYSTEM_SHORT_LABELS[GameSystem.HORROR_D100]).toBe('d100');
    expect(GAME_SYSTEM_DESCRIPTIONS[GameSystem.HORROR_D100]).toBe(
      'Investigative horror on percentile dice, with Sanity and Luck.',
    );
  });
});
