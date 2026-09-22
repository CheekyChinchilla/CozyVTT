import { describe, it, expect } from 'vitest';
import { controlsToken } from '../tokenControl';

/**
 * One definition of "my token" for the client, matching the server's: the
 * user the token names as its controller. The client used to also count a
 * token bound to one of the user's characters, so a player could pick up a
 * token the server then refused to move, and on a lit map was drawn ground
 * the server never sent them anything for.
 */
describe('controlsToken', () => {
  it('is the token whose controller is this user', () => {
    expect(controlsToken({ controlledBy: 'alice', characterId: null }, 'alice')).toBe(true);
  });

  it('is nobody else\'s, and nobody\'s when unassigned or signed out', () => {
    expect(controlsToken({ controlledBy: 'alice', characterId: null }, 'bob')).toBe(false);
    expect(controlsToken({ controlledBy: null, characterId: null }, 'alice')).toBe(false);
    expect(controlsToken({ controlledBy: 'alice', characterId: null }, undefined)).toBe(false);
    expect(controlsToken({ controlledBy: 'alice', characterId: null }, null)).toBe(false);
  });

  it('a character binding alone is not control, as on the server', () => {
    expect(controlsToken({ controlledBy: null, characterId: 'char-alice' }, 'alice')).toBe(false);
  });
});
