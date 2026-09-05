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
  userId: string,
  uploaderId: string | null
): Promise<boolean> {
  // The owner has to be in the room too.
  //
  // Without this, "used in a campaign you belong to" meant "named by any row
  // you can write" — and nothing stops someone creating a campaign of their own
  // and a map whose imageUrl is a stranger's asset id, which the map route
  // formats but never checks. Referencing an asset therefore granted the right
  // to read it. Requiring the uploader's membership expresses what the rule was
  // always meant to say: you see an asset because somebody who has it brought
  // it somewhere you both are.
  //
  // A null uploader (their account was deleted) grants nothing, deliberately —
  // there is no longer anyone whose access is being shared.
  if (!uploaderId) return false;

  const [viewerIn, uploaderIn] = await Promise.all([
    prisma.campaignMembership.findMany({ where: { userId }, select: { campaignId: true } }),
    prisma.campaignMembership.findMany({ where: { userId: uploaderId }, select: { campaignId: true } }),
  ]);

  const uploaderCampaigns = new Set(uploaderIn.map((m) => m.campaignId));
  const campaignIds = viewerIn
    .map((m) => m.campaignId)
    .filter((id) => uploaderCampaigns.has(id));

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

/** The asset fields the read decision depends on. */
export interface AssetAccessFacts {
  id: string;
  scope: string;
  uploadedById: string | null;
  campaignId: string | null;
}

/**
 * Whether a user may read an asset's bytes.
 *
 * The single rule, used both by the route that serves an asset and by every
 * route that lets a user *point* at one. Those two were separate before, which
 * is how referencing a stranger's asset came to grant the right to read it:
 * only the serving side asked the question, and by then the reference already
 * existed and answered it in the affirmative.
 */
export async function canReadAsset(
  asset: AssetAccessFacts,
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  if (isAdmin) return true;

  if (asset.scope === 'USER') {
    if (asset.uploadedById === userId) return true;
    return assetUsedInUserCampaign(asset.id, userId, asset.uploadedById);
  }

  if (asset.scope === 'CAMPAIGN' && asset.campaignId) {
    const membership = await prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId: asset.campaignId } },
    });
    if (membership) return true;
    // Scoped to one campaign, but a map in another may point at it.
    return assetUsedInUserCampaign(asset.id, userId, asset.uploadedById);
  }

  // GLOBAL, or a campaign asset with no campaign recorded.
  return true;
}

/**
 * The same decision, given only an id — for routes that are about to store a
 * reference to an asset and must check the caller may use it first.
 *
 * An asset that does not exist answers false: a reference to nothing is not
 * something to write into a map either.
 */
export async function canReadAssetById(
  assetId: string,
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, scope: true, uploadedById: true, campaignId: true },
  });
  if (!asset) return false;
  return canReadAsset(asset, userId, isAdmin);
}
