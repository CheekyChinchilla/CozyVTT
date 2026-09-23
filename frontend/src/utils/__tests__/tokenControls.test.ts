import { describe, it, expect } from 'vitest';
import { dmTokenControls } from '../tokenControls';
import { TokenType } from '@/types';

// Read MapCanvas as text, the same way publicRoutes.test.ts reads App.tsx —
// a Vite raw import, so no Node filesystem types are involved.
const MAP_CANVAS = Object.values(
  import.meta.glob('/src/components/campaign/MapCanvas.tsx', { query: '?raw', import: 'default', eager: true })
)[0] as string;

/**
 * The bug this pins: the map's right-click menu offered Hide from Players
 * only when the token was an object, because the rule was an `isObject`
 * const written inline beside the JSX. The Token Roster eye, the Token
 * Manager eye and the quick editor all offered it for every type, so a DM
 * could hide an NPC everywhere except on the map itself.
 *
 * The rules now live here, where they can be read in one place and checked.
 */
describe('dmTokenControls', () => {
  it('lets the DM hide any token from players, whatever its type', () => {
    for (const type of [TokenType.PLAYER, TokenType.NPC, TokenType.OBJECT]) {
      expect(dmTokenControls(type).hide).toBe(true);
    }
  });

  it('keeps objects out of the spirit realm, and lets creatures cross', () => {
    expect(dmTokenControls(TokenType.PLAYER).crossPlanes).toBe(true);
    expect(dmTokenControls(TokenType.NPC).crossPlanes).toBe(true);
    expect(dmTokenControls(TokenType.OBJECT).crossPlanes).toBe(false);
  });

  it('offers placing a token already hidden for the tokens that are secrets', () => {
    // A monster staged ahead of time and a trapped chest are secrets; a
    // player's own character is not, and placing one hidden would leave its
    // player looking at a map with nothing on it.
    expect(dmTokenControls(TokenType.NPC).placeHidden).toBe(true);
    expect(dmTokenControls(TokenType.OBJECT).placeHidden).toBe(true);
    expect(dmTokenControls(TokenType.PLAYER).placeHidden).toBe(false);
  });

  it('is where the canvas reads its per-type rules, so none is written inline again', () => {
    expect(MAP_CANVAS).toContain('dmTokenControls');
    expect(MAP_CANVAS).not.toContain('const isObject =');
  });
});
