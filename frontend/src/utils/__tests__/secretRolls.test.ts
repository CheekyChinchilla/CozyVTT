/**
 * Who may see a dice roll in the roll list.
 *
 * The server already scopes secret rolls, in both the live socket path and the
 * history endpoint. These pin the client's second line of defence: if someone
 * else's secret roll ever reaches the browser, the panel must not draw it.
 *
 * The "show secret rolls" preference is tested alongside precisely because the
 * two must not be confused — one decides what a viewer is entitled to, the
 * other only tidies their own panel.
 */

import { describe, it, expect } from 'vitest';
import { mayDisplayRoll, visibleRolls, type RollVisibility } from '../secretRolls';

const ME = 'user-me';
const THEM = 'user-them';

const roll = (over: Partial<RollVisibility> = {}): RollVisibility => ({
  userId: THEM,
  secret: false,
  ...over,
});

describe('mayDisplayRoll', () => {
  describe('a public roll', () => {
    it.each([
      ['a player', false],
      ['the DM', true],
    ])('is shown to %s', (_label, isDM) => {
      expect(mayDisplayRoll(roll(), ME, isDM)).toBe(true);
    });
  });

  describe('a secret roll', () => {
    it('is shown to the person who made it', () => {
      expect(mayDisplayRoll(roll({ userId: ME, secret: true }), ME, false)).toBe(true);
    });

    // The DM receives these deliberately, for audit and dispute resolution.
    it('is shown to the DM', () => {
      expect(mayDisplayRoll(roll({ userId: THEM, secret: true }), ME, true)).toBe(true);
    });

    // The case this function exists for.
    it('is not shown to another player', () => {
      expect(mayDisplayRoll(roll({ userId: THEM, secret: true }), ME, false)).toBe(false);
    });

    // Fails closed: an unidentified viewer is not the roller.
    it('is not shown when the viewer is unknown', () => {
      expect(mayDisplayRoll(roll({ userId: THEM, secret: true }), undefined, false)).toBe(false);
    });
  });
});

describe('visibleRolls', () => {
  const rolls = [
    roll({ userId: ME, secret: false }),
    roll({ userId: ME, secret: true }),
    roll({ userId: THEM, secret: false }),
    roll({ userId: THEM, secret: true }),
  ];

  it("gives a player everything but another player's secret", () => {
    const shown = visibleRolls(rolls, ME, false, true);
    expect(shown).toHaveLength(3);
    expect(shown.some((r) => r.userId === THEM && r.secret)).toBe(false);
  });

  it('gives the DM every roll', () => {
    expect(visibleRolls(rolls, ME, true, true)).toHaveLength(4);
  });

  // The preference tidies the viewer's own panel and nothing else.
  it('drops secret rolls when the viewer turns them off', () => {
    const shown = visibleRolls(rolls, ME, false, false);
    expect(shown).toHaveLength(2);
    expect(shown.every((r) => !r.secret)).toBe(true);
  });

  it('drops them for the DM too when the DM turns them off', () => {
    expect(visibleRolls(rolls, ME, true, false)).toHaveLength(2);
  });

  // Turning the preference ON must never reveal what permission denies.
  it('never shows another player a secret roll, whatever the preference', () => {
    for (const showSecret of [true, false]) {
      const shown = visibleRolls(rolls, ME, false, showSecret);
      expect(shown.some((r) => r.userId === THEM && r.secret)).toBe(false);
    }
  });

  it('preserves order', () => {
    const ordered = [
      roll({ userId: ME, secret: false }),
      roll({ userId: ME, secret: true }),
      roll({ userId: ME, secret: false }),
    ];
    expect(visibleRolls(ordered, ME, false, true)).toEqual(ordered);
  });

  it('returns nothing for an empty list', () => {
    expect(visibleRolls([], ME, false, true)).toEqual([]);
  });
});
