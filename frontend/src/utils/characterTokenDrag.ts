/**
 * Placing a player's character on the map.
 *
 * The campaign roster writes this payload onto the drag event and the map
 * canvas reads it back off. Both ends used to describe the shape
 * independently, which is how they came to disagree about whether a token
 * image was required.
 *
 * A character with no token picture is placed just the same: the canvas draws
 * an imageless token as a coloured circle with the character's initial (see
 * `drawTokens.ts`), which is what the creature library has always relied on.
 */

import { TokenLayer, TokenType } from '@/types';
import type { CreateTokenRequest, Position } from '@/types';

/** Marks a drag as one of ours, so an unrelated drop is ignored. */
export const CHARACTER_TOKEN_DRAG = 'character-token';

export interface CharacterTokenDrag {
  type: typeof CHARACTER_TOKEN_DRAG;
  characterId: string;
  name: string;
  /** Empty when the character has no token picture — not a reason to refuse. */
  imageUrl: string;
  /** The player who owns the character; becomes the token's controller. */
  userId: string;
}

/** The character fields needed to place one, as the roster holds them. */
export interface PlaceableCharacter {
  id: string;
  name: string;
  tokenImageUrl: string | null;
  userId: string;
}

export function characterTokenDrag(character: PlaceableCharacter): CharacterTokenDrag {
  return {
    type: CHARACTER_TOKEN_DRAG,
    characterId: character.id,
    name: character.name,
    imageUrl: character.tokenImageUrl ?? '',
    userId: character.userId,
  };
}

/**
 * Read a drag payload back, or `null` if this drop is not one of ours.
 *
 * `imageUrl` is checked for being a string rather than for being non-empty.
 * That distinction is the bug this module exists to prevent: the map used to
 * reject the drop outright when a character had no token picture, so a
 * character could only be placed once someone had uploaded one.
 */
export function readCharacterTokenDrag(raw: string): CharacterTokenDrag | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const value = parsed as Partial<Record<keyof CharacterTokenDrag, unknown>>;
  if (value.type !== CHARACTER_TOKEN_DRAG) return null;
  if (typeof value.characterId !== 'string' || !value.characterId) return null;
  if (typeof value.name !== 'string') return null;
  if (typeof value.imageUrl !== 'string') return null;
  if (typeof value.userId !== 'string') return null;

  return {
    type: CHARACTER_TOKEN_DRAG,
    characterId: value.characterId,
    name: value.name,
    imageUrl: value.imageUrl,
    userId: value.userId,
  };
}

/**
 * The token to create for a dragged character.
 *
 * `type: PLAYER` is set explicitly because the server defaults a new token to
 * `npc`, and the token roster categorises by that field.
 */
export function characterTokenRequest(
  drag: CharacterTokenDrag,
  position: Position,
  layer: TokenLayer,
): CreateTokenRequest {
  return {
    characterId: drag.characterId,
    name: drag.name || 'Token',
    imageUrl: drag.imageUrl,
    position,
    size: { width: 1, height: 1 },
    layer,
    visible: true,
    controlledBy: drag.userId || null,
    type: TokenType.PLAYER,
  };
}
