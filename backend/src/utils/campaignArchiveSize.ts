/**
 * The largest campaign archive this server makes or takes.
 *
 * One number for both directions, so an export this server agrees to make is
 * one it, or another server on the defaults, will import. The import upload
 * is capped at it (routes/campaigns.ts), the startup warning sizes the proxy
 * for it (utils/proxyLimits.ts), and the bundled nginx's import location
 * allows a little more (a test compares the two).
 */
import { prisma } from '../config/database';

/** The import upload's own cap: 500 MB. The setting below can lower the limit, not raise it. */
export const CAMPAIGN_ARCHIVE_MAX_BYTES = 500 * 1024 * 1024;

/**
 * The archive limit in force: the instance's `campaignExportSizeLimit`
 * setting, which defaults to 500 MB and has no control in the admin panel,
 * and never more than the upload accepts.
 */
export async function getCampaignArchiveSizeLimit(): Promise<number> {
  const settings = await prisma.systemSettings.findFirst();
  return Math.min(settings?.campaignExportSizeLimit ?? CAMPAIGN_ARCHIVE_MAX_BYTES, CAMPAIGN_ARCHIVE_MAX_BYTES);
}

/** A size in whole megabytes, for a message. */
export function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
