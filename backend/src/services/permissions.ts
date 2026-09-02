import { CampaignRole, PlatformRole } from '@prisma/client';
import { prisma } from '../config/database';
import { readTokens } from '../utils/prisma-json';

/**
 * Permission Verification Helpers
 * Role & Permission Model
 * Server-side permission checks for business logic
 */

/**
 * Check if user is an admin
 */
export function isAdmin(platformRole: PlatformRole): boolean {
  return platformRole === 'ADMIN';
}

/**
 * Check if user is DM of a campaign
 */
export function isDM(campaignRole: CampaignRole): boolean {
  return campaignRole === 'DM';
}

/**
 * Check if user is Player in a campaign
 */
export function isPlayer(campaignRole: CampaignRole): boolean {
  return campaignRole === 'PLAYER';
}

/**
 * Check if user is Spectator in a campaign
 */
export function isSpectator(campaignRole: CampaignRole): boolean {
  return campaignRole === 'SPECTATOR';
}

/**
 * Check if user can edit campaign settings
 * Only DM can edit campaign
 */
export function canEditCampaign(campaignRole: CampaignRole, platformRole: PlatformRole): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can edit a specific character
 * 
 * - Players can edit own characters
 * - DM can edit any character in campaign
 * - Admin can edit any character
 */
export async function canEditCharacter(
  userId: string,
  characterId: string,
  campaignId: string,
  platformRole: PlatformRole
): Promise<boolean> {
  // Admins can edit anything
  if (isAdmin(platformRole)) {
    return true;
  }

  // Get character
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    return false;
  }

  // Owner can always edit their own character
  if (character.userId === userId) {
    return true;
  }

  // Check if user is DM of the campaign
  const membership = await prisma.campaignMembership.findUnique({
    where: {
      userId_campaignId: {
        userId,
        campaignId,
      },
    },
  });

  if (membership && isDM(membership.role)) {
    return true;
  }

  return false;
}

/**
 * Check if user can move a token
 * 
 * - Players can move their assigned character tokens
 * - DM can move any token
 */
export async function canMoveToken(
  userId: string,
  characterId: string,
  campaignId: string
): Promise<boolean> {
  const membership = await prisma.campaignMembership.findUnique({
    where: {
      userId_campaignId: {
        userId,
        campaignId,
      },
    },
  });

  if (!membership) {
    return false;
  }

  // DM can move any token
  if (isDM(membership.role)) {
    return true;
  }

  // Player can move their assigned character tokens
  if (isPlayer(membership.role)) {
    return membership.characterIds.includes(characterId);
  }

  // Spectators cannot move tokens
  return false;
}

/**
 * Check if user can manage campaign maps
 * Only DM can manage maps
 */
export function canManageMaps(campaignRole: CampaignRole, platformRole: PlatformRole): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can toggle Spirit Layer
 * Only DM can toggle Spirit Layer
 */
export function canToggleSpiritLayer(
  campaignRole: CampaignRole,
  platformRole: PlatformRole
): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can change vibe tracker
 * Only DM can change time of day
 */
export function canChangeVibe(campaignRole: CampaignRole, platformRole: PlatformRole): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can manage campaign sessions
 * Only DM can start/pause/end sessions
 */
export function canManageSessions(campaignRole: CampaignRole, platformRole: PlatformRole): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can invite players to campaign
 * Only campaign owner (DM) can invite
 */
export async function canInvitePlayers(
  userId: string,
  campaignId: string,
  platformRole: PlatformRole
): Promise<boolean> {
  // Admins can invite to any campaign
  if (isAdmin(platformRole)) {
    return true;
  }

  // Check if user is the campaign owner
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    return false;
  }

  return campaign.ownerId === userId;
}

/**
 * Check if user can delete a campaign
 * Only campaign owner or admin
 */
export async function canDeleteCampaign(
  userId: string,
  campaignId: string,
  platformRole: PlatformRole
): Promise<boolean> {
  // Admins can delete any campaign
  if (isAdmin(platformRole)) {
    return true;
  }

  // Check if user is the campaign owner
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    return false;
  }

  return campaign.ownerId === userId;
}

