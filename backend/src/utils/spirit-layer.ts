import { createHash } from 'crypto';
// Aliased: `Map` is also JavaScript's own, which this file uses.
import type { Map as MapRow, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { computeVisibility, isPointVisible, type VisibilityPolygon } from './raycasting';
import { isSeen, type Viewer, type Lit, type InsideFn } from './visibilityRule';
import { tokenCentre } from './tokenCentre';
import type { WallSegment, LightSource } from '../types/walls';
import { tokenSentTo } from './tokenMask';
import logger from './logger';
import type { Token } from '../websocket/shared';

/**
 * Spirit Layer Utility Functions
 * Spirit Layer Implementation
 *
 * All spirit layer filtering happens server-side.
 * Spirit layer tokens and data are never sent to players — only DMs see them.
 */

// The token shape lives in websocket/shared.ts — this file used to keep a third
// copy of it, looser than both others (`type` and `disposition` as bare
// strings). See the note there.

/** The tokens on a map's spirit plane that are shown, out of its stored tokens JSON. */
function shownSpiritTokens(tokens: unknown): Token[] {
  return ((Array.isArray(tokens) ? tokens : []) as Token[]).filter((t) => t.layer === 'spirit' && t.visible);
}

/**
 * The spirit-layer rule itself, for one member of one campaign (see
 * getSpiritVisibility). `spiritTokens` are the shown spirit-plane tokens of
 * the campaign's current map, or null when it has none or they were not read
 * because the answer does not depend on them. Every function below decides by
 * this, so the three cannot answer differently.
 */
function seesSpiritPlane(
  role: string | undefined,
  spiritLayerEnabled: boolean,
  spiritTokens: Token[] | null,
  userId: string
): boolean {
  if (!role) return false;
  if (role === 'DM' || spiritLayerEnabled) return true;
  return role === 'PLAYER' && spiritTokens != null && spiritTokens.some((t) => t.controlledBy === userId);
}

/**
 * Check if a user can see the spirit layer for a given campaign.
 *
 * Visibility rules:
 * - DM always sees the spirit layer
 * - Players see it when the DM has globally enabled it (campaign.spiritLayerEnabled), OR
 *   when the player's own token (identified by controlledBy) is currently on the spirit
 *   layer in the campaign's current map — i.e. they have personally crossed over.
 * - Spectators see it when the DM has enabled it for everyone, and never by
 *   crossing over: a token that still names them from when they were a
 *   player is nobody's (viewerIdFor), here as everywhere else
 *
 * @param campaignId - The campaign ID
 * @param userId - The user ID to check visibility for
 * @returns Whether the user can see spirit layer content
 */
export async function getSpiritVisibility(
  campaignId: string,
  userId: string
): Promise<boolean> {
  // Get the user's membership and the campaign's spirit layer setting + current map
  const [membership, campaign] = await Promise.all([
    prisma.campaignMembership.findUnique({
      where: {
        userId_campaignId: { userId, campaignId },
      },
      select: { role: true },
    }),
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { spiritLayerEnabled: true, currentMapId: true },
    }),
  ]);

  if (!membership || !campaign) {
    return false;
  }

  // The current map's tokens matter only to a player, while the plane is not
  // open to everyone: they see it once their own token has crossed over.
  let spiritTokens: Token[] | null = null;
  if (membership.role === 'PLAYER' && !campaign.spiritLayerEnabled && campaign.currentMapId) {
    const currentMap = await prisma.map.findUnique({
      where: { id: campaign.currentMapId },
      select: { tokens: true },
    });
    spiritTokens = currentMap ? shownSpiritTokens(currentMap.tokens) : null;
  }

  return seesSpiritPlane(membership.role, campaign.spiritLayerEnabled, spiritTokens, userId);
}

/**
 * Batch variant of {@link getSpiritVisibility} for fan-out broadcasts.
 *
 * The per-socket loops in the token/spirit/map handlers previously called
 * getSpiritVisibility() once per connected socket — each doing 2–3 DB round
 * trips — turning an O(players) event into an O(players) burst of queries.
 * This computes the same visibility for every requested user in a fixed
 * number of queries (membership roles in one query, campaign once, current-map
 * tokens at most once), then resolves each user in memory. The result is
 * behaviourally identical to calling getSpiritVisibility() per user.
 *
 * @param campaignId - The campaign ID
 * @param userIds - The user IDs to resolve (duplicates are de-duped)
 * @returns Map of userId → whether that user can see the spirit layer
 */
