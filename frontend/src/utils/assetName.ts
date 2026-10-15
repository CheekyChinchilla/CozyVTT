import { ASSET_LIMITS } from '@/constants/assetLimits';

/**
 * A name for an upload made from other text, such as a file's name or a
 * character's: trimmed, and cut to the longest name the server keeps, so an
 * upload is never refused for the name the app gave it. A character whose two
 * halves would be split by the cut loses both.
 */
export function assetNameFrom(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= ASSET_LIMITS.maxNameLength) return trimmed;
  let end = ASSET_LIMITS.maxNameLength;
  const code = trimmed.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return trimmed.slice(0, end);
}
