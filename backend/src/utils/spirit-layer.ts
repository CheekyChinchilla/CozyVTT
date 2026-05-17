import { prisma } from '../config/database';
import { computeVisibility, isPointVisible } from './serverRaycasting';
import type { WallSegment, LightSource } from '../types/walls';

/**
 * Spirit Layer Utility Functions
 * Per SOW Section 14: Spirit Layer Implementation
 *
 * All spirit layer filtering happens server-side.
 * Spirit layer tokens and data are never sent to players — only DMs see them.
 */

// Token interface matching SOW Section 4.2
interface Token {
  id: string;
  characterId?: string | null;
  name: string;
  imageUrl: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  layer: 'token' | 'spirit';
  visible: boolean;
  controlledBy?: string | null;
  rotation: number;
  conditions: string[];
  metadata: Record<string, any>;
  type?: string;
  disposition?: string | null;
  hp?: { current: number; max: number; temp: number } | null;
  showHpBar?: boolean;
  notes?: string;
  initiative?: number | null;
  sightRadius?: number;
  displayMode?: 'pog' | 'top-down' | 'full-art';
  statBlock?: Record<string, any> | null;
  creatureTemplateId?: string | null;
}

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
 * Visibility rules (per SOW Section 14.2):
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
 * Filter tokens based on user role and spirit layer visibility.
 *
 * Per SOW Section 14.2:
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
 * Per Session 91: When lightingEnabled is true on a map, players should only
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

  if (myTokens.length === 0 && enabledLights.length === 0) {
    // No controlled tokens and no lights — only return tokens explicitly marked visible
    return tokens.filter((t) => t.visible);
  }

  const startMs = Date.now();
  const mapWidthPx = mapWidth * gridSize;
  const mapHeightPx = mapHeight * gridSize;

  // Compute combined visibility polygons from all controlled tokens.
  // Token grid coords use Y=0 at bottom (VTT standard); wall pixel coords use Y=0 at top.
  // Apply the Y-flip so both are in the same canvas pixel coordinate space.
  const visPolygons = myTokens.map((t) => {
    const cx = (t.position.x + (t.size?.width ?? 1) / 2) * gridSize;
    const cy = (mapHeight - 1 - t.position.y + (t.size?.height ?? 1) / 2) * gridSize;
    const radiusPx = (t.sightRadius ?? 0) * gridSize;
    return computeVisibility({ x: cx, y: cy }, wallSegs, mapWidthPx, mapHeightPx, radiusPx);
  });

  // Additive visibility: also compute visibility polygons from each enabled light source.
  // Uses dimRadius (outer edge) — anything within dim range is "visible" for token filtering.
  // Light positions are already in map-space pixels (Y=0 at top), no flip needed.
  for (const light of enabledLights) {
    const dimRadiusPx = (light.dimRadius ?? light.brightRadius ?? 3) * gridSize;
    visPolygons.push(
      computeVisibility({ x: light.x, y: light.y }, wallSegs, mapWidthPx, mapHeightPx, dimRadiusPx)
    );
  }

  const elapsed = Date.now() - startMs;
  if (elapsed > 50) {
    console.warn(`[lighting] filterTokensByLighting took ${elapsed}ms for userId=${playerUserId} (${myTokens.length} tokens, ${enabledLights.length} lights)`);
  }

  // Keep tokens that are inside any of the visibility polygons (token or light)
  return tokens.filter((t) => {
    // Always include the player's own tokens
    if (t.controlledBy === playerUserId) return true;

    const cx = (t.position.x + (t.size?.width ?? 1) / 2) * gridSize;
    const cy = (mapHeight - 1 - t.position.y + (t.size?.height ?? 1) / 2) * gridSize;
    return visPolygons.some((poly) => isPointVisible({ x: cx, y: cy }, poly));
  });
}

/**
 * Filter entire map data based on user role and spirit layer visibility.
 *
 * This filters:
 * - Tokens (via filterTokensByRole)
 * - Spirit layer URL (hidden from non-DMs when spirit layer is not visible)
 *
 * Per SOW Section 14.2:
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
  userId?: string
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
