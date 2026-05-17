import { CampaignRole, PlatformRole } from '@prisma/client';
import { prisma } from '../config/database';

/**
 * Permission Verification Helpers
 * Per SOW Section 3.5: Role & Permission Model
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
 * Per SOW Section 3.5: Only DM can edit campaign
 */
export function canEditCampaign(campaignRole: CampaignRole, platformRole: PlatformRole): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can edit a specific character
 * Per SOW Section 3.5 & 16.4:
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
 * Per SOW Section 3.5:
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
 * Per SOW Section 3.5: Only DM can manage maps
 */
export function canManageMaps(campaignRole: CampaignRole, platformRole: PlatformRole): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can toggle Spirit Layer
 * Per SOW Section 14.2 & 3.5: Only DM can toggle Spirit Layer
 */
export function canToggleSpiritLayer(
  campaignRole: CampaignRole,
  platformRole: PlatformRole
): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can change vibe tracker
 * Per SOW Section 18.3: Only DM can change time of day
 */
export function canChangeVibe(campaignRole: CampaignRole, platformRole: PlatformRole): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can manage campaign sessions
 * Per SOW Section 15.2: Only DM can start/pause/end sessions
 */
export function canManageSessions(campaignRole: CampaignRole, platformRole: PlatformRole): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can invite players to campaign
 * Per SOW Section 3.5: Only campaign owner (DM) can invite
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
 * Per SOW Section 3.5: Only campaign owner or admin
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
 * Check if user can view Spirit Layer content
 * Per SOW Section 14.2: DM always sees, Players only if DM enables it
 * This is used for server-side filtering before sending data to client
 */
export async function canViewSpiritLayer(
  _userId: string,
  campaignId: string,
  campaignRole: CampaignRole
): Promise<boolean> {
  // DM always sees Spirit Layer
  if (isDM(campaignRole)) {
    return true;
  }

  // Check campaign settings for Spirit Layer visibility
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    return false;
  }

  // If Spirit Layer is not enabled, nobody except DM can see it
  if (!campaign.spiritLayerEnabled) {
    return false;
  }

  // TODO: Future enhancement - per-player Spirit Layer visibility
  // For now, if enabled globally, all non-spectators can see it
  return !isSpectator(campaignRole);
}

/**
 * Check if user can send chat messages
 * Per SOW Section 3.5: DM and Players can chat, Spectators cannot
 */
export function canSendChatMessages(campaignRole: CampaignRole): boolean {
  return isDM(campaignRole) || isPlayer(campaignRole);
}

/**
 * Check if user can roll dice
 * Per SOW Section 3.5: DM and Players can roll, Spectators cannot
 */
export function canRollDice(campaignRole: CampaignRole): boolean {
  return isDM(campaignRole) || isPlayer(campaignRole);
}

/**
 * Check if user can delete chat messages
 * Per SOW Section 5.7: Only DM can delete messages
 */
export function canDeleteMessages(campaignRole: CampaignRole, platformRole: PlatformRole): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can export campaign data
 * Per SOW Section 13.1: Campaign owner (DM) and Admin
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
