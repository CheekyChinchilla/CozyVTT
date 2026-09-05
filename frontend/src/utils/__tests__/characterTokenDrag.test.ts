/**
 * Placing a player's character on the map.
 *
 * The case that matters here is a character with no token picture. Both the
 * roster and the map used to refuse one — the roster rendered no drag handle,
 * and the map rejected the drop — so a character could only reach the map once
 * someone had uploaded an image for it. The canvas has always been able to draw
 * an imageless token as a lettered circle, which is what the creature library
 * relies on, so the refusal bought nothing.
 */

import { describe, it, expect } from 'vitest';

import {
  CHARACTER_TOKEN_DRAG,
  characterTokenDrag,
  characterTokenRequest,
  readCharacterTokenDrag,
} from '../characterTokenDrag';
import type { PlaceableCharacter } from '../characterTokenDrag';
import { TokenLayer, TokenType } from '@/types';

const withImage = {
  id: 'char-1',
  name: 'Aeryn',
  tokenImageUrl: '/api/assets/tokens/abc',
  userId: 'user-1',
};

const withoutImage = {
  id: 'char-2',
  name: 'Test DnD',
  tokenImageUrl: null,
  userId: 'user-2',
};

describe('building the drag payload', () => {
  it('carries the character through', () => {
    expect(characterTokenDrag(withImage)).toEqual({
      type: CHARACTER_TOKEN_DRAG,
      characterId: 'char-1',
      name: 'Aeryn',
      imageUrl: '/api/assets/tokens/abc',
      userId: 'user-1',
    });
  });

  it('turns a missing token picture into an empty string, not a refusal', () => {
    expect(characterTokenDrag(withoutImage).imageUrl).toBe('');
  });
});

describe('reading a drag payload back', () => {
  const roundTrip = (character: PlaceableCharacter) =>
    readCharacterTokenDrag(JSON.stringify(characterTokenDrag(character)));

  it('round-trips a character that has a token picture', () => {
    expect(roundTrip(withImage)?.characterId).toBe('char-1');
  });

  // The bug: a character with no picture was dropped on the floor here.
  it('accepts a character with no token picture', () => {
    const drag = roundTrip(withoutImage);
    expect(drag).not.toBeNull();
    expect(drag!.name).toBe('Test DnD');
    expect(drag!.imageUrl).toBe('');
  });

  it('ignores a drop that is not ours', () => {
    expect(readCharacterTokenDrag(JSON.stringify({ type: 'something-else' }))).toBeNull();
    expect(readCharacterTokenDrag('a plain text drop')).toBeNull();
    expect(readCharacterTokenDrag('')).toBeNull();
    expect(readCharacterTokenDrag('null')).toBeNull();
  });

  it('ignores a payload of the right kind but the wrong shape', () => {
    const bad = (over: Record<string, unknown>) =>
      readCharacterTokenDrag(JSON.stringify({ ...characterTokenDrag(withImage), ...over }));

    expect(bad({ characterId: undefined })).toBeNull();
    expect(bad({ characterId: '' })).toBeNull();
    expect(bad({ imageUrl: undefined })).toBeNull();
    expect(bad({ imageUrl: 42 })).toBeNull();
    expect(bad({ userId: undefined })).toBeNull();
  });
});

describe('the token it creates', () => {
  const drag = characterTokenDrag(withoutImage);
  const position = { x: 4, y: 7 };

  it('is a player token, so the roster categorises it correctly', () => {
    expect(characterTokenRequest(drag, position, TokenLayer.TOKEN).type).toBe(TokenType.PLAYER);
  });

  it('is controlled by the character owner and bound to the character', () => {
    const request = characterTokenRequest(drag, position, TokenLayer.TOKEN);
    expect(request.controlledBy).toBe('user-2');
    expect(request.characterId).toBe('char-2');
  });

  it('keeps the position and layer it was given', () => {
    const request = characterTokenRequest(drag, position, TokenLayer.SPIRIT);
    expect(request.position).toEqual({ x: 4, y: 7 });
    expect(request.layer).toBe(TokenLayer.SPIRIT);
  });

  it('places an imageless character rather than refusing', () => {
    expect(characterTokenRequest(drag, position, TokenLayer.TOKEN).imageUrl).toBe('');
  });

  it('falls back to a name rather than creating an unnamed token', () => {
    const unnamed = characterTokenRequest(
      { ...drag, name: '' }, position, TokenLayer.TOKEN,
    );
    expect(unnamed.name).toBe('Token');
  });
});
