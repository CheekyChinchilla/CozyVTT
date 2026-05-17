-- CreateEnum (idempotent)
DO $$ BEGIN
    CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CampaignInvitation" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "CampaignInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignInvitation_userId_status_idx" ON "CampaignInvitation"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignInvitation_userId_campaignId_key" ON "CampaignInvitation"("userId", "campaignId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "CampaignInvitation" ADD CONSTRAINT "CampaignInvitation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "CampaignInvitation" ADD CONSTRAINT "CampaignInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
