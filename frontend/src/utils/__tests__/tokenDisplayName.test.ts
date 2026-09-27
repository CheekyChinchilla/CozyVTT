import { describe, it, expect } from 'vitest';
import { tokenDisplayName, tokenPublicName } from '../tokenDisplayName';

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
