-- CreateTable
CREATE TABLE "CreatureFavorite" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creatureId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatureFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatureFavorite_campaignId_userId_creatureId_key" ON "CreatureFavorite"("campaignId", "userId", "creatureId");

-- CreateIndex
CREATE INDEX "CreatureFavorite_campaignId_userId_idx" ON "CreatureFavorite"("campaignId", "userId");

-- AddForeignKey
ALTER TABLE "CreatureFavorite" ADD CONSTRAINT "CreatureFavorite_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatureFavorite" ADD CONSTRAINT "CreatureFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatureFavorite" ADD CONSTRAINT "CreatureFavorite_creatureId_fkey" FOREIGN KEY ("creatureId") REFERENCES "CreatureTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
