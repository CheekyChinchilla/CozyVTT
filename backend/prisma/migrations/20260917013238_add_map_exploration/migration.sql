-- AlterTable
ALTER TABLE "Map" ADD COLUMN     "explorationEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "MapExploration" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "explored" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapExploration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapExploration_mapId_idx" ON "MapExploration"("mapId");

-- CreateIndex
CREATE UNIQUE INDEX "MapExploration_mapId_userId_key" ON "MapExploration"("mapId", "userId");

-- AddForeignKey
ALTER TABLE "MapExploration" ADD CONSTRAINT "MapExploration_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "Map"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapExploration" ADD CONSTRAINT "MapExploration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