/**
 * Check if user can send chat messages
 * DM and Players can chat, Spectators cannot
 */
export function canSendChatMessages(campaignRole: CampaignRole): boolean {
  return isDM(campaignRole) || isPlayer(campaignRole);
}

/**
 * Check if user can roll dice
 * DM and Players can roll, Spectators cannot
 */
export function canRollDice(campaignRole: CampaignRole): boolean {
  return isDM(campaignRole) || isPlayer(campaignRole);
}

/**
 * Check if user can delete chat messages
 * Only DM can delete messages
 */
export function canDeleteMessages(campaignRole: CampaignRole, platformRole: PlatformRole): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can export campaign data
 * Campaign owner (DM) and Admin
 */
export async function canExportCampaign(
  userId: string,
  campaignId: string,
  platformRole: PlatformRole
): Promise<boolean> {
  // Admins can export any campaign
  if (isAdmin(platformRole)) {
    return true;
  }

  // Check if user is the campaign owner
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    return false;
  }

  return campaign.ownerId === userId;
}

/**
 * Check whether something in a campaign this user belongs to uses an asset.
 *
 * Access to an image follows its **use**, not only its upload. A DM may pick a
 * map out of their own asset library — the picker lists personal assets with no
 * campaign filter — and that map then *is* the campaign's battlemap. Until this
 * existed, every player got 403 on it and saw "Failed to load map image", and
 * token art fell back to plain initial circles for the same reason.
 *
 * Deliberately not solved by re-scoping the asset to the campaign on use:
 * `Asset.scope` carries a single campaignId, and one map is commonly shared by
 * several campaigns at once, so promoting it would break the others.
 *
 * This grants READ only. Who may edit or delete an asset is decided elsewhere
 * and is unchanged — being able to see the battlemap must not mean being able
 * to delete it.
 *
 * The asset id is matched as a substring of the stored URL, which is the shape
 * everything writes (`/api/assets/maps/<id>`). Ids are UUIDs, so a partial
 * collision is not a practical concern.
 */
export async function assetUsedInUserCampaign(
  assetId: string,
  userId: string
): Promise<boolean> {
  const memberships = await prisma.campaignMembership.findMany({
    where: { userId },
    select: { campaignId: true },
  });
  const campaignIds = memberships.map((m) => m.campaignId);
  if (campaignIds.length === 0) return false;

  // A map's own layers first: that is the common case, and it answers without
  // reading any JSON.
  const mapLayer = await prisma.map.findFirst({
    where: {
      campaignId: { in: campaignIds },
      OR: [
        { imageUrl: { contains: assetId } },
        { baseLayerUrl: { contains: assetId } },
        { spiritLayerUrl: { contains: assetId } },
      ],
    },
    select: { id: true },
  });
  if (mapLayer) return true;

  const [character, creature, tokenTemplate] = await Promise.all([
    prisma.character.findFirst({
      where: { campaignId: { in: campaignIds }, tokenImageUrl: { contains: assetId } },
      select: { id: true },
    }),
    prisma.creatureTemplate.findFirst({
      where: { campaignId: { in: campaignIds }, imageUrl: { contains: assetId } },
      select: { id: true },
    }),
    prisma.tokenTemplate.findFirst({
      where: { campaignId: { in: campaignIds }, imageUrl: { contains: assetId } },
      select: { id: true },
    }),
  ]);
  if (character || creature || tokenTemplate) return true;

  // Tokens live as JSON on the map, so they cannot be matched by column. Only
  // the art URL is read, and only once everything cheaper has missed.
  const maps = await prisma.map.findMany({
    where: { campaignId: { in: campaignIds } },
    select: { tokens: true },
  });
  return maps.some((map) =>
    readTokens(map.tokens).some((token) => token?.imageUrl?.includes(assetId))
  );
}
