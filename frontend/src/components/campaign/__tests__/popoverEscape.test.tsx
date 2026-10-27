/**
 * The roll pickers and the character menu close on Escape, and use the key
 * up: the map listens on the window, after these, and would otherwise put a
 * held token back or put its tool away on the same press.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, createEvent } from '@testing-library/react';
import { Eye } from 'lucide-react';
import CharacterRollPicker from '../CharacterRollPicker';
import NpcRollPicker from '../NpcRollPicker';
import CharacterContextMenu from '../CharacterContextMenu';
import type { Character, CharacterData, GameSystem, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const seelah = {
  id: 'char-1', userId: 'alice', campaignId: 'camp-1', gameSystem: 'DND_5E' as GameSystem, name: 'Seelah',
  data: { characterName: 'Seelah' } as unknown as CharacterData, tokenImageUrl: null, createdAt: '', updatedAt: '',
} as Character;

const goblin = {
  id: 'g', name: 'Goblin', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null,
} as Token;

/** Escape pressed with nothing focused: whether something used it up, and who closed. */
function pressEscape(): boolean {
  const event = createEvent.keyDown(document.body, { key: 'Escape' });
  fireEvent(document.body, event);
  return event.defaultPrevented;
}

describe('Escape in a picker or a menu', () => {
  it('closes the character roll picker, and nothing else hears it', () => {
    const onClose = vi.fn();
    render(<CharacterRollPicker character={seelah} onRoll={() => undefined} onClose={onClose} anchorX={0} anchorY={0} />);

    expect(pressEscape()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the creature roll picker, and nothing else hears it', () => {
    const onClose = vi.fn();
    render(<NpcRollPicker token={goblin} gameSystem="DND_5E" onRoll={() => undefined} onClose={onClose} anchorX={0} anchorY={0} />);

    expect(pressEscape()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes a character's menu, and nothing else hears it", () => {
    const onClose = vi.fn();
    render(
      <CharacterContextMenu
        x={0}
        y={0}
        onClose={onClose}
        items={[{ icon: Eye, label: 'View Character Sheet', onClick: () => undefined, visible: true }]}
      />
    );

    expect(pressEscape()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves any other key alone', () => {
    render(<NpcRollPicker token={goblin} gameSystem="DND_5E" onRoll={() => undefined} onClose={() => undefined} anchorX={0} anchorY={0} />);

    const event = createEvent.keyDown(document.body, { key: 'ArrowUp' });
    fireEvent(document.body, event);
    expect(event.defaultPrevented).toBe(false);
  });
});
