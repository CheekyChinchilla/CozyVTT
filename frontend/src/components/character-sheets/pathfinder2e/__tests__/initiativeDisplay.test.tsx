/**
 * Initiative on the Pathfinder 2e sheet.
 *
 * The reported bug: a character with Perception +6 showed **Initiative +0**,
 * captioned "perception".
 *
 * `initiative.bonus` is a stored number that nothing kept in step. The editor
 * gained an effect that recalculates it, so a character opened and saved since
 * then reads correctly — but the read-only sheet takes the stored value, so
 * every character nobody has re-saved still shows +0. Deriving in the view fixes
 * all of them, without anyone having to open and re-save a sheet first.
 *
 * Core Rulebook, "Perception for Initiative": "Often, you'll roll a Perception
 * check to determine your order in initiative." A character can nominate a
 * different stat — the book's own example has a rogue rolling Stealth — which
 * is what `usedStat` records.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pathfinder2eCharacterView } from '../Pathfinder2eCharacterView';
import type { Character } from '../../../../types';

const attribute = { score: 10, modifier: 0 };

function skill(bonus: number) {
  return { attribute: 'dex', proficiencyRank: 'trained', armorPenalty: 0, itemBonus: 0, bonus };
}

/** A sheet complete enough for the view, with the bits under test overridable. */
function characterWith(overrides: Record<string, unknown>): Character {
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'Seelah',
    gameSystem: 'PATHFINDER_2E',
    campaignId: null,
    tokenImageUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    data: {
      characterName: 'Seelah',
      ancestry: 'Dwarf',
      class: 'Fighter',
      level: 1,
      attributes: {
        strength: { score: 16, modifier: 3 },
        dexterity: { score: 12, modifier: 1 },
        constitution: { score: 14, modifier: 2 },
        intelligence: attribute,
        wisdom: { score: 12, modifier: 1 },
        charisma: { score: 8, modifier: -1 },
      },
      perception: { proficiencyRank: 'expert', itemBonus: 0, bonus: 6, senses: [] },
      savingThrows: {
        fortitude: { proficiencyRank: 'expert', itemBonus: 0, bonus: 7 },
        reflex: { proficiencyRank: 'expert', itemBonus: 0, bonus: 6 },
        will: { proficiencyRank: 'trained', itemBonus: 0, bonus: 4 },
      },
      skills: { stealth: skill(4), athletics: skill(6) },
      hp: { maximum: 21, current: 21, temporary: 0, ancestryHp: 10, classHpPerLevel: 10, resistances: [], immunities: [], weaknesses: [] },
      armorClass: { proficiencyRank: 'trained', itemBonus: 3, capDex: 2, armorPenalty: 0, total: 17 },
      classDC: { proficiencyRank: 'trained', keyAttribute: 'str', total: 16 },
      speed: { land: 20, other: [] },
      ...overrides,
    },
  } as unknown as Character;
}

/** The big number in the Initiative panel. */
function shownInitiative(): string {
  const heading = screen.getByText('Initiative');
  const panel = heading.closest('div')?.parentElement as HTMLElement;
  const value = [...panel.querySelectorAll('span')]
    .map((el) => el.textContent?.trim() ?? '')
    .find((text) => /^[+-]\d+$/.test(text));
  return value ?? '(not found)';
}

describe('initiative on the read-only sheet', () => {
  it('shows the Perception bonus, not the stale stored number', () => {
    render(
      <Pathfinder2eCharacterView
        character={characterWith({ initiative: { usedStat: 'perception', bonus: 0 } })}
      />
    );
    expect(shownInitiative()).toBe('+6');
  });

  it('shows the Perception bonus when nothing is stored at all', () => {
    render(<Pathfinder2eCharacterView character={characterWith({ initiative: null })} />);
    expect(shownInitiative()).toBe('+6');
  });

  it('defaults to Perception when no stat is nominated', () => {
    render(<Pathfinder2eCharacterView character={characterWith({})} />);
    expect(shownInitiative()).toBe('+6');
  });

  it('uses the nominated skill instead — a rogue rolling Stealth', () => {
    render(
      <Pathfinder2eCharacterView
        character={characterWith({ initiative: { usedStat: 'stealth', bonus: 0 } })}
      />
    );
    expect(shownInitiative()).toBe('+4');
  });

  it('names the stat it used', () => {
    render(
      <Pathfinder2eCharacterView
        character={characterWith({ initiative: { usedStat: 'stealth', bonus: 0 } })}
      />
    );
    expect(screen.getByText('stealth')).toBeTruthy();
  });

  it('falls back to Perception for a stat the sheet does not have', () => {
    render(
      <Pathfinder2eCharacterView
        character={characterWith({ initiative: { usedStat: 'warfare lore', bonus: 0 } })}
      />
    );
    expect(shownInitiative()).toBe('+6');
  });
});
