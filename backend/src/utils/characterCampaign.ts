// ============================================
// Which characters are a campaign's
// ============================================

import { prisma } from '../config/database';

/**
 * Whether a character's owner is still a member of the campaign it names. A
 * member removed before removals took their characters out of the campaign
 * left characters naming it; those are the owner's alone.
 */
export async function ownerStillIn(ownerId: string, campaignId: string): Promise<boolean> {
  const owner = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId: ownerId, campaignId } },
    select: { userId: true },
  });
  return owner !== null;
}

/**
 * Whether a character is this campaign's: it names the campaign and its owner
 * is still a member. The REST routes and the live table both ask this. The
 * table used to ask whether any member's list of character ids held it, which
 * the assign route writes in a separate step and can disagree.
 */
export async function characterInCampaign(
  character: { userId: string; campaignId: string | null },
  campaignId: string
): Promise<boolean> {
  return character.campaignId === campaignId && (await ownerStillIn(character.userId, campaignId));
}

/**
 * Whether a user may read a character at all: its owner, or a member of the
 * campaign whose character it is. The character routes answer anyone else as
 * if it were not there, so an id cannot be tested for being real.
 */
export async function mayReadCharacter(
  character: { userId: string; campaignId: string | null },
  userId: string
): Promise<boolean> {
  if (character.userId === userId) return true;
  if (!character.campaignId) return false;
  const reader = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId, campaignId: character.campaignId } },
    select: { userId: true },
  });
  return reader !== null && (await ownerStillIn(character.userId, character.campaignId));
}
