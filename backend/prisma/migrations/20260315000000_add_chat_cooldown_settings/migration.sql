-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "chatCooldownEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Campaign" ADD COLUMN "chatCooldownSeconds" INTEGER NOT NULL DEFAULT 5;
