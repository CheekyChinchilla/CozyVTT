import { CampaignRole, type CampaignMembership, type CreateTokenRequest, type Position, type Size, type Token } from '@/types';
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
 * Who controls a copy of a token: its controller, while they are still a
 * player of the campaign, otherwise nobody. `controlledBy` is not cleared
 * when a member leaves, becomes a spectator or takes the DM's seat, and the
 * server creates a token for a player or for nobody, so copying the stale id
 * made Duplicate fail on a token that still moves and draws normally.
 */
export function copyController(
  controlledBy: string | null | undefined,
  memberships: readonly Pick<CampaignMembership, 'userId' | 'role'>[] | undefined
): string | null {
  return controlledBy && tokenControllerStanding(controlledBy, memberships).kind === 'player' ? controlledBy : null;
}

/** Where a token's controller stands in the campaign now. */
export type TokenControllerStanding =
  | { kind: 'nobody' }
  | { kind: 'player'; name: string }
  /** `name` is null for someone who has left the campaign. */
  | { kind: 'not a player'; name: string | null };

/**
 * Where a token's controller stands: a player, who may move the token, or
 * someone who no longer is (a spectator, the DM, or a member who left), who
 * may not. `controlledBy` is not cleared when that changes, so everything
 * that names a token's controller asks here, as a copy does.
 */
export function tokenControllerStanding(
  controlledBy: string | null | undefined,
  memberships: readonly (Pick<CampaignMembership, 'userId' | 'role'> & { user?: { displayName?: string } })[] | undefined
): TokenControllerStanding {
  if (!controlledBy) return { kind: 'nobody' };
  const member = memberships?.find((m) => m.userId === controlledBy);
  if (member?.role === CampaignRole.PLAYER) return { kind: 'player', name: member.user?.displayName ?? controlledBy };
  return { kind: 'not a player', name: member?.user?.displayName ?? null };
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
