import { prisma } from '../config/database';
import type { Prisma } from '@prisma/client';
import logger from '../utils/logger';

/**
 * System Settings Service
 * Manages system-wide configuration including setup wizard state
 * Initial Setup & Onboarding
 */

/** What a fresh instance's settings row holds. */
const DEFAULT_SETTINGS = {
  setupCompleted: false,
  instanceName: 'CozyVTT',
  timezone: 'UTC',
  allowRegistration: false,
  requireAdminApproval: true,
} as const;

/**
 * Get system settings (creates default if not exists)
 */
export async function getSystemSettings(db: Prisma.TransactionClient = prisma) {
  // Read the canonical (lowest-id) row deterministically. Without an explicit
  // order, findFirst can return different rows across calls if more than one
  // settings row was ever created by a create race on a fresh install — which
  // desynced the setup-complete flag between the wizard and the route guard.
  let settings = await db.systemSettings.findFirst({ orderBy: { id: 'asc' } });

  // Create default settings if none exist
  if (!settings) {
    settings = await db.systemSettings.create({ data: DEFAULT_SETTINGS });
  }

  return settings;
}

/**
 * Mark setup as completed
 */
export async function markSetupCompleted(db: Prisma.TransactionClient = prisma): Promise<void> {
  // Ensure a settings row exists, then mark every row complete. updateMany makes
  // this idempotent and self-healing even if a create race left more than one
  // settings row behind — all of them read as complete afterward.
  await getSystemSettings(db);
  await db.systemSettings.updateMany({ data: { setupCompleted: true } });
}

/**
 * The wizard's last step, inside the transaction that creates the
 * administrator: apply its settings and mark setup complete together, so a
 * failure in either leaves the instance exactly as it was.
 */
export async function completeSetupInTransaction(
  tx: Prisma.TransactionClient,
  settings: { instanceName?: string; timezone?: string; allowRegistration?: boolean }
): Promise<void> {
  await getSystemSettings(tx);
  await tx.systemSettings.updateMany({ data: { ...settings, setupCompleted: true } });
}

/**
 * Where the instance stands with setup: the gate, the status route and the
 * wizard all read this one answer.
 *
 * An instance whose administrator exists while setup is unmarked is one an
 * older version left half done, failing between creating the account and
 * marking setup complete; nothing else creates an account before setup has
 * run. It is finished here, once, so that administrator can sign in.
 */
export async function setupState(): Promise<{ setupCompleted: boolean; hasUsers: boolean }> {
  const settings = await getSystemSettings();
  if (settings.setupCompleted) return { setupCompleted: true, hasUsers: true };

  const users = await prisma.user.count();
  if (users > 0 && (await prisma.user.count({ where: { platformRole: 'ADMIN' } })) > 0) {
    await markSetupCompleted();
    logger.warn('Setup had created the administrator but was never marked complete; marked it complete so they can sign in.');
    return { setupCompleted: true, hasUsers: true };
  }
  return { setupCompleted: false, hasUsers: users > 0 };
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
  // A `Json?` column: a map of theme token names to colour strings.
  //
  // Deliberately not `| null`. Prisma wants `Prisma.DbNull` rather than a plain
  // `null` for a nullable Json column, so passing `null` here fails at runtime.
  //
  // This does not *prevent* that: the only caller, admin.ts, assigns straight
  // from `req.body`, so a null can still arrive from a request and still throw.
  // Closing that needs validation at the route, which is its own change. What
  // the type does is stop new code being written against a signature that
  // advertises a value Prisma will reject.
  customThemeColors?: Record<string, string>;
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