export async function getSpiritVisibilityBatch(
  campaignId: string,
  userIds: string[]
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return result;

  const [memberships, campaign] = await Promise.all([
    prisma.campaignMembership.findMany({
      where: { campaignId, userId: { in: uniqueIds } },
      select: { userId: true, role: true },
    }),
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { spiritLayerEnabled: true, currentMapId: true },
    }),
  ]);

  const roleByUser = new Map(memberships.map((m) => [m.userId, m.role]));

  // The current-map crossover check is only needed when the spirit layer is
  // globally off AND at least one requested user is a non-DM member. Fetch the
  // current map's spirit tokens at most once (not once per user).
  let spiritTokens: Token[] | null = null;
  const needsCrossover =
    campaign != null &&
    !campaign.spiritLayerEnabled &&
    campaign.currentMapId != null &&
    uniqueIds.some((id) => roleByUser.get(id) === 'PLAYER');

  if (needsCrossover && campaign?.currentMapId) {
    const currentMap = await prisma.map.findUnique({
      where: { id: campaign.currentMapId },
      select: { tokens: true },
    });
    spiritTokens = shownSpiritTokens(currentMap?.tokens);
  }

  for (const userId of uniqueIds) {
    result.set(userId, campaign ? seesSpiritPlane(roleByUser.get(userId), campaign.spiritLayerEnabled, spiritTokens, userId) : false);
  }

  return result;
}

/**
 * The other way round from getSpiritVisibilityBatch: one user, many
 * campaigns. Whether they see the spirit plane in each campaign they are a
 * member of, in a fixed number of queries (memberships and campaigns in one
 * each, the current maps' tokens at most once), however many campaigns there
 * are. A campaign they are not a member of is left out of the answer.
 *
 * @param userId - The user to resolve
 * @param campaignIds - The campaigns (duplicates are de-duped)
 * @returns Map of campaignId → whether the user sees the spirit layer there
 */
export async function getSpiritVisibilityAcrossCampaigns(
  userId: string,
  campaignIds: string[]
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const ids = [...new Set(campaignIds)];
  if (ids.length === 0) return result;

  const [memberships, campaigns] = await Promise.all([
    prisma.campaignMembership.findMany({
      where: { userId, campaignId: { in: ids } },
      select: { campaignId: true, role: true },
    }),
    prisma.campaign.findMany({
      where: { id: { in: ids } },
      select: { id: true, spiritLayerEnabled: true, currentMapId: true },
    }),
  ]);
  const roleIn = new Map(memberships.map((m) => [m.campaignId, m.role]));

  // Only where a player's own crossing over decides it.
  const crossoverMapIds = campaigns
    .filter((c) => roleIn.get(c.id) === 'PLAYER' && !c.spiritLayerEnabled && c.currentMapId)
    .map((c) => c.currentMapId!);
  const currentMaps = crossoverMapIds.length === 0
    ? []
    : await prisma.map.findMany({ where: { id: { in: crossoverMapIds } }, select: { id: true, tokens: true } });
  const spiritTokensOn = new Map(currentMaps.map((m) => [m.id, shownSpiritTokens(m.tokens)]));

  for (const campaign of campaigns) {
    const role = roleIn.get(campaign.id);
    if (!role) continue;
    const spiritTokens = campaign.currentMapId ? spiritTokensOn.get(campaign.currentMapId) ?? null : null;
    result.set(campaign.id, seesSpiritPlane(role, campaign.spiritLayerEnabled, spiritTokens, userId));
  }
  return result;
}

/**
 * Filter tokens based on user role and spirit layer visibility.
 *
 * 
 * - DM always sees all tokens on both layers
 * - Players/spectators only see spirit layer tokens when spirit visibility is enabled
 * - Hidden tokens (visible: false) are only visible to the DM
 *
 * @param tokens - Raw token array from the map
 * @param userRole - The user's campaign role (DM, PLAYER, SPECTATOR)
 * @param spiritVisible - Whether the spirit layer is visible to this user
 * @returns Filtered token array
 */
/**
 * A token as one non-DM recipient may see it. `filterTokensByRole` decides
 * which tokens a player is sent; this decides which fields of each one. The
 * client has a display rule for hit points (`visibleTokenHp`), but a display
 * rule protects nothing: whatever reaches the browser can be read there, so
 * what a player is not meant to know is dropped here.
 *
 * - `notes` and `statBlock` are the DM's, on every token.
 * - `hp` goes to the token's controller, and to everyone once the DM turns
 *   its bar on.
 * - `sightRadius` goes to the controller, whose client draws what they see
 *   from it; nobody needs another creature's darkvision.
 *
 * - An `obscured` token reaches anyone but its controller as a shape with no
 *   identity.
 *
 * The rule itself lives in `tokenMask.ts` (`tokenSentTo`), byte-identical
 * with the frontend copy, so the DM's Player Preview applies the same one.
 * "Own" is `controlledBy === userId`, the same test `filterTokensByLighting`
 * uses. A caller that passes no `userId` is treated as controlling nothing,
 * so forgetting it can only hide too much.
 */
