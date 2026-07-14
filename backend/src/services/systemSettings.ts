import { prisma } from '../config/database';

/**
 * System Settings Service
 * Manages system-wide configuration including setup wizard state
 * Initial Setup & Onboarding
 */

/**
 * Get system settings (creates default if not exists)
 */
export async function getSystemSettings() {
  // Read the canonical (lowest-id) row deterministically. Without an explicit
  // order, findFirst can return different rows across calls if more than one
  // settings row was ever created by a create race on a fresh install — which
  // desynced the setup-complete flag between the wizard and the route guard.
  let settings = await prisma.systemSettings.findFirst({ orderBy: { id: 'asc' } });

  // Create default settings if none exist
  if (!settings) {
    settings = await prisma.systemSettings.create({
      data: {
        setupCompleted: false,
        instanceName: 'CozyVTT',
        timezone: 'UTC',
        allowRegistration: false,
        requireAdminApproval: true,
      },
    });
  }

  return settings;
}

/**
 * Check if setup wizard has been completed
 */
export async function isSetupCompleted(): Promise<boolean> {
  const settings = await getSystemSettings();
  return settings.setupCompleted;
}

/**
 * Mark setup as completed
 */
export async function markSetupCompleted(): Promise<void> {
  // Ensure a settings row exists, then mark every row complete. updateMany makes
  // this idempotent and self-healing even if a create race left more than one
  // settings row behind — all of them read as complete afterward.
  await getSystemSettings();
  await prisma.systemSettings.updateMany({ data: { setupCompleted: true } });
}

/**
 * Update system settings
 */
export async function getAppearanceSettings() {
  const settings = await getSystemSettings();
  return {
    themeId: settings.themeId,
    customThemeColors: settings.customThemeColors,
    fontId: settings.fontId,
    customLogoUrl: settings.customLogoUrl,
    customFaviconUrl: settings.customFaviconUrl,
    customMascotUrl: settings.customMascotUrl,
  };
}

export async function updateSystemSettings(data: {
  instanceName?: string;
  timezone?: string;
  allowRegistration?: boolean;
  requireAdminApproval?: boolean;
  themeId?: string;
  customThemeColors?: any;
  fontId?: string;
  customLogoUrl?: string | null;
  customFaviconUrl?: string | null;
  customMascotUrl?: string | null;
}) {
  const settings = await getSystemSettings();

  return await prisma.systemSettings.update({
    where: { id: settings.id },
    data,
  });
}

/**
 * Check if any users exist in the system
 */
export async function hasUsers(): Promise<boolean> {
  const count = await prisma.user.count();
  return count > 0;
}
