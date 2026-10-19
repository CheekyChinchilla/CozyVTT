/**
 * The D&D 5e editor says which stored numbers it brought within range.
 *
 * A sheet stored before the limits, or by a program, can hold more than 20
 * spell slots of a level or a bonus outside -30 to +30. The editor opens it
 * with those numbers brought within range, so it can be saved, and the next
 * save stores them so. Nothing said so.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import { dnd5eCharacter } from './dnd5eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const slots = (overrides: Record<string, { total: number; expended: number }>) => ({
  ...Object.fromEntries(['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((l) => [l, { total: 0, expended: 0 }])),
  ...overrides,
});

function open(overrides: Record<string, unknown>) {
  render(<DnD5eCharacterEditor character={dnd5eCharacter(overrides)} onSave={vi.fn()} onCancel={vi.fn()} />);
}

const notice = () => screen.queryByText(/were outside what a sheet can store/);

describe('opening a sheet with numbers out of range', () => {
  it('names each one, with what it was and what it is now', () => {
    open({
      initiativeBonus: 45,
      passivePerceptionBonus: -40,
      spellcasting: { ability: 'Wisdom', slots: slots({ '3': { total: 24, expended: 2 } }), spellSaveDCOtherBonus: 0, spellAttackOtherBonus: 31 },
    });

    expect(notice()).toHaveTextContent(
      'Some numbers were outside what a sheet can store and now show within it: level 3 spell slots (24 to 20), initiative other bonus (45 to 30), passive Perception other bonus (-40 to -30), spell attack other bonus (31 to 30). Saving keeps the new values.'
    );
  });

  it('names an older sheet\'s total whose implied bonus is out of range', () => {
    // Initiative stored as a total, before the other bonus existed: Dexterity
    // 10 leaves +99 to read back as the bonus.
    open({ initiative: 99, initiativeBonus: undefined });

    expect(notice()).toHaveTextContent('initiative other bonus (99 to 30)');
  });

  it('says nothing about a sheet within range', () => {
    open({ initiativeBonus: 30, spellcasting: { ability: 'Wisdom', slots: slots({ '9': { total: 20, expended: 0 } }) } });

    expect(notice()).toBeNull();
  });
});
