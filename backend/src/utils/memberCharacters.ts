// ============================================
// A member's list of character ids, changed one statement at a time
// ============================================
//
// Each character a member has brought to a campaign is listed in their
// membership's `characterIds`, which the roster is built from. The routes
// read the list and wrote it back changed, so two changes close together lost
// one. These change it in one statement each, so concurrent changes to the
// same list all stand. Call them inside the transaction that changes the
// character's own campaign, after holding the character (holdCharacter).

import type { Prisma, PrismaClient } from '@prisma/client';

type Db = Prisma.TransactionClient | PrismaClient;

/** Lock a character's row for the rest of the transaction, and read its campaign as it stands. */
export async function holdCharacter(tx: Prisma.TransactionClient, characterId: string): Promise<{ campaignId: string | null } | null> {
  const rows = await tx.$queryRaw<Array<{ campaignId: string | null }>>`
    SELECT "campaignId" FROM "Character" WHERE id = ${characterId} FOR UPDATE`;
  return rows[0] ?? null;
}

/** List a character on a member's membership, once. */
export async function addToMemberCharacters(db: Db, userId: string, campaignId: string, characterId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "CampaignMembership"
    SET "characterIds" = array_append(array_remove("characterIds", ${characterId}::text), ${characterId}::text)
    WHERE "userId" = ${userId} AND "campaignId" = ${campaignId}`;
}

/** Take a character off one member's membership. */
export async function removeFromMemberCharacters(db: Db, userId: string, campaignId: string, characterId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "CampaignMembership"
    SET "characterIds" = array_remove("characterIds", ${characterId}::text)
    WHERE "userId" = ${userId} AND "campaignId" = ${campaignId}`;
}

/** Take a character off every membership that lists it, for a character that is going. */
export async function removeFromEveryMemberCharacters(db: Db, characterId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "CampaignMembership"
    SET "characterIds" = array_remove("characterIds", ${characterId}::text)
    WHERE ${characterId}::text = ANY("characterIds")`;
}
