import { prisma } from '../config/database';
import { computeVisibility, isPointVisible } from './raycasting';
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

// Map data as returned from Prisma
export interface MapData {
  id: string;
  campaignId: string;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  gridSize: number;
  feetPerSquare: number;
  diagonalRule: string;
  baseLayerUrl: string;
  spiritLayerUrl: string | null;
  tokens: unknown;
  annotations: unknown;
  wallSegments: unknown;
  fogData: unknown;
  lightingEnabled: boolean;
  /** Manual fog of war applies on this map. Off: players see the whole map (lighting still applies). */
  fogEnabled: boolean;
  /** Everything in line of sight is lit. Off: lights and darkvision decide what a player sees. */
  globalIllumination: boolean;
  /** Players' explored areas are remembered and greyed in on this map. */
  explorationEnabled: boolean;
  lights: unknown;
  createdAt: Date;
  updatedAt: Date;
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

  // DM always sees the spirit layer
  if (membership.role === 'DM') {
    return true;
  }

  // All players/spectators see it when DM has globally enabled it
  if (campaign.spiritLayerEnabled) {
    return true;
  }

  // Individual player check: are they personally in the spirit realm?
  // A player has crossed over if their token (controlledBy === userId) is on
  // the spirit layer and visible in the campaign's current map. Only a
  // player: a spectator can still be named on a token from before they were
  // demoted, and that name is nobody's, here as in every other filter.
  if (membership.role === 'PLAYER' && campaign.currentMapId) {
    const currentMap = await prisma.map.findUnique({
      where: { id: campaign.currentMapId },
      select: { tokens: true },
    });

    if (currentMap?.tokens) {
      const tokens = (Array.isArray(currentMap.tokens) ? currentMap.tokens : []) as unknown as Token[];
      const isPersonallyInSpiritRealm = tokens.some(
        (t) => t.layer === 'spirit' && t.visible && t.controlledBy === userId
      );
      if (isPersonallyInSpiritRealm) {
        return true;
      }
    }
  }

  return false;
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
    const tokens = (Array.isArray(currentMap?.tokens) ? currentMap!.tokens : []) as unknown as Token[];
    spiritTokens = tokens.filter((t) => t.layer === 'spirit' && t.visible);
  }

  for (const userId of uniqueIds) {
    const role = roleByUser.get(userId);
    if (!role || !campaign) {
      result.set(userId, false);
      continue;
    }
    if (role === 'DM' || campaign.spiritLayerEnabled) {
      result.set(userId, true);
      continue;
    }
    // Crossing over is a player's; see getSpiritVisibility.
    result.set(userId, role === 'PLAYER' && spiritTokens != null && spiritTokens.some((t) => t.controlledBy === userId));
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
  const lits: Lit[] = enabledLights.map((light) => {
    const dimRadiusPx = (light.dimRadius ?? light.brightRadius ?? 3) * gridSize;
    return {
      cx: light.x,
      cy: light.y,
      reach: computeVisibility({ x: light.x, y: light.y }, wallSegs, mapWidthPx, mapHeightPx, dimRadiusPx),
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

/** A map's walls as a member is sent them (wallSentTo). */
export function wallsSentTo(role: string | undefined, walls: unknown): WallSegment[] {
  const list = (Array.isArray(walls) ? walls : []) as unknown as WallSegment[];
  return role === 'DM' ? list : list.map((w) => wallSentTo(role, w));
}

/**
 * A map's lights as a member is sent them: the DM every one, anyone else only
 * those that are on. A light that is off lights nothing anyone can see, the
 * rule `filterTokensByLighting` applies, so nobody but the DM needs to know
 * where it is.
 */
export function lightsSentTo(role: string | undefined, lights: unknown): LightSource[] {
  const list = (Array.isArray(lights) ? lights : []) as unknown as LightSource[];
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

/** Whether a light changing from `before` to `after` changes the copy anyone but the DM has. */
export function lightChangeReachesPlayers(before: LightSource, after: LightSource): boolean {
  return lightReachesPlayers(before) || lightReachesPlayers(after);
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
 * Filter entire map data based on user role and spirit layer visibility.
 *
 * This filters:
 * - Tokens (via filterTokensByRole)
 * - Spirit layer URL (hidden from non-DMs when spirit layer is not visible)
 *
 * 
 * - CRITICAL: Never send spirit layer data to non-privileged users
 *
 * @param mapData - Raw map data from Prisma
 * @param userRole - The user's campaign role
 * @param spiritVisible - Whether the spirit layer is visible to this user
 * @returns Filtered map data safe to send to the client
 */
export function filterMapData(
  mapData: MapData,
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
): MapData & { tokens: Token[] } {
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

  return {
    ...mapData,
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
    lightingEnabled: mapData.lightingEnabled,
  };
}
