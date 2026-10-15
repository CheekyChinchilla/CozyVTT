-- Keep a creature when the account that made it is deleted, with no author.
--
-- CreatureTemplate.createdById had no foreign key, so deleting an account
-- left its homebrew creatures pointing at a user that no longer exists. It
-- now refers to the user and is set to null when the user is deleted, as
-- CharacterTemplate.createdById already is.
--
-- The key cannot be added while any row points at a missing user, so those
-- author ids are cleared first. Only ids that point at no user are touched;
-- every creature, and every author id that names a real account, is kept.
-- Safe to run twice: a second run finds nothing to clear, and the index and
-- key are made again only if they are missing.

-- Clear author ids of accounts already deleted
UPDATE "CreatureTemplate" SET "createdById" = NULL
WHERE "createdById" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = "CreatureTemplate"."createdById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreatureTemplate_createdById_idx" ON "CreatureTemplate"("createdById");

-- AddForeignKey
ALTER TABLE "CreatureTemplate" DROP CONSTRAINT IF EXISTS "CreatureTemplate_createdById_fkey";
ALTER TABLE "CreatureTemplate" ADD CONSTRAINT "CreatureTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