export function tokenForRecipient(token: Token, userId: string | undefined): Token {
  return tokenSentTo(token, userId !== undefined && token.controlledBy === userId);
}

/**
 * Whose tokens count as their own for what they are sent: a player's. A
 * spectator controls nothing, whatever `controlledBy` still says from their
 * time as a player (it is not cleared on demotion, and `canControlToken`
 * refuses them the move), so for hit points, darkvision, an obscured
 * identity and sight on a lit map they are nobody. The DM is sent everything
 * and needs no viewpoint. Every per-recipient filter asks this, so a caller
 * cannot forget the role half of the rule.
 */
export function viewerIdFor(role: string | undefined, userId: string | undefined): string | undefined {
  return role === 'PLAYER' ? userId : undefined;
}

/**
 * Whether a member may act on this token's plane: the DM anywhere, anyone
 * on the material plane, and a player on the spirit plane only while they
 * can see it. The socket move handlers and the REST token update ask this
 * before touching a token, so the two channels cannot disagree.
 */
export async function canActOnTokenPlane(
  role: string | undefined,
  token: Pick<Token, 'layer'>,
  campaignId: string,
  userId: string
): Promise<boolean> {
  if (role === 'DM' || token.layer !== 'spirit') return true;
  return getSpiritVisibility(campaignId, userId);
}

export function filterTokensByRole(
  tokens: unknown,
  userRole: string,
  spiritVisible: boolean,
  userId?: string
): Token[] {
  const tokensArray = (Array.isArray(tokens) ? tokens : []) as Token[];

  // DM sees everything (including notes)
  if (userRole === 'DM') {
    return tokensArray;
  }

  const visibleTokens = tokensArray.filter((token) => {
    // Players only see tokens on their currently active layer:
    // - Spirit layer visible (player is in spirit realm): only spirit tokens
    // - Spirit layer hidden (player is on material plane): only material tokens
    if (spiritVisible && token.layer !== 'spirit') return false;
    if (!spiritVisible && token.layer !== 'token') return false;

    // Filter out hidden tokens (only DM can see invisible tokens)
    if (!token.visible) {
      return false;
    }

    return true;
  });

  // Then only the fields this recipient may see of each; a spectator is
  // nobody's controller, whatever the tokens say.
  const viewer = viewerIdFor(userRole, userId);
  return visibleTokens.map((token) => tokenForRecipient(token, viewer));
}

/**
 * Filter tokens by dynamic lighting visibility for a non-DM player.
 *
 * When lightingEnabled is true on a map, players should only
 * receive tokens that are within their character's line of sight.
 *
 * @param tokens         Tokens already filtered by role/spirit rules
 * @param playerUserId   The player's user ID, from `viewerIdFor`: undefined for
 *                       a spectator, who controls no token and so sees nothing
 * @param walls          Map wall segments (for raycasting)
 * @param mapWidth       Map pixel width
 * @param mapHeight      Map pixel height
 * @param gridSize       Map grid size in pixels (to convert position to map-space)
 * @param lightingEnabled Whether dynamic lighting is active
 * @returns Tokens visible to this player
 */
export function filterTokensByLighting(
  tokens: Token[],
  playerUserId: string | undefined,
  walls: unknown,
  mapWidth: number,
  mapHeight: number,
  gridSize: number,
  lightingEnabled: boolean,
  lights?: unknown,
  /**
   * Everything in line of sight counts as lit. Trailing and defaulted, because
   * a required parameter cannot follow an optional one; the default errs safe.
   * A caller that forgets it can only hide too much, never send too much,
   * the opposite of what a forgotten `userId` once did to `filterMapData`.
   */
  globalIllumination = false
): Token[] {
  if (!lightingEnabled) return tokens;
  const sight = playerSightOnLitMap(tokens, playerUserId, walls, mapWidth, mapHeight, gridSize, lights, globalIllumination);
  return tokens.filter((t) => sight.seesToken(t));
}

/**
 * What each light reaches, by the map read it came from. A fan-out asks for
 * every player's sight from one read of the map, and the lights' reach does
 * not depend on the player, so it is raycast once per read and not once per
 * player. Keyed on the read's own wall and light arrays, so a later read, or
 * a change, never sees an old answer, and nothing is kept once they go.
 */
const litCache = new WeakMap<object, WeakMap<object, { key: string; lits: Lit[] }>>();

