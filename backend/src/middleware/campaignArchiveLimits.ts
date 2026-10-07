/**
 * Limits on whole-campaign archives: previewing one, importing one and
 * exporting one.
 *
 * Each of these moves up to 500 MB through the one backend every table
 * shares, and any signed-in user can preview and import. So each user gets a
 * number of each an hour (20 unless CAMPAIGN_ARCHIVE_RATE_LIMIT says
 * otherwise), counted apart, and one archive at a time across all three. A DM
 * moving a campaign to another server previews it and imports it once or
 * twice; the ceiling is far above that and is there to stop a script.
 *
 * Asset uploads (pictures, audio, documents) and Universal VTT map imports
 * are not archives and are not counted here. They keep their own upload
 * limiter, ASSET_UPLOAD_RATE_LIMIT, so a DM setting up a campaign is not
 * slowed down.
 */

import rateLimit, { type RateLimitInfo } from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedRequest } from './rbac';
import logger from '../utils/logger';

export const DEFAULT_CAMPAIGN_ARCHIVE_RATE_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1000;

/**
 * How many of each archive operation one user may start in an hour, from
 * CAMPAIGN_ARCHIVE_RATE_LIMIT. A value that is not a whole number above zero
 * is ignored with a warning, never a failed start.
 */
export function resolveCampaignArchiveRateLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CAMPAIGN_ARCHIVE_RATE_LIMIT;
  if (raw === undefined || raw.trim() === '') return DEFAULT_CAMPAIGN_ARCHIVE_RATE_LIMIT;
  const parsed = Number(raw.trim());
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  logger.warn(
    `Invalid CAMPAIGN_ARCHIVE_RATE_LIMIT="${raw}" — expected a whole number above zero. ` +
      `Using the default of ${DEFAULT_CAMPAIGN_ARCHIVE_RATE_LIMIT} an hour.`
  );
  return DEFAULT_CAMPAIGN_ARCHIVE_RATE_LIMIT;
}

/** The signed-in user a request belongs to; these routes all require one. */
function callerKey(req: Request): string {
  return (req as AuthenticatedRequest).session?.userId ?? req.ip ?? 'anonymous';
}

/** What each operation is called in a refusal. */
const DONE = {
  preview: 'opened {n} campaign archives',
  import: 'imported {n} campaigns',
  export: 'exported {n} campaigns',
} as const;

export type CampaignArchiveOperation = keyof typeof DONE;

/** A per-user hourly limiter for one archive operation. */
export function createCampaignArchiveLimiter(operation: CampaignArchiveOperation, limit = resolveCampaignArchiveRateLimit()) {
  return rateLimit({
    windowMs: HOUR_MS,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: callerKey,
    handler: (req: Request, res: Response) => {
      const info = (req as Request & { rateLimit?: RateLimitInfo }).rateLimit;
      const minutes = info?.resetTime ? Math.max(1, Math.ceil((info.resetTime.getTime() - Date.now()) / 60_000)) : 60;
      res.status(429).json({
        error: 'Too Many Requests',
        message:
          `You have ${DONE[operation].replace('{n}', String(limit))} in the last hour, the most this server allows. ` +
          `Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      });
    },
  });
}

export const campaignPreviewLimiter = createCampaignArchiveLimiter('preview');
export const campaignImportLimiter = createCampaignArchiveLimiter('import');
export const campaignExportLimiter = createCampaignArchiveLimiter('export');

// ── One archive at a time ───────────────────────────────────────────────────

interface ArchiveSlot {
  key: string;
  /** The response has been sent, or the connection has gone. */
  closed: boolean;
  /** Work started under the slot that has not finished yet. */
  working: number;
  released: boolean;
}

const running = new Set<string>();
const slots = new WeakMap<Response, ArchiveSlot>();

function releaseWhenDone(slot: ArchiveSlot): void {
  if (slot.released || !slot.closed || slot.working > 0) return;
  slot.released = true;
  running.delete(slot.key);
}

/**
 * Let a user run one archive operation at a time, answering 429 to a second
 * while the first is going. The upload counts: a second archive cannot start
 * uploading while the first is still being sent.
 *
 * The slot is given back once the response has been sent or the caller has
 * gone, and any work started with `whileHoldingArchiveSlot` has finished, so a
 * caller who hangs up cannot start another while the first is still running.
 */
export function oneCampaignArchiveAtATime(req: Request, res: Response, next: NextFunction): void {
  const key = callerKey(req);
  if (running.has(key)) {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Another campaign import or export of yours is still running. Wait for it to finish, then try again.',
    });
    return;
  }
  running.add(key);
  const slot: ArchiveSlot = { key, closed: false, working: 0, released: false };
  slots.set(res, slot);
  const onDone = () => {
    slot.closed = true;
    releaseWhenDone(slot);
  };
  res.once('finish', onDone);
  res.once('close', onDone);
  next();
}

/**
 * Run an archive operation's work under the caller's slot, so the slot stays
 * taken until the work is done, even if the caller hangs up part-way.
 *
 * Returns undefined, without running `work`, when the caller had already gone
 * before it could start: there is nobody to answer, and an import nobody
 * hears about would only leave a campaign they may import again.
 */
export async function whileHoldingArchiveSlot<T>(res: Response, work: () => Promise<T>): Promise<T | undefined> {
  const slot = slots.get(res);
  if (slot?.released) return undefined;
  if (slot) slot.working += 1;
  try {
    return await work();
  } finally {
    if (slot) {
      slot.working -= 1;
      releaseWhenDone(slot);
    }
  }
}
