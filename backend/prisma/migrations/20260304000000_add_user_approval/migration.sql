-- AddColumn: isApproved to User
-- Session 66 v2: Admin approval for new registrations

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isApproved" BOOLEAN NOT NULL DEFAULT true;
