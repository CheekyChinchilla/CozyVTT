import { describe, it, expect } from 'vitest';
import { tokenDisplayName, tokenPublicName, characterRollPublicName } from '../tokenDisplayName';

describe('tokenDisplayName', () => {
  it('names a token this viewer was sent whole', () => {
    expect(tokenDisplayName({ name: 'Goblin Boss', obscured: false })).toBe('Goblin Boss');
  });

  it('calls a masked token an unknown creature', () => {
    // A player receives an obscured token with its name blanked
    expect(tokenDisplayName({ name: '', obscured: true })).toBe('Unknown creature');
  });

  it('shows the DM the real name of a token they obscured', () => {
    expect(tokenDisplayName({ name: 'Goblin Boss', obscured: true })).toBe('Goblin Boss');
  });
});

describe('tokenPublicName', () => {
  it('is the name in front of the whole table, so an obscured token is never named', () => {
    expect(tokenPublicName({ name: 'Goblin Boss', obscured: true })).toBe('Unknown creature');
    expect(tokenPublicName({ name: 'Goblin Boss', obscured: false })).toBe('Goblin Boss');
    expect(tokenPublicName({ name: 'Goblin Boss' })).toBe('Goblin Boss');
  });

  it('never names a hidden token either, which players are not sent at all', () => {
    expect(tokenPublicName({ name: 'Ambusher', visible: false })).toBe('Unknown creature');
    expect(tokenPublicName({ name: 'Goblin Boss', visible: true })).toBe('Goblin Boss');
  });
});

describe('tokenPublicName on the spirit layer', () => {
  it('never names a spirit-plane token, which players on the material plane are not sent', () => {
    expect(tokenPublicName({ name: 'Wraith', layer: 'spirit' })).toBe('Unknown creature');
    expect(tokenPublicName({ name: 'Goblin Boss', layer: 'token' })).toBe('Goblin Boss');
  });
});


// A roll from a token bound to a character is filed under the character's
// name. From a token players are not sent, or may not name, it must be filed
// under no name at all, as the stat-block roll already was.
describe('characterRollPublicName', () => {
  it('keeps the character name for a token the table can see and name', () => {
    expect(characterRollPublicName({ name: 'Shadow Assassin', visible: true, layer: 'token' }, 'dm')).toBeUndefined();
    expect(characterRollPublicName(undefined, 'dm')).toBeUndefined();
  });

  it('files a roll from an obscured, hidden or spirit-plane token under no name', () => {
    expect(characterRollPublicName({ name: 'Shadow Assassin', obscured: true }, 'dm')).toBe('Unknown creature');
    expect(characterRollPublicName({ name: 'Shadow Assassin', visible: false }, 'dm')).toBe('Unknown creature');
    expect(characterRollPublicName({ name: 'Shadow Assassin', layer: 'spirit' }, 'dm')).toBe('Unknown creature');
  });

  // The dice log already says who rolled, so a player's own token hides
  // nothing by going unnamed; a player who has crossed to the spirit plane
  // still rolls as their character.
  it('keeps the character name when the roller controls the token', () => {
    expect(characterRollPublicName({ name: 'Alice', layer: 'spirit', controlledBy: 'alice' }, 'alice')).toBeUndefined();
    expect(characterRollPublicName({ name: 'Alice', obscured: true, controlledBy: 'alice' }, 'alice')).toBeUndefined();
    expect(characterRollPublicName({ name: 'Alice', layer: 'spirit', controlledBy: 'alice' }, 'dm')).toBe('Unknown creature');
  });
});
