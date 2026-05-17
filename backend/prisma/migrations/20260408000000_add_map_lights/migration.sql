-- AlterTable: Add lights JSON field to Map (array of LightSource objects)
ALTER TABLE "Map" ADD COLUMN "lights" JSONB NOT NULL DEFAULT '[]';
