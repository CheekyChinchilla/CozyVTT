// ============================================
// Upload size limits
//
// The server is authoritative: limits come from the MAX_*_SIZE_MB environment
// variables and are served by GET /api/config (see useServerConfigQuery).
// The constants below are only a fallback for when that response is not
// available yet — first paint, offline, or a backend older than the endpoint.
// They mirror the documented defaults in .env.example.
// ============================================

import { AssetType } from '@/types';
import type { ServerConfig, ServerUploadLimits } from '@/types';

const MB = 1024 * 1024;

/** Fallback limits in bytes. DOCUMENT/OTHER are not modelled server-side. */
export const DEFAULT_UPLOAD_LIMITS: Record<AssetType, number> = {
  [AssetType.MAP]: 50 * MB,
  [AssetType.TOKEN]: 5 * MB,
  [AssetType.AUDIO]: 20 * MB,
  [AssetType.AVATAR]: 2 * MB,
  [AssetType.DOCUMENT]: 10 * MB,
  [AssetType.OTHER]: 10 * MB,
};

/**
 * Resolve the limit (in bytes) for an asset type, preferring the server's
 * configuration and falling back to DEFAULT_UPLOAD_LIMITS.
 */
export function getUploadLimit(
  serverConfig: ServerConfig | undefined,
  type: AssetType
): number {
  const serverLimit = serverConfig?.uploadLimits?.[type as keyof ServerUploadLimits];
  return typeof serverLimit === 'number' && serverLimit > 0
    ? serverLimit
    : DEFAULT_UPLOAD_LIMITS[type];
}

/** Human-friendly limit, e.g. "20 MB" — whole numbers stay whole. */
export function formatUploadLimit(bytes: number): string {
  const mb = bytes / MB;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}
