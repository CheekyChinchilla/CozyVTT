/**
 * Helpers for reasoning about the request-body cap of whatever proxy sits in
 * front of CozyVTT.
 *
 * Upload limits are enforced by the app (MAX_<TYPE>_SIZE_MB), but a reverse
 * proxy can reject a large upload with a 413 long before Express sees it. The
 * bundled Nginx reads NGINX_MAX_BODY_SIZE; external proxies (Traefik, Caddy,
 * Cloudflare Tunnel, a host-level Nginx) have to be configured by hand, so we
 * warn about mismatches at startup instead of leaving users to guess.
 */

import { UPLOAD_LIMITS, MAX_UPLOAD_BYTES } from './fileUtils';
import { CAMPAIGN_ARCHIVE_MAX_BYTES } from './campaignArchiveSize';

const MB = 1024 * 1024;

/** Multipart overhead: field parts, boundaries, base64-safe headroom. */
export const UPLOAD_OVERHEAD_BYTES = 5 * MB;

/**
 * Cloudflare caps proxied request bodies at 100 MB on Free/Pro plans, and
 * cloudflared tunnels inherit that cap.
 */
export const CLOUDFLARE_BODY_LIMIT_BYTES = 100 * MB;

/**
 * Parse an Nginx-style size ("55M", "512k", "1G", "1048576") into bytes.
 * @returns bytes, or null when the value is missing or unparseable
 */
export function parseProxyBodySize(value?: string): number | null {
  if (!value) return null;

  const match = /^(\d+(?:\.\d+)?)\s*([kmg])?b?$/i.exec(value.trim());
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const multipliers: Record<string, number> = { k: 1024, m: MB, g: 1024 * MB };
  const unit = match[2]?.toLowerCase();

  return Math.round(amount * (unit ? multipliers[unit] : 1));
}

/** Body size a proxy must accept to let the largest configured upload through. */
export function getRequiredProxyBodyBytes(): number {
  return MAX_UPLOAD_BYTES + UPLOAD_OVERHEAD_BYTES;
}

/**
 * Body size a proxy must accept on /api/campaigns/import for the largest
 * campaign archive. The bundled nginx gives that path a location of its own
 * with more than this (a test compares the two), so NGINX_MAX_BODY_SIZE does
 * not have to cover it.
 */
export function getRequiredImportProxyBodyBytes(): number {
  return CAMPAIGN_ARCHIVE_MAX_BYTES + UPLOAD_OVERHEAD_BYTES;
}

/** How long a proxy should wait for an import to answer, in seconds, as the bundled nginx does. */
export const IMPORT_PROXY_TIMEOUT_SECONDS = 300;

const toMB = (bytes: number) => Math.ceil(bytes / MB);

/**
 * Build startup warnings about proxy body-size caps that would block uploads
 * and campaign imports. Pure and env-injectable so it can be unit tested.
 */
export function getProxyLimitWarnings(env: NodeJS.ProcessEnv = process.env): string[] {
  const warnings: string[] = [];
  const required = getRequiredProxyBodyBytes();
  const requiredMB = toMB(required);
  const largestType = (Object.keys(UPLOAD_LIMITS) as Array<keyof typeof UPLOAD_LIMITS>).find(
    (type) => UPLOAD_LIMITS[type] === MAX_UPLOAD_BYTES
  );
  const largest = `${largestType} (${toMB(MAX_UPLOAD_BYTES)} MB)`;

  const configured = parseProxyBodySize(env.NGINX_MAX_BODY_SIZE);

  if (env.NGINX_MAX_BODY_SIZE && configured === null) {
    warnings.push(
      `Invalid NGINX_MAX_BODY_SIZE="${env.NGINX_MAX_BODY_SIZE}" — expected an Nginx size such as "55M". ` +
        `Uploads may be rejected with HTTP 413 before reaching the API.`
    );
  } else if (configured !== null && configured < required) {
    warnings.push(
      `NGINX_MAX_BODY_SIZE=${env.NGINX_MAX_BODY_SIZE} is smaller than the largest upload limit ${largest}. ` +
        `Uploads will fail with HTTP 413 at Nginx. Set NGINX_MAX_BODY_SIZE=${requiredMB}M or larger in .env, then run ` +
        `\`docker compose up -d\` to apply it (\`docker compose restart\` does not read .env again).`
    );
  } else if (configured === null && MAX_UPLOAD_BYTES > 50 * MB) {
    warnings.push(
      `Largest upload limit is ${largest}. Any reverse proxy in front of CozyVTT must allow request bodies ` +
        `of at least ${requiredMB} MB (Nginx: client_max_body_size ${requiredMB}M) or uploads will fail with HTTP 413.`
    );
  }

  // With no NGINX_MAX_BODY_SIZE the bundled nginx is not in front, and
  // whatever is has to be told about the import path by hand. Only in
  // production: the development server's proxy has no limit to warn about.
  if (configured === null && env.NODE_ENV === 'production') {
    const importMB = toMB(getRequiredImportProxyBodyBytes());
    warnings.push(
      `Campaign imports accept archives up to ${toMB(CAMPAIGN_ARCHIVE_MAX_BYTES)} MB. Any reverse proxy in front of CozyVTT ` +
        `must allow request bodies of at least ${importMB} MB on /api/campaigns/import, and wait ` +
        `${IMPORT_PROXY_TIMEOUT_SECONDS} seconds there for an answer (Nginx: a location /api/campaigns/import with ` +
        `client_max_body_size ${importMB}M and proxy_read_timeout ${IMPORT_PROXY_TIMEOUT_SECONDS}s), or larger imports fail ` +
        `with HTTP 413 or 504. Behind Cloudflare, archives over 100 MB are refused at its edge whatever you set.`
    );
  }

  if (MAX_UPLOAD_BYTES > CLOUDFLARE_BODY_LIMIT_BYTES) {
    warnings.push(
      `Largest upload limit is ${largest}, above Cloudflare's 100 MB request-body cap on Free/Pro plans. ` +
        `If you serve CozyVTT through a Cloudflare Tunnel or the Cloudflare proxy, uploads above 100 MB will be ` +
        `rejected at Cloudflare's edge regardless of this setting.`
    );
  }

  return warnings;
}
