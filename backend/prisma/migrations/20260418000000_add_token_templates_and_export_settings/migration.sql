-- CreateTable: TokenTemplate
CREATE TABLE "TokenTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "type" TEXT NOT NULL DEFAULT 'object',
    "disposition" TEXT,
    "displayMode" TEXT NOT NULL DEFAULT 'pog',
    "size" JSONB NOT NULL DEFAULT '{"width":1,"height":1}',
    "notes" TEXT,
    "hp" JSONB,
    "showHpBar" BOOLEAN NOT NULL DEFAULT false,
    "statBlock" JSONB,
    "sightRadius" DOUBLE PRECISION,
    "createdById" TEXT,
    "campaignId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TokenTemplate_campaignId_idx" ON "TokenTemplate"("campaignId");

-- CreateIndex
CREATE INDEX "TokenTemplate_name_idx" ON "TokenTemplate"("name");

-- AddForeignKey
ALTER TABLE "TokenTemplate" ADD CONSTRAINT "TokenTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTemplate" ADD CONSTRAINT "TokenTemplate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: SystemSettings — add campaign export size limit
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "campaignExportSizeLimit" INTEGER NOT NULL DEFAULT 524288000;
