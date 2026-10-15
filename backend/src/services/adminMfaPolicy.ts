import type { LogLevel } from '@prisma/client';
import { prisma } from '../config/database';
import logger from '../utils/logger';

/**
 * Administrator accounts must use two-factor authentication.
 *
 * The app said so (an admin could not turn MFA off) but never asked an admin
 * to turn it on, so an internet-facing admin account could rest on a password
 * alone. An administrator without MFA now has a deadline: 7 days from when
 * the account last became subject to the rule. That is the latest of when the
 * policy started on this instance, when the account was created, when it was
 * made an administrator, and when another administrator reset its MFA. Until
 * then the pages show a banner; after it the gate (middleware/adminMfa)
 * refuses everything but enrolment.
 *
 * Each of those moments but the account's creation is read from the admins'
 * activity log, where the admins already look, so no column is needed. When
 * the policy started: the first time it is needed, a line is written there,
 * and the earliest such line's time is the start, which gives an existing
 * instance a full week from the upgrade. A promotion and a Reset MFA are
 * written there as admin actions in any case; their rows carry a mark in
 * their context so the latest one for an account can be found. The start is
 * read once per process, and each account's latest mark once per process,
 * kept current by the writes made here.
 */

export const ADMIN_MFA_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** The activity-log line whose time is the policy's start on this instance. */
export const ADMIN_MFA_POLICY_MESSAGE = 'Administrator accounts must use two-factor authentication from this date; each administrator without it has 7 days to set it up';

/** The context field marking an activity-log row whose time starts the target's 7 days again. */
const GRACE_RESTART_MARK = 'restartsAdminMfaGrace';

let policyStart: Promise<Date> | null = null;
const graceRestarts = new Map<string, Promise<Date | null>>();

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

async function readGraceRestart(userId: string): Promise<Date | null> {
  const row = await prisma.systemLog.findFirst({
    where: {
      AND: [
        { context: { path: ['targetUserId'], equals: userId } },
        { context: { path: [GRACE_RESTART_MARK], equals: true } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

/**
 * When an administrator's action last made the account subject to the rule
 * afresh, or null when none has; read once per process.
 */
function latestGraceRestart(userId: string): Promise<Date | null> {
  let cached = graceRestarts.get(userId);
  if (!cached) {
    cached = readGraceRestart(userId).catch((err: unknown) => {
      graceRestarts.delete(userId);
      throw err;
    });
    graceRestarts.set(userId, cached);
  }
  return cached;
}

/**
 * Write the activity-log line for an action that makes an account subject to
 * the rule afresh (another administrator reset its MFA; it was made an
 * administrator), marked so that its time starts the account's 7 days. The
 * action has already happened, so a failure to write is logged and swallowed,
 * as for every activity line; the account then keeps the deadline it had.
 */
export async function restartAdminMfaGrace(entry: {
  targetUserId: string;
  byUserId: string;
  level: LogLevel;
  message: string;
}): Promise<void> {
  try {
    const row = await prisma.systemLog.create({
      data: {
        level: entry.level,
        message: entry.message,
        userId: entry.byUserId,
        context: { targetUserId: entry.targetUserId, [GRACE_RESTART_MARK]: true },
      },
      select: { createdAt: true },
    });
    graceRestarts.set(entry.targetUserId, Promise.resolve(row.createdAt));
  } catch (err) {
    logger.error('Failed to write the activity log line that starts an administrator\'s two-factor deadline again', {
      err,
      targetUserId: entry.targetUserId,
    });
  }
}

/** Forget the cached start and restarts, so a test can move them. */
export function resetAdminMfaPolicyCache(): void {
  policyStart = null;
  graceRestarts.clear();
}

/**
 * When this account must have MFA on, or null when it need not (not an
 * administrator, or MFA already on).
 */
export async function adminMfaDeadline(user: {
  id: string;
  platformRole: string;
  mfaEnabled: boolean;
  createdAt: Date;
}): Promise<Date | null> {
  if (user.platformRole !== 'ADMIN' || user.mfaEnabled) return null;
  const [start, restart] = await Promise.all([adminMfaPolicyStart(), latestGraceRestart(user.id)]);
  const from = Math.max(start.getTime(), user.createdAt.getTime(), restart?.getTime() ?? 0);
  return new Date(from + ADMIN_MFA_GRACE_MS);
}

/**
 * Whether this account's deadline has passed, so that it may do nothing but
 * set MFA up: the question the REST gate (middleware/adminMfa) and the live
 * connection (websocket/auth) both ask. When the policy cannot be read the
 * answer is no, so a transient database error never locks every
 * administrator out.
 */
export async function pastAdminMfaDeadline(user: Parameters<typeof adminMfaDeadline>[0]): Promise<boolean> {
  let deadline: Date | null;
  try {
    deadline = await adminMfaDeadline(user);
  } catch (error) {
    logger.error('Error reading the administrator two-factor policy start', { err: error });
    return false;
  }
  return deadline !== null && deadline.getTime() <= Date.now();
}
