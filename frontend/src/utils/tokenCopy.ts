import type { CreateTokenRequest, Position, Size, Token } from '@/types';
import { extractAssetId } from './assetUrl';

/**
 * The request that puts an existing token somewhere else.
 *
 * Moving a token to another map, and duplicating one, each rebuilt it from a
 * hand-written list of fields. There were five such lists and each had
 * forgotten something different: the map-switch one left out `type`, so the
 * server's default turned a player's token into an NPC, and left out
 * darkvision, hit points, disposition, the NPC stat block and four more.
 *
 * Nothing is listed here. The token is spread minus its identity and its old
 * position, so a field added to `Token` is carried without anyone having to
 * remember this file. A caller that means to change something (a duplicate
 * starts on full hit points) overrides it at the call site, where the reason
 * is visible.
 */
export function tokenCopyRequest(token: Token, position: Position): CreateTokenRequest {
  const { id: _id, position: _oldPosition, imageUrl, ...carried } = token;
  return {
    ...carried,
    // The server stores an asset id and builds the serving path itself, so
    // send what it stores instead of a path it would have to unpick.
    imageUrl: extractAssetId(imageUrl) ?? imageUrl,
    position,
  };
}

/**
 * A position that keeps the token's whole footprint on the map.
 *
 * The three move sites clamped differently: one to `width - 1`, which lets a
 * token wider than a square hang off the edge, and two to
 * `width - size.width`. Neither stopped a negative, which a token larger than
 * the destination map produces.
 */
export function clampTokenPosition(
  position: Position,
  size: Size,
  map: { width: number; height: number }
): Position {
  return {
    x: Math.max(0, Math.min(position.x, map.width - size.width)),
    y: Math.max(0, Math.min(position.y, map.height - size.height)),
  };
}
