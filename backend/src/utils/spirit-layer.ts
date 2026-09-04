import { prisma } from '../config/database';
import { computeVisibility, isPointVisible } from './serverRaycasting';
import type { WallSegment, LightSource } from '../types/walls';
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
interface MapData {
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
 * - Spectators follow the same rules as players
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
  // the spirit layer and visible in the campaign's current map.
  if (campaign.currentMapId) {
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
    uniqueIds.some((id) => {
      const role = roleByUser.get(id);
      return role != null && role !== 'DM';
    });

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
    result.set(userId, spiritTokens != null && spiritTokens.some((t) => t.controlledBy === userId));
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
export function filterTokensByRole(
  tokens: unknown,
  userRole: string,
  spiritVisible: boolean
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

  // Strip DM-only notes field from non-DM clients
  return visibleTokens.map((token) => {
    const { notes: _notes, ...rest } = token;
    return rest as Token;
  });
}

/**
 * Filter tokens by dynamic lighting visibility for a non-DM player.
 *
 * When lightingEnabled is true on a map, players should only
 * receive tokens that are within their character's line of sight.
 *
 * @param tokens         Tokens already filtered by role/spirit rules
 * @param playerUserId   The player's user ID
 * @param walls          Map wall segments (for raycasting)
 * @param mapWidth       Map pixel width
 * @param mapHeight      Map pixel height
 * @param gridSize       Map grid size in pixels (to convert position to map-space)
 * @param lightingEnabled Whether dynamic lighting is active
 * @returns Tokens visible to this player
 */
export function filterTokensByLighting(
  tokens: Token[],
  playerUserId: string,
  walls: unknown,
  mapWidth: number,
  mapHeight: number,
  gridSize: number,
  lightingEnabled: boolean,
  lights?: unknown
): Token[] {
  if (!lightingEnabled) return tokens;

  const wallSegs = (Array.isArray(walls) ? walls : []) as unknown as WallSegment[];
  const lightSources = (Array.isArray(lights) ? lights : []) as unknown as LightSource[];
  const enabledLights = lightSources.filter((l) => l.enabled);

  // Find all tokens controlled by this player
  const myTokens = tokens.filter((t) => t.controlledBy === playerUserId);

  // Nobody on the map to look through: the only thing to send is what the DM
  // has left visible. Lights deliberately do not help here — a light is not a
  // viewer, and treating one as a viewer is exactly the bug fixed below.
  if (myTokens.length === 0) {
    return tokens.filter((t) => t.visible);
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
  const sights = myTokens.map((t) => {
    // Token grid coords use Y=0 at bottom (VTT standard); wall pixel coords use
    // Y=0 at top. Apply the Y-flip so both are in the same pixel space.
    const cx = (t.position.x + (t.size?.width ?? 1) / 2) * gridSize;
    const cy = (mapHeight - 1 - t.position.y + (t.size?.height ?? 1) / 2) * gridSize;
    return {
      poly: computeVisibility({ x: cx, y: cy }, wallSegs, mapWidthPx, mapHeightPx, 0),
      cx,
      cy,
      // 0 means unlimited, which is what a token with no sight radius set has.
      radiusPx: (t.sightRadius ?? 0) * gridSize,
    };
  });

  // What each light reaches, bounded by its own walls. Light positions are
  // already in map-space pixels (Y=0 at top), so no flip is needed.
  const litAreas = enabledLights.map((light) => {
    const dimRadiusPx = (light.dimRadius ?? light.brightRadius ?? 3) * gridSize;
    return computeVisibility({ x: light.x, y: light.y }, wallSegs, mapWidthPx, mapHeightPx, dimRadiusPx);
  });

  const elapsed = Date.now() - startMs;
  if (elapsed > 50) {
    logger.warn(`[lighting] filterTokensByLighting took ${elapsed}ms for userId=${playerUserId} (${myTokens.length} tokens, ${enabledLights.length} lights)`);
  }

  return tokens.filter((t) => {
    // Always include the player's own tokens
    if (t.controlledBy === playerUserId) return true;

    const cx = (t.position.x + (t.size?.width ?? 1) / 2) * gridSize;
    const cy = (mapHeight - 1 - t.position.y + (t.size?.height ?? 1) / 2) * gridSize;
    const point = { x: cx, y: cy };

    // Line of sight is required, always.
    //
    // Each light's polygon used to be pushed onto this same list and the test
    // was "inside ANY of them", so a light could stand in for the player's own
    // eyes: a creature in a lit room was sent to every player on the map,
    // through walls, at any distance. A light reveals what you could already
    // have seen; it never sees on your behalf.
    const withLineOfSight = sights.filter((s) => isPointVisible(point, s.poly));
    if (withLineOfSight.length === 0) return false;

    // Inside a viewer's own vision radius: made out whether or not it is lit.
    const seenUnaided = withLineOfSight.some(
      (s) => s.radiusPx <= 0 || Math.hypot(cx - s.cx, cy - s.cy) <= s.radiusPx
    );
    if (seenUnaided) return true;

    // Further off than that, it has to be standing in light.
    return litAreas.some((poly) => isPointVisible(point, poly));
  });
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
  let filteredTokens = filterTokensByRole(mapData.tokens, userRole, spiritVisible);

  // Apply dynamic lighting filter for non-DM players when lighting is enabled
  if (userRole !== 'DM' && mapData.lightingEnabled && userId) {
    filteredTokens = filterTokensByLighting(
      filteredTokens,
      userId,
      mapData.wallSegments,
      mapData.width,
      mapData.height,
      mapData.gridSize,
      true,
      mapData.lights
    );
  }

  return {
    ...mapData,
    tokens: filteredTokens,
    // Remove spirit layer URL if user shouldn't see it
    spiritLayerUrl: (userRole === 'DM' || spiritVisible) ? mapData.spiritLayerUrl : null,
    // Wall segments are sent to all roles (players need them for visibility rendering)
    wallSegments: mapData.wallSegments ?? [],
    // Light sources are sent to all roles (players need them for visibility rendering)
    lights: mapData.lights ?? [],
    // Fog data is DM-only (full state); players receive derived revealed-cells via WebSocket
    fogData: userRole === 'DM' ? mapData.fogData : null,
    lightingEnabled: mapData.lightingEnabled,
  };
}
