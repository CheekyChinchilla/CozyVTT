-- AlterTable: Add appearance/theming fields to SystemSettings
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "themeId" TEXT NOT NULL DEFAULT 'cozy-default';
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "customThemeColors" JSONB;
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "fontId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "customLogoUrl" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "customFaviconUrl" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "customMascotUrl" TEXT;
