import { prisma } from '../config/database';
import logger from '../utils/logger';

/**
 * Administrator accounts must use two-factor authentication.
 *
 * The app said so (an admin could not turn MFA off) but never asked an admin
 * to turn it on, so an internet-facing admin account could rest on a password
 * alone. An administrator without MFA now has a deadline: 7 days from when
 * the policy started on this instance, or from when the account was created,
 * whichever is later. Until then the pages show a banner; after it the gate
 * (middleware/adminMfa) refuses everything but enrolment.
 *
 * When the policy started is read from the admins' activity log: the first
 * time it is needed, a line is written there, and the earliest such line's
 * time is the start. That gives existing instances a full week from the
 * upgrade with no new column, and is visible to the admins where they already
 * look. The line is written once, on the instance's first request after the
 * upgrade, and read once per process.
 */

export const ADMIN_MFA_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** The activity-log line whose time is the policy's start on this instance. */
export const ADMIN_MFA_POLICY_MESSAGE = 'Administrator accounts must use two-factor authentication from this date; each administrator without it has 7 days to set it up';

let policyStart: Promise<Date> | null = null;

async function readOrRecordPolicyStart(): Promise<Date> {
  const existing = await prisma.systemLog.findFirst({
    where: { message: ADMIN_MFA_POLICY_MESSAGE },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  if (existing) return existing.createdAt;
  const recorded = await prisma.systemLog.create({
    data: { level: 'INFO', message: ADMIN_MFA_POLICY_MESSAGE },
    select: { createdAt: true },
  });
  logger.info('Administrator two-factor policy started; administrators without MFA have 7 days to set it up');
  return recorded.createdAt;
}

/** When the policy started on this instance, read once per process. */
export function adminMfaPolicyStart(): Promise<Date> {
  if (policyStart === null) {
    policyStart = readOrRecordPolicyStart().catch((err: unknown) => {
      // Read again next time; until then nobody is held to a date nobody knows.
      policyStart = null;
      throw err;
    });
  }
  return policyStart;
}

/** Forget the cached start, so a test can move it. */
export function resetAdminMfaPolicyCache(): void {
  policyStart = null;
}

/**
 * When this account must have MFA on, or null when it need not (not an
 * administrator, or MFA already on).
 */
export async function adminMfaDeadline(user: {
  platformRole: string;
  mfaEnabled: boolean;
  createdAt: Date;
}): Promise<Date | null> {
  if (user.platformRole !== 'ADMIN' || user.mfaEnabled) return null;
  const start = await adminMfaPolicyStart();
  const from = Math.max(start.getTime(), user.createdAt.getTime());
  return new Date(from + ADMIN_MFA_GRACE_MS);
}
