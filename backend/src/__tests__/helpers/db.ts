/**
 * Test Database Helpers
 *
 * Factory functions for creating and cleaning up test data.
 * All test entities use unique email prefixes to avoid conflicts
 * with existing data in the dev database.
 */

import { randomUUID } from 'crypto';
import { PrismaClient, PlatformRole, GameSystem } from '@prisma/client';
import { hashPassword } from '../../services/auth';

export const prisma = new PrismaClient();

// Shared plaintext password used across test helpers
export const TEST_PASSWORD = 'TestPass1!Cozy';

let emailCounter = 0;

/**
 * Generate a unique test email to avoid collisions between test runs.
 *
 * The millisecond alone is not enough: users are created several at once, and
 * jest runs files in parallel against one database. The counter separates
 * calls in this worker, the random part separates workers.
 */
export function testEmail(label: string): string {
  emailCounter += 1;
  return `test_${label}_${Date.now()}_${emailCounter}_${randomUUID().slice(0, 8)}@test.invalid`;
}

/**
 * Create a test user with a real argon2 password hash.
 * Defaults to USER role; pass role: 'ADMIN' for admin tests.
 */
export async function createTestUser(opts: {
  email?: string;
  displayName?: string;
  role?: PlatformRole;
  isApproved?: boolean;
  password?: string;
} = {}) {
  const passwordHash = await hashPassword(opts.password ?? TEST_PASSWORD);
  return prisma.user.create({
    data: {
      email: opts.email ?? testEmail('user'),
      displayName: opts.displayName ?? 'Test User',
      passwordHash,
      platformRole: opts.role ?? PlatformRole.USER,
      isApproved: opts.isApproved ?? true,
    },
  });
}

/**
 * Create a test campaign owned by the given user.
 */
export async function createTestCampaign(ownerId: string, opts: {
  name?: string;
  gameSystem?: GameSystem | null;
} = {}) {
  return prisma.campaign.create({
    data: {
      name: opts.name ?? `Test Campaign ${Date.now()}`,
      ownerId,
      gameSystem: opts.gameSystem ?? null,
      vibeSettings: {},
    },
  });
}

/**
 * Delete a list of users by ID (cascades to memberships, characters, etc.)
 */
export async function cleanupUsers(ids: string[]): Promise<void> {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

/**
 * Delete a list of campaigns by ID.
 */
export async function cleanupCampaigns(ids: string[]): Promise<void> {
  await prisma.campaign.deleteMany({ where: { id: { in: ids } } });
}