/**
 * What each light reaches, kept from one read of the map to the next. Every
 * token move reads the map again, with the same walls and lights as the move
 * before, and raycasting each light afresh was most of what a move cost on a
 * lit map. Keyed by everything the reach is worked out from: every wall's
 * type and ends, in order, the map's size, and the light's place and dim
 * radius, so a changed wall or a moved light is worked out again. The
 * LIGHT_REACHES_KEPT used most recently are kept, and fewer when together
 * they pass LIGHT_REACH_POINTS_KEPT points: a wide light on a map of
 * thousands of walls reaches tens of thousands of points, at about 80 bytes
 * a point, so the bound holds the cache near 80 MB. A reach of more points
 * than that alone is never kept.
 */
const LIGHT_REACHES_KEPT = 256;
export const LIGHT_REACH_POINTS_KEPT = 1_000_000;
const lightReaches = new Map<string, VisibilityPolygon>();
let lightReachPoints = 0;

/** The walls as far as sight is concerned, in a few bytes. */
function wallsFingerprint(walls: WallSegment[]): string {
  const ends = walls.map((w) => [w.type, w.x1, w.y1, w.x2, w.y2]);
  return createHash('sha256').update(JSON.stringify(ends)).digest('base64');
}

function lightReach(
  light: LightSource,
  dimRadiusPx: number,
  wallsKey: string,
  wallSegs: WallSegment[],
  mapWidthPx: number,
  mapHeightPx: number
): VisibilityPolygon {
  const key = JSON.stringify([wallsKey, mapWidthPx, mapHeightPx, light.x, light.y, dimRadiusPx]);
  const kept = lightReaches.get(key);
  if (kept) {
    // Most recently used goes last, so the first is the one to let go.
    lightReaches.delete(key);
    lightReaches.set(key, kept);
    return kept;
  }
  const reach = computeVisibility({ x: light.x, y: light.y }, wallSegs, mapWidthPx, mapHeightPx, dimRadiusPx);
  if (reach.points.length > LIGHT_REACH_POINTS_KEPT) return reach;
  lightReaches.set(key, reach);
  lightReachPoints += reach.points.length;
  while (lightReaches.size > LIGHT_REACHES_KEPT || lightReachPoints > LIGHT_REACH_POINTS_KEPT) {
    const oldest = lightReaches.entries().next().value;
    if (oldest === undefined) break;
    lightReaches.delete(oldest[0]);
    lightReachPoints -= oldest[1].points.length;
  }
  return reach;
}

function litsFor(
  walls: unknown,
  lights: unknown,
  wallSegs: WallSegment[],
  enabledLights: LightSource[],
  mapWidthPx: number,
  mapHeightPx: number,
  gridSize: number
): Lit[] {
  const key = `${mapWidthPx}x${mapHeightPx}@${gridSize}`;
  const byWalls = Array.isArray(lights) && Array.isArray(walls) ? litCache.get(lights) : undefined;
  const hit = byWalls?.get(walls as object);
  if (hit && hit.key === key) return hit.lits;
  // Light positions are already in map-space pixels (Y=0 at top), so no flip
  // is needed.
  const wallsKey = enabledLights.length > 0 ? wallsFingerprint(wallSegs) : '';
  const lits: Lit[] = enabledLights.map((light) => {
    const dimRadiusPx = (light.dimRadius ?? light.brightRadius ?? 3) * gridSize;
    return {
      cx: light.x,
      cy: light.y,
      reach: lightReach(light, dimRadiusPx, wallsKey, wallSegs, mapWidthPx, mapHeightPx),
      brightPx: (light.brightRadius ?? 0) * gridSize,
      dimPx: dimRadiusPx,
    };
  });
  if (Array.isArray(lights) && Array.isArray(walls)) {
    const entry = litCache.get(lights) ?? new WeakMap<object, { key: string; lits: Lit[] }>();
    entry.set(walls, { key, lits });
    litCache.set(lights, entry);
  }
  return lits;
}

/** What a player's tokens make out on a lit map, built once and asked many times. */
export interface PlayerSight {
  /**
   * Whether a token is seen where it stands: always one the player controls,
   * otherwise when the visibility rule says its centre is seen. A drag asks
   * it of the carried token at each frame's position.
   */
  seesToken(token: Pick<Token, 'position' | 'size' | 'controlledBy'>): boolean;
  /**
   * Whether one of the player's tokens makes out a point in map pixels, such
   * as a door's middle. Each viewer tests the point nudged 2 px toward
   * itself, as the client's door filter does: a closed door lies on the edge
   * of the sight it blocks.
   */
  seesPoint(x: number, y: number): boolean;
}

