-- AddValue to CampaignStatus enum: INACTIVE
-- Session 62: Distinguishes "session paused (short break)" from "session ended (between sessions)"
ALTER TYPE "CampaignStatus" ADD VALUE 'INACTIVE';
