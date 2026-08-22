/**
 * Player colour tests.
 *
 * The colour is derived, not stored, so the contract that matters is:
 * the same user always gets the same colour on every client, and the
 * result is always a real palette entry.
 */

import { describe, it, expect } from 'vitest';
import { playerColor, PLAYER_COLORS } from '../playerColor';

describe('playerColor', () => {
  it('is stable for a given user id', () => {
    const id = '3bbcf1fc-1f17-4aee-a851-5f91a691b747';
    const first = playerColor(id);
    for (let i = 0; i < 20; i++) {
      expect(playerColor(id)).toBe(first);
    }
  });

  it('only ever returns a palette colour', () => {
    for (let i = 0; i < 500; i++) {
      expect(PLAYER_COLORS).toContain(playerColor(`user-${i}`));
    }
  });

  it('falls back rather than throwing on an empty id', () => {
    expect(PLAYER_COLORS).toContain(playerColor(''));
  });

  it('spreads across the palette instead of clustering', () => {
    // UUIDs from one generator share long prefixes; a weak hash (summing char
    // codes) collapses them onto a handful of colours. Every hue should be
    // reachable from a realistic id shape.
    const used = new Set<string>();
    for (let i = 0; i < 400; i++) {
      used.add(playerColor(`3bbcf1fc-1f17-4aee-a851-5f91a691b7${i.toString().padStart(3, '0')}`));
    }
    expect(used.size).toBe(PLAYER_COLORS.length);
  });

  it('gives different users different colours in a typical party', () => {
    const party = ['alice', 'bob', 'carol', 'dave', 'erin'].map(playerColor);
    // Not a guarantee for arbitrary ids, but a 5-person table off a 10-colour
    // palette should not be colliding — if this ever fails the palette or hash
    // has regressed.
    expect(new Set(party).size).toBe(party.length);
  });
});