/**
 * The sight `filterTokensByLighting` applies, kept so it can be asked again:
 * the line-of-sight polygons are the expensive part, and a drag tests sixty
 * positions a second against the same ones. `tokens` are the tokens the
 * player may have at all (`filterTokensByRole`); the ones they control are
 * the viewers.
 */
export function playerSightOnLitMap(
  tokens: Token[],
  playerUserId: string | undefined,
  walls: unknown,
  mapWidth: number,
  mapHeight: number,
  gridSize: number,
  lights: unknown,
  globalIllumination: boolean
): PlayerSight {
  const wallSegs = (Array.isArray(walls) ? walls : []) as unknown as WallSegment[];
  const lightSources = (Array.isArray(lights) ? lights : []) as unknown as LightSource[];
  const enabledLights = lightSources.filter((l) => l.enabled);

  // Find all tokens controlled by this player. Nobody's viewpoint matches
  // nothing, not the tokens that carry no controller at all.
  const myTokens = playerUserId ? tokens.filter((t) => t.controlledBy === playerUserId) : [];

  // Nobody on the map to look through: nothing is seen, so nothing is sent.
  // Lights deliberately do not help here — a light is not a viewer, and a
  // token-less player receiving every visible token was a position leak.
  if (myTokens.length === 0) {
    return { seesToken: () => false, seesPoint: () => false };
  }

  const startMs = Date.now();
  const mapWidthPx = mapWidth * gridSize;
  const mapHeightPx = mapHeight * gridSize;

  /**
   * One line-of-sight polygon per controlled token, deliberately **unbounded**
   * by the token's sight radius.
   *
   * The radius governs how far you can make something out in the dark, not how
   * far away you can notice something that is lit — you can see a bonfire
   * across a field. So the radius is applied as a distance test below rather
   * than baked into the polygon, and the polygon answers only "is there a wall
   * in the way".
   */
  const viewers: Viewer[] = myTokens.map((t) => {
    // Token grid coords use Y=0 at bottom (VTT standard); wall pixel coords use
    // Y=0 at top. tokenCentre puts both in the same pixel space, at the point
    // the client draws sight from.
    const w = t.size?.width ?? 1;
    const h = t.size?.height ?? 1;
    const { x: cx, y: cy } = tokenCentre(t, gridSize, mapHeight);
    return {
      cx,
      cy,
      sight: computeVisibility({ x: cx, y: cy }, wallSegs, mapWidthPx, mapHeightPx, 0),
      // 0 means none: a token with no sight radius makes nothing out in the
      // dark and relies on light (or global illumination).
      darkvisionPx: (t.sightRadius ?? 0) * gridSize,
      selfPx: (Math.max(w, h) / 2) * gridSize,
    };
  });

  // What each light reaches, bounded by its own walls: the same for every
  // player, so worked out once per map read (litsFor).
  const lits = litsFor(walls, lights, wallSegs, enabledLights, mapWidthPx, mapHeightPx, gridSize);
  const inside: InsideFn = (p, poly) => isPointVisible(p, poly);

  const elapsed = Date.now() - startMs;
  if (elapsed > 50) {
    logger.warn(`[lighting] filterTokensByLighting took ${elapsed}ms for userId=${playerUserId} (${myTokens.length} tokens, ${enabledLights.length} lights)`);
  }

  // The rule itself lives in visibilityRule.ts, shared byte for byte with the
  // client, so what is sent and what is drawn can never disagree. Walls first,
  // always: a light reveals what you could already have seen; it never sees on
  // your behalf. Then Global Illumination, darkvision, the token's own square,
  // and light.
  return {
    seesToken: (t) =>
      t.controlledBy === playerUserId
      || isSeen(tokenCentre(t, gridSize, mapHeight), viewers, lits, globalIllumination, inside),
    seesPoint: (x, y) => viewers.some((v) => {
      const dx = v.cx - x;
      const dy = v.cy - y;
      const d = Math.hypot(dx, dy) || 1;
      return isSeen({ x: x + (dx / d) * 2, y: y + (dy / d) * 2 }, [v], lits, globalIllumination, inside);
    }),
  };
}

/**
 * A wall as a member is sent it. Every wall reaches every member who may read
 * the map, since their browser works out its own sight from them, but a
 * door's lock is the DM's to reveal: anyone else is sent a locked door as a
 * closed one, which blocks sight the same way.
 */
export function wallSentTo(role: string | undefined, wall: WallSegment): WallSegment {
  return role === 'DM' ? wall : playersWall(wall);
}

/** A wall as anyone but the DM is sent it: a locked door as a closed one. */
function playersWall(wall: WallSegment): WallSegment {
  return wall.type === 'door-locked' ? { ...wall, type: 'door-closed' } : wall;
}

