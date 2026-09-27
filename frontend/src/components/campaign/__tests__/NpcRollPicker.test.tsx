/**
 * Whose name a stat-block roll goes to the dice log with.
 *
 * The log goes to the whole table, and the server takes the name the client
 * sends. So this picker is where an obscured or hidden creature must not be
 * named; the helper is tested on its own, and this pins the call sites.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NpcRollPicker from '../NpcRollPicker';
import type { NpcStatBlock, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const goblin: NpcStatBlock = {
  ac: 15,
  hpMax: 7,
  speed: '30 ft.',
  abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  skills: { stealth: 6 },
  challengeRating: '1/4',
  actions: [
    {
      name: 'Scimitar',
      description: 'Melee Weapon Attack: +4 to hit, reach 5 ft. Hit: 5 (1d6 + 2) slashing damage.',
    },
  ],
};

const token = (over: Partial<Token>): Token => ({
  id: 'g', name: 'Goblin Boss', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: 'hostile' as Token['disposition'], hp: null, showHpBar: false, notes: '', initiative: null,
  statBlock: goblin, ...over,
});

function rollScimitar(t: Token): string | undefined {
  const onRoll = vi.fn();
  render(<NpcRollPicker token={t} gameSystem="DND_5E" onRoll={onRoll} onClose={() => undefined} anchorX={0} anchorY={0} />);
  fireEvent.click(screen.getByRole('button', { name: /^Scimitar \(Attack/ }));
  expect(onRoll).toHaveBeenCalledTimes(1);
  return (onRoll.mock.calls[0] as [string, string, string | undefined])[2];
}

describe('the name a stat-block roll is filed under', () => {
  it("is the token's for an ordinary creature", () => {
    expect(rollScimitar(token({}))).toBe('Goblin Boss');
  });

  it('is Unknown creature for an obscured token', () => {
    expect(rollScimitar(token({ obscured: true }))).toBe('Unknown creature');
  });

  it('is Unknown creature for a hidden token, which players are not sent at all', () => {
    expect(rollScimitar(token({ visible: false }))).toBe('Unknown creature');
  });
});
