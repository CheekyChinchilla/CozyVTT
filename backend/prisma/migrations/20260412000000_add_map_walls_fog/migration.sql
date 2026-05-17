-- AlterTable: Add wall segments, fog of war, and lighting toggle to Map
ALTER TABLE "Map" ADD COLUMN IF NOT EXISTS "wallSegments" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Map" ADD COLUMN IF NOT EXISTS "fogData" JSONB;
ALTER TABLE "Map" ADD COLUMN IF NOT EXISTS "lightingEnabled" BOOLEAN NOT NULL DEFAULT false;