/** Whether two walls match in every field a member is sent. */
function sameWall(a: WallSegment, b: WallSegment): boolean {
  return a.id === b.id && a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2 && a.type === b.type;
}

/**
 * Whether a wall changing from `before` to `after` changes the copy anyone
 * but the DM has. A closed door locked or unlocked does not. Such a change is
 * sent to the DM alone, and players are not sent the map again for it
 * (resendSightAfterChange), since either would tell them something had just
 * been done there.
 */
export function wallChangeReachesPlayers(before: WallSegment, after: WallSegment): boolean {
  return !sameWall(playersWall(before), playersWall(after));
}

/**
 * What a member is told of one wall changing from `before` to `after`: the
 * DM `wall:updated`; anyone else the wall as they are sent it (wallSentTo),
 * and nothing when that is the wall they have already
 * (wallChangeReachesPlayers). `extra` (an operation id) rides on the event.
 */
export function wallChangeSentTo(
  role: string | undefined,
  mapId: string,
  before: WallSegment,
  after: WallSegment,
  extra: Record<string, unknown> = {}
): { event: string; data: Record<string, unknown> } | null {
  if (role !== 'DM' && !wallChangeReachesPlayers(before, after)) return null;
  return { event: 'wall:updated', data: { mapId, segment: wallSentTo(role, after), ...extra } };
}

/** A stored JSON list (a map's walls or lights), or an empty one for anything else. */
function storedList<T>(value: unknown): T[] {
  return (Array.isArray(value) ? value : []) as unknown as T[];
}

/** A map's walls as a member is sent them (wallSentTo). */
export function wallsSentTo(role: string | undefined, walls: unknown): WallSegment[] {
  const list = storedList<WallSegment>(walls);
  return role === 'DM' ? list : list.map(playersWall);
}

/**
 * Whether a map's walls replaced, from the stored list `before` to `after`,
 * changes the list anyone but the DM has. It does not when every wall they
 * are sent stays as it was, in the same order, as when the Walls panel's
 * Change type locks or unlocks closed doors.
 */
export function wallListChangeReachesPlayers(before: unknown, after: unknown): boolean {
  const was = storedList<WallSegment>(before).map(playersWall);
  const now = storedList<WallSegment>(after).map(playersWall);
  return was.length !== now.length || was.some((wall, i) => !sameWall(wall, now[i]));
}

/**
 * What a member is told of a map's walls replaced, from the stored list
 * `before` to `after`: the DM `walls:replaced`; anyone else the walls as
 * they are sent them, and nothing when that is the list they have already
 * (wallListChangeReachesPlayers). `extra` (an operation id) rides on the event.
 */
export function wallsReplacedSentTo(
  role: string | undefined,
  mapId: string,
  before: unknown,
  after: unknown,
  extra: Record<string, unknown> = {}
): { event: string; data: Record<string, unknown> } | null {
  if (role !== 'DM' && !wallListChangeReachesPlayers(before, after)) return null;
  return { event: 'walls:replaced', data: { mapId, segments: wallsSentTo(role, after), ...extra } };
}

/**
 * A map's lights as a member is sent them: the DM every one, anyone else only
 * those that are on. A light that is off lights nothing anyone can see, the
 * rule `filterTokensByLighting` applies, so nobody but the DM needs to know
 * where it is.
 */
export function lightsSentTo(role: string | undefined, lights: unknown): LightSource[] {
  const list = storedList<LightSource>(lights);
  return role === 'DM' ? list : list.filter(lightReachesPlayers);
}

/**
 * Whether anyone but the DM is sent this light: only while it is on. A light
 * that is off, added, changed while it stays off, or deleted, is sent to the
 * DM alone, and players are not sent the map again for it
 * (resendSightAfterChange).
 */
export function lightReachesPlayers(light: LightSource | undefined): boolean {
  return light?.enabled === true;
}

/**
 * Whether a light changing from `before` to `after` changes the copy anyone
 * but the DM has. A light set to the values it already has changes nothing.
 */
export function lightChangeReachesPlayers(before: LightSource, after: LightSource): boolean {
  if (sameLight(before, after)) return false;
  return lightReachesPlayers(before) || lightReachesPlayers(after);
}

/** Whether two lights match in every field a member is sent. */
function sameLight(a: LightSource, b: LightSource): boolean {
  return a.id === b.id && a.x === b.x && a.y === b.y && a.brightRadius === b.brightRadius
    && a.dimRadius === b.dimRadius && a.color === b.color && a.enabled === b.enabled;
}

