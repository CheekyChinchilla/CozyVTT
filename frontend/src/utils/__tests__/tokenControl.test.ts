import { describe, it, expect } from 'vitest';
import { controlsToken } from '../tokenControl';

/**
 * One definition of "my token" for the client, matching the server's
 * `canControlToken`: a player the token names as its controller. The client
 * used to also count a token bound to one of the user's characters, so a
 * player could pick up a token the server then refused to move, and on a lit
 * map was drawn ground the server never sent them anything for. It then
 * omitted the role half of the rule, so a spectator still named on a token
 * from their time as a player was offered the drag the server refuses.
 */
describe('controlsToken', () => {
  it('is the token whose controller is this player', () => {
    expect(controlsToken({ controlledBy: 'alice', characterId: null }, 'alice', 'PLAYER')).toBe(true);
  });

  it('is nobody else\'s, and nobody\'s when unassigned or signed out', () => {
    expect(controlsToken({ controlledBy: 'alice', characterId: null }, 'bob', 'PLAYER')).toBe(false);
    expect(controlsToken({ controlledBy: null, characterId: null }, 'alice', 'PLAYER')).toBe(false);
    expect(controlsToken({ controlledBy: 'alice', characterId: null }, undefined, 'PLAYER')).toBe(false);
    expect(controlsToken({ controlledBy: 'alice', characterId: null }, null, 'PLAYER')).toBe(false);
  });

  it('a character binding alone is not control, as on the server', () => {
    expect(controlsToken({ controlledBy: null, characterId: 'char-alice' }, 'alice', 'PLAYER')).toBe(false);
  });

  it('a spectator controls nothing, even a token that still names them, as on the server', () => {
    expect(controlsToken({ controlledBy: 'alice', characterId: null }, 'alice', 'SPECTATOR')).toBe(false);
    expect(controlsToken({ controlledBy: 'alice', characterId: null }, 'alice', undefined)).toBe(false);
  });
});
