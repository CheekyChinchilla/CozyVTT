import { describe, it, expect } from 'vitest';
import { maskObscuredToken } from '../tokenMask';

/**
 * What a player who does not control an obscured token is sent of it: a
 * shape in the right place and the flag, nothing that says who or what.
 */
describe('maskObscuredToken', () => {
  const token = {
    id: 't1', name: 'Goblin Boss', imageUrl: '/api/assets/tokens/boss.png',
    position: { x: 3, y: 4 }, size: { width: 2, height: 2 }, layer: 'token' as const, visible: true,
    controlledBy: null, rotation: 90, conditions: ['prone'], metadata: { fromLibrary: 'x' },
    characterId: 'char-1', type: 'npc' as const, disposition: 'hostile' as const,
    hp: { current: 5, max: 9, temp: 0 }, showHpBar: true, initiative: 14, creatureTemplateId: 'tmpl-1', obscured: true,
  };

  it('blanks everything that says who or what it is', () => {
    const sent = maskObscuredToken(token);
    expect(sent.name).toBe('');
    expect(sent.imageUrl).toBe('');
    expect(sent.conditions).toEqual([]);
    expect(sent.metadata).toEqual({});
    expect(sent.characterId).toBeNull();
    expect(sent.disposition).toBeNull();
    expect(sent.hp).toBeNull();
    expect(sent.showHpBar).toBe(false);
    expect(sent.creatureTemplateId).toBeNull();
  });

  it('keeps where and how big it is, and says that it is obscured', () => {
    const sent = maskObscuredToken(token);
    expect(sent.id).toBe('t1');
    expect(sent.position).toEqual({ x: 3, y: 4 });
    expect(sent.size).toEqual({ width: 2, height: 2 });
    expect(sent.layer).toBe('token');
    expect(sent.visible).toBe(true);
    expect(sent.rotation).toBe(90);
    expect(sent.initiative).toBe(14);
    expect(sent.obscured).toBe(true);
  });

  it('leaves the stored token untouched', () => {
    const before = JSON.stringify(token);
    maskObscuredToken(token);
    expect(JSON.stringify(token)).toBe(before);
  });
});
