-- Session 67: Change Asset.campaign onDelete from Cascade to SetNull
-- This prevents assets from being destroyed when a campaign is deleted.
-- Assets become "orphaned" (campaignId=null) but remain accessible to the uploader.

ALTER TABLE "Asset" DROP CONSTRAINT IF EXISTS "Asset_campaignId_fkey";

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