/**
 * Whether a map's lights replaced, from the stored list `before` to `after`,
 * changes the list anyone but the DM has. It does not when every light that
 * is on stays as it was, in the same order, whatever happens to those that
 * are off, as when Clear All in the Lights panel removes only lights that
 * are off.
 */
export function lightListChangeReachesPlayers(before: unknown, after: unknown): boolean {
  const was = storedList<LightSource>(before).filter(lightReachesPlayers);
  const now = storedList<LightSource>(after).filter(lightReachesPlayers);
  return was.length !== now.length || was.some((light, i) => !sameLight(light, now[i]));
}

/**
 * What a member is told of a map's lights replaced, from the stored list
 * `before` to `after`: the DM `lights:replaced`; anyone else the lights that
 * are on, and nothing when that is the list they have already
 * (lightListChangeReachesPlayers). `extra` (an operation id) rides on the event.
 */
export function lightsReplacedSentTo(
  role: string | undefined,
  mapId: string,
  before: unknown,
  after: unknown,
  extra: Record<string, unknown> = {}
): { event: string; data: Record<string, unknown> } | null {
  if (role !== 'DM' && !lightListChangeReachesPlayers(before, after)) return null;
  return { event: 'lights:replaced', data: { mapId, lights: lightsSentTo(role, after), ...extra } };
}

/**
 * What a member is told of one light changing from `before` to `after`: the
 * DM `light:updated`; anyone else, who has only the lights that are on, the
 * light appearing (`light:added`) when it comes on, going (`light:removed`)
 * when it goes off, `light:updated` while it stays on, and nothing while it
 * stays off. `extra` (an operation id) rides on every event.
 */
export function lightChangeSentTo(
  role: string | undefined,
  mapId: string,
  before: LightSource,
  after: LightSource,
  extra: Record<string, unknown> = {}
): { event: string; data: Record<string, unknown> } | null {
  if (role !== 'DM' && !lightChangeReachesPlayers(before, after)) return null;
  if (role === 'DM' || (lightReachesPlayers(before) && lightReachesPlayers(after))) {
    return { event: 'light:updated', data: { mapId, light: after, ...extra } };
  }
  if (lightReachesPlayers(after)) return { event: 'light:added', data: { mapId, light: after, ...extra } };
  return { event: 'light:removed', data: { mapId, lightId: after.id, ...extra } };
}

/**
 * What a member is told of the light `lightId` deleted, given the light as
 * it was (`removed`, undefined when the map had no light by that id): the DM
 * `light:removed`; anyone else only when the light was on
 * (lightReachesPlayers), since one that was off, or never there, is not a
 * light they have. `extra` (an operation id) rides on the event.
 */
export function lightRemovalSentTo(
  role: string | undefined,
  mapId: string,
  lightId: string,
  removed: LightSource | undefined,
  extra: Record<string, unknown> = {}
): { event: string; data: Record<string, unknown> } | null {
  if (role !== 'DM' && !lightReachesPlayers(removed)) return null;
  return { event: 'light:removed', data: { mapId, lightId, ...extra } };
}

/**
 * What a member is sent of a map, decided column by column. filterMapData
 * builds the map from these three lists and nothing else, so a column in none
 * of them reaches nobody; the map list and the campaign fetch select the first
 * (MAP_SELECT_SENT_TO_EVERYONE). Every column of the Map model is in exactly
 * one, and keepInStep.test.ts fails otherwise, so a column added later fails
 * the suite until someone decides who may see it and puts it in one.
 *
 * Sent to everyone, as stored: what every member needs to draw the map.
 */
export const MAP_FIELDS_SENT_TO_EVERYONE = [
  'id', 'campaignId', 'name', 'imageUrl', 'baseLayerUrl', 'width', 'height', 'gridSize', 'feetPerSquare', 'diagonalRule',
  'lightingEnabled', 'fogEnabled', 'globalIllumination', 'explorationEnabled', 'createdAt', 'updatedAt',
] as const satisfies readonly (keyof MapRow)[];

/** Decided for each recipient by filterMapData; MapFieldsDecided says what each may be. */
export const MAP_FIELDS_DECIDED_PER_RECIPIENT = [
  'tokens', 'wallSegments', 'lights', 'fogData', 'spiritLayerUrl', 'annotations',
] as const satisfies readonly (keyof MapRow)[];

/**
 * Never sent to a member. This describes the map members are sent
 * (filterMapData, and the selects built from the first list). Four replies to
 * the DM alone return the stored row whole:
 * `POST /maps`, `POST /maps/import-uvtt`, `PUT /maps/:id` and
 * `POST /maps/:id/tokens`.
 */
export const MAP_FIELDS_NEVER_SENT = [] as const satisfies readonly (keyof MapRow)[];

