-- Keep a deleted account's dice rolls and uploaded files, with no owner.
--
-- Both columns were required, with foreign keys that refused to delete the
-- user, so deleting any account that had rolled a die or uploaded a file
-- failed. They become nullable and are set to null when the user is deleted,
-- as Message.userId already is. Nothing is dropped or rewritten: every
-- existing row keeps its value.

-- DropForeignKey
ALTER TABLE "Asset" DROP CONSTRAINT IF EXISTS "Asset_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "DiceRoll" DROP CONSTRAINT IF EXISTS "DiceRoll_userId_fkey";

-- AlterTable
ALTER TABLE "Asset" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DiceRoll" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiceRoll" ADD CONSTRAINT "DiceRoll_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
