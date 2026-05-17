-- CreateEnum
CREATE TYPE "GameSystem" AS ENUM ('DND_5E', 'PATHFINDER_2E', 'SHADOWRUN_6E', 'CALL_OF_CTHULHU_7E');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "gameSystem" "GameSystem";

-- AlterTable
ALTER TABLE "Character" ADD COLUMN "gameSystem" "GameSystem";

-- CreateIndex
CREATE INDEX "Character_gameSystem_idx" ON "Character"("gameSystem");
