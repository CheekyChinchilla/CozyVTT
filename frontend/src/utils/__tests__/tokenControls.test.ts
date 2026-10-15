import { describe, it, expect } from 'vitest';
import { dmTokenControls } from '../tokenControls';
import { TokenType } from '@/types';

/**
 * The bug this pins: the map's right-click menu offered Hide from Players
 * only when the token was an object, because the rule was an `isObject`
 * const written inline beside the JSX. The Token Roster eye, the Token
 * Manager eye and the quick editor all offered it for every type, so a DM
 * could hide an NPC everywhere except on the map itself.
 *
 * The rules now live here, where they can be read in one place and checked.
 * That the map's menu offers what they say, for every kind of token, is
 * checked through the menu itself in MapCanvasInput.test.tsx.
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

  it('lets the DM obscure any token: what it is stays unknown until revealed', () => {
    // A monster the party has not identified, a disguised ally, a shape in
    // the dark: every kind can have its identity hidden while it stays visible.
    for (const type of [TokenType.PLAYER, TokenType.NPC, TokenType.OBJECT]) {
      expect(dmTokenControls(type).obscure).toBe(true);
    }
  });
});