type MapFieldSentToEveryone = (typeof MAP_FIELDS_SENT_TO_EVERYONE)[number];
type MapFieldDecidedPerRecipient = (typeof MAP_FIELDS_DECIDED_PER_RECIPIENT)[number];

/**
 * The columns sent to everyone, as a Prisma select. The map list and the
 * campaign fetch read each map's metadata with it, leaving out its tokens,
 * walls, lights and fog, and decide the spirit layer address themselves.
 */
export const MAP_SELECT_SENT_TO_EVERYONE = Object.fromEntries(
  MAP_FIELDS_SENT_TO_EVERYONE.map((field) => [field, true])
) as { [K in MapFieldSentToEveryone]: true } satisfies Prisma.MapSelect;

/** Each field decided for a recipient, as it is sent. */
interface MapFieldsDecided {
  /** The DM's every token; anyone else's as filterTokensByRole and, on a lit map, filterTokensByLighting leave them. */
  tokens: Token[];
  /** Every wall; for anyone but the DM a locked door as a closed one (wallsSentTo). */
  wallSegments: WallSegment[];
  /** Every light for the DM; only those that are on for anyone else (lightsSentTo). */
  lights: LightSource[];
  /** The DM's alone; anyone else is sent the revealed cells by their own event. */
  fogData: MapRow['fogData'];
  /** Null for anyone who cannot see the spirit layer. */
  spiritLayerUrl: string | null;
  /** Empty for everyone: nothing reads them, and a campaign import stores whatever its archive held. */
  annotations: [];
}

/** The fields decided for one recipient, every one of the list's and nothing else. */
type DecidedForRecipient = { [K in MapFieldDecidedPerRecipient]: MapFieldsDecided[K] };

/** A map as one member is sent it: the columns sent to everyone, and those decided for them. */
export type MapSent = Pick<MapRow, MapFieldSentToEveryone> & DecidedForRecipient;

function mapFieldsSentToEveryone(map: MapRow): Pick<MapRow, MapFieldSentToEveryone> {
  return Object.fromEntries(MAP_FIELDS_SENT_TO_EVERYONE.map((field) => [field, map[field]])) as Pick<MapRow, MapFieldSentToEveryone>;
}

/**
 * A map as one member is sent it, built from the lists above: the columns
 * everyone is sent as stored, then each one decided for this recipient.
 *
 * - CRITICAL: Never send spirit layer data to non-privileged users
 *
 * @param mapData - The stored map row, read whole
 * @param userRole - The user's campaign role
 * @param spiritVisible - Whether the spirit layer is visible to this user
 * @returns The map safe to send to this user
 */
export function filterMapData(
  mapData: MapRow,
  userRole: string,
  spiritVisible: boolean,
  /**
   * Who is asking. Required — pass `undefined` deliberately if there is
   * genuinely no user, never by leaving it off.
   *
   * This gates the dynamic lighting filter below, and while it was optional one
   * of the three call sites simply omitted it: the REST map fetch handed a
   * player every token on a lit map, silently, because a missing argument reads
   * exactly like "this user has no lighting restrictions".
   */
  userId: string | undefined
): MapSent {
  let filteredTokens = filterTokensByRole(mapData.tokens, userRole, spiritVisible, userId);

  // Apply dynamic lighting filter for non-DM members when lighting is enabled.
  // A spectator has no viewpoint (`viewerIdFor`), so a lit map sends them
  // nothing, like a player with no token on it.
  if (userRole !== 'DM' && mapData.lightingEnabled && userId) {
    filteredTokens = filterTokensByLighting(
      filteredTokens,
      viewerIdFor(userRole, userId),
      mapData.wallSegments,
      mapData.width,
      mapData.height,
      mapData.gridSize,
      true,
      mapData.lights,
      mapData.globalIllumination
    );
  }

  const decided: DecidedForRecipient = {
    tokens: filteredTokens,
    // Remove spirit layer URL if user shouldn't see it
    spiritLayerUrl: (userRole === 'DM' || spiritVisible) ? mapData.spiritLayerUrl : null,
    // Wall segments are sent to all roles (players need them for visibility
    // rendering), a locked door to anyone but the DM as a closed one
    wallSegments: wallsSentTo(userRole, mapData.wallSegments),
    // Light sources that are on are sent to all roles (players need them for
    // visibility rendering); the DM also gets those that are off
    lights: lightsSentTo(userRole, mapData.lights),
    // Fog data is DM-only (full state); players receive derived revealed-cells via WebSocket
    fogData: userRole === 'DM' ? mapData.fogData : null,
    annotations: [],
  };
  return { ...mapFieldsSentToEveryone(mapData), ...decided };
}
