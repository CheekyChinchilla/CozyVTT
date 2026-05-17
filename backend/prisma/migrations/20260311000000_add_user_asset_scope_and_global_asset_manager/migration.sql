-- Add USER value to AssetScope enum
ALTER TYPE "AssetScope" ADD VALUE 'USER';

-- Add globalAssetManager flag to User model
ALTER TABLE "User" ADD COLUMN "globalAssetManager" BOOLEAN NOT NULL DEFAULT false;
