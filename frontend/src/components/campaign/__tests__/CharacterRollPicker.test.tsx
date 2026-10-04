/**
 * Whose name a roll from the picker is filed under.
 *
 * The picker holds the character, so it supplies the name a roll goes to the
 * dice log with. Opened from an obscured token, that name would put the
 * character's real name in front of the whole table, so the token's public
 * name is passed in and used instead.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CharacterRollPicker from '../CharacterRollPicker';
import type { Character, CharacterData, GameSystem } from '@/types';

const seelah: Character = {
  id: 'char-1',
  userId: 'alice',
  campaignId: 'camp-1',
  gameSystem: 'PATHFINDER_2E' as GameSystem,
  name: 'Seelah',
  data: {
    characterName: 'Seelah',
    class: 'Champion',
    level: 5,
    ancestry: 'Human',
    heritage: 'Versatile',
    attributes: {
      strength: { score: 18, modifier: 4 },
      dexterity: { score: 12, modifier: 1 },
      constitution: { score: 14, modifier: 2 },
      intelligence: { score: 10, modifier: 0 },
      wisdom: { score: 12, modifier: 1 },
      charisma: { score: 16, modifier: 3 },
    },
  } as unknown as CharacterData,
  tokenImageUrl: null,
  createdAt: '',
  updatedAt: '',
};

function rollStrength(publicName?: string) {
  const onRoll = vi.fn();
  render(
    <CharacterRollPicker
      character={seelah}
      publicName={publicName}
      onRoll={onRoll}
      onClose={() => undefined}
      anchorX={0}
      anchorY={0}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /^STR / }));
  expect(onRoll).toHaveBeenCalledTimes(1);
  return onRoll.mock.calls[0] as [string, string, string | undefined];
}

describe('the name a roll is filed under', () => {
  it("is the character's, when the picker is opened for the character", () => {
    const [expression, , name] = rollStrength();
    expect(expression).toMatch(/^1d20/);
    expect(name).toBe('Seelah');
  });

  it('is the public name when one is given, so an obscured token is not named in the dice log', () => {
    const [, , name] = rollStrength('Unknown creature');
    expect(name).toBe('Unknown creature');
  });
});
