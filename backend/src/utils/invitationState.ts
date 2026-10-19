import type { Prisma } from '@prisma/client';

/**
 * Whether an invitation still stands: pending, and not past its expiry. One
 * past its expiry stays PENDING in the database (nothing sweeps them), and it
 * used to count as standing: the player was shown it and refused when they
 * accepted, the DM could not find them in the invite search, and inviting them
 * again answered that they already had a pending invitation.
 */
export function standingInvitation(now: Date = new Date()): Prisma.CampaignInvitationWhereInput {
  return { status: 'PENDING', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

export function isStanding(invitation: { status: string; expiresAt: Date | null }, now: Date = new Date()): boolean {
  return invitation.status === 'PENDING' && (invitation.expiresAt === null || invitation.expiresAt > now);
}
