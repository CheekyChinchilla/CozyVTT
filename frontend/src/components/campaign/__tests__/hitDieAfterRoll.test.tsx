/**
 * A hit die is spent only when its roll is made.
 *
 * Spending a hit die sends the roll, then the decrement. The decrement went
 * out whatever happened to the roll, so a roll refused for too many rolls,
 * or lost with the connection, still took the die away. The roll's answer now
 * comes first.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CharacterRollPicker from '../CharacterRollPicker';
import type { Character, CharacterData, GameSystem } from '@/types';

const brann: Character = {
  id: 'char-2',
  userId: 'bob',
  campaignId: 'camp-1',
  gameSystem: 'DND_5E' as GameSystem,
  name: 'Brann',
  data: {
    characterName: 'Brann',
    stats: {
      strength: { score: 16, modifier: 3 }, dexterity: { score: 12, modifier: 1 }, constitution: { score: 14, modifier: 2 },
      intelligence: { score: 10, modifier: 0 }, wisdom: { score: 10, modifier: 0 }, charisma: { score: 8, modifier: -1 },
    },
    hitDice: [{ class: 'Fighter', die: '1d10', total: '5d10', remaining: 3 }],
  } as unknown as CharacterData,
  tokenImageUrl: null,
  createdAt: '',
  updatedAt: '',
};

async function spendWith(made: boolean) {
  const onSpendHitDie = vi.fn();
  const onRoll = vi.fn().mockResolvedValue(made);
  render(
    <CharacterRollPicker character={brann} onRoll={onRoll} onSpendHitDie={onSpendHitDie} onClose={() => undefined} anchorX={0} anchorY={0} />
  );
  fireEvent.click(screen.getByRole('button', { name: /Fighter 1d10/ }));
  expect(onRoll).toHaveBeenCalledWith('1d10+2', 'Spend a Hit Die (Fighter)', 'Brann');
  await waitFor(() => expect(onRoll.mock.results[0]?.value).toBeDefined());
  await Promise.resolve();
  return onSpendHitDie;
}

it('spends the hit die once its roll is made', async () => {
  const onSpendHitDie = await spendWith(true);
  await waitFor(() => expect(onSpendHitDie).toHaveBeenCalledWith(0));
});

it('keeps the hit die when its roll is refused', async () => {
  const onSpendHitDie = await spendWith(false);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(onSpendHitDie).not.toHaveBeenCalled();
});

describe('on the D&D 5e sheet', () => {
  async function clickHitDie(made: boolean) {
    const { DnD5eCharacterView } = await import('@/components/character-sheets/dnd5e/DnD5eCharacterView');
    const onSpendHitDie = vi.fn();
    const onRoll = vi.fn().mockResolvedValue(made);
    render(<DnD5eCharacterView character={brann} onRoll={onRoll} onSpendHitDie={onSpendHitDie} />);
    fireEvent.click(screen.getByRole('button', { name: /Combat/ }));
    fireEvent.click(screen.getByTitle('Spend one hit die: roll 1d10+2'));
    expect(onRoll).toHaveBeenCalledWith('1d10+2', 'Spend a Hit Die (Fighter)');
    await new Promise((resolve) => setTimeout(resolve, 20));
    return onSpendHitDie;
  }

  it('spends the hit die once its roll is made', async () => {
    expect(await clickHitDie(true)).toHaveBeenCalledWith(0);
  });

  it('keeps the hit die when its roll is refused', async () => {
    expect(await clickHitDie(false)).not.toHaveBeenCalled();
  });
});
