import { describe, it, expect } from 'vitest';
import { MASKED_TOKEN_FIELDS, maskObscuredToken, tokenSentTo, type MaskedField } from '../tokenMask';
import type { Token } from '@/types';

/**
 * What a player who does not control an obscured token is sent of it: a
 * shape in the right place and the flag, nothing that says who or what.
 */
describe('maskObscuredToken', () => {
  const token = {
    id: 't1', name: 'Disguised Rogue', imageUrl: '/api/assets/tokens/rogue.png',
    position: { x: 3, y: 4 }, size: { width: 2, height: 2 }, layer: 'token' as const, visible: true,
    controlledBy: 'user-a', rotation: 90, conditions: ['prone'], metadata: { fromLibrary: 'x' },
    characterId: 'char-1', type: 'player' as const, disposition: 'friendly' as const,
    hp: { current: 5, max: 9, temp: 0 }, showHpBar: true, initiative: 14, creatureTemplateId: 'tmpl-1',
    displayMode: 'full-art' as const, obscured: true,
    // A field tokens do not have today, standing in for one added later.
    description: 'the party thief in a guard uniform',
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

  it('blanks who controls it, what kind of token it is, its facing and its initiative', () => {
    // The roster maps a controller's id to a name; a player-type token is
    // somebody's character; a top-down token's facing is its own tell.
    const sent = maskObscuredToken(token);
    expect(sent.controlledBy).toBeNull();
    expect(sent.type).toBe('npc');
    expect(sent.rotation).toBe(0);
    expect(sent.initiative).toBeNull();
    expect(sent.displayMode).toBe('pog');
  });

  it('keeps where and how big it is, and says that it is obscured', () => {
    const sent = maskObscuredToken(token);
    expect(sent.id).toBe('t1');
    expect(sent.position).toEqual({ x: 3, y: 4 });
    expect(sent.size).toEqual({ width: 2, height: 2 });
    expect(sent.layer).toBe('token');
    expect(sent.visible).toBe(true);
    expect(sent.obscured).toBe(true);
  });

  it('is built from a list of what may be known, so a field added later is left out by default', () => {
    const sent = maskObscuredToken(token);
    expect(sent).not.toHaveProperty('description');
    expect(Object.keys(sent).sort()).toEqual([...MASKED_TOKEN_FIELDS].sort());
  });

  it('supplies every field the client requires of a token', () => {
    // A compile-time check: the mask's output is handed around as a Token, so
    // a required field the list forgets would be undefined at runtime while
    // the type says otherwise. `notes` is the one exception, which the server
    // never sends a player at all.
    type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
    type Missing = Exclude<RequiredKeys<Token>, MaskedField | 'notes'>;
    const noneMissing: [Missing] extends [never] ? true : Missing = true;
    expect(noneMissing).toBe(true);
  });

  it('leaves the stored token untouched', () => {
    const before = JSON.stringify(token);
    maskObscuredToken(token);
    expect(JSON.stringify(token)).toBe(before);
  });
});

/**
 * The field rule every token a player is sent goes through, before the mask.
 */
describe('tokenSentTo', () => {
  const hp = { current: 5, max: 9, temp: 0 };
  const token = {
    id: 't1', name: 'Goblin', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 },
    layer: 'token' as const, visible: true, controlledBy: 'user-a', rotation: 0, conditions: [], metadata: {},
    notes: 'secretly a mimic', statBlock: { ac: 15 }, hp, showHpBar: false, sightRadius: 12, obscured: false,
  };

  it('never carries the notes or the stat block', () => {
    for (const own of [true, false]) {
      const sent = tokenSentTo(token, own);
      expect(sent).not.toHaveProperty('notes');
      expect(sent).not.toHaveProperty('statBlock');
    }
  });

  it('carries hit points to the controller, or to anyone once the bar is on', () => {
    expect(tokenSentTo(token, true).hp).toEqual(hp);
    expect(tokenSentTo(token, false)).not.toHaveProperty('hp');
    expect(tokenSentTo({ ...token, showHpBar: true }, false).hp).toEqual(hp);
  });

  it('carries darkvision to the controller only', () => {
    expect(tokenSentTo(token, true).sightRadius).toBe(12);
    expect(tokenSentTo(token, false)).not.toHaveProperty('sightRadius');
  });

  it('carries the creature template link to the controller only', () => {
    // The link resolves to the library entry, whose stat block and true name
    // the DM may have renamed the token to hide.
    const placed = { ...token, creatureTemplateId: 'tmpl-1' };
    expect(tokenSentTo(placed, true).creatureTemplateId).toBe('tmpl-1');
    expect(tokenSentTo(placed, false)).not.toHaveProperty('creatureTemplateId');
  });

  it('masks an obscured token for anyone but the controller', () => {
    const veiled = { ...token, obscured: true };
    expect(tokenSentTo(veiled, true).name).toBe('Goblin');
    expect(tokenSentTo(veiled, false).name).toBe('');
    expect(tokenSentTo(veiled, false).controlledBy).toBeNull();
  });
});
