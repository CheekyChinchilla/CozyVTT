-- CreateTable
CREATE TABLE "CreatureTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gameSystem" "GameSystem",
    "source" TEXT NOT NULL DEFAULT 'custom',
    "challengeRating" TEXT,
    "creatureType" TEXT,
    "alignment" TEXT,
    "imageUrl" TEXT,
    "statBlock" JSONB NOT NULL,
    "size" JSONB NOT NULL DEFAULT '{"width":1,"height":1}',
    "disposition" TEXT NOT NULL DEFAULT 'hostile',
    "displayMode" TEXT NOT NULL DEFAULT 'pog',
    "createdById" TEXT,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatureTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreatureTemplate_gameSystem_idx" ON "CreatureTemplate"("gameSystem");

-- CreateIndex
CREATE INDEX "CreatureTemplate_source_idx" ON "CreatureTemplate"("source");

-- CreateIndex
CREATE INDEX "CreatureTemplate_campaignId_idx" ON "CreatureTemplate"("campaignId");

-- CreateIndex
CREATE INDEX "CreatureTemplate_name_idx" ON "CreatureTemplate"("name");

-- AddForeignKey
ALTER TABLE "CreatureTemplate" ADD CONSTRAINT "CreatureTemplate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
