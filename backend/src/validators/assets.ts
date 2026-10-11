/**
 * What an upload may say about itself, beside the file: its name,
 * description and tags.
 *
 * These are listed to every member of a campaign, or to everyone for a
 * global asset, so they are held to the limits the typed-document route
 * already has. A field sent twice arrives as a list and is refused.
 */

import path from 'path';
import { z } from 'zod';
import { ASSET_LIMITS } from './assetLimits';

export const MAX_ASSET_NAME_LENGTH = ASSET_LIMITS.maxNameLength;
const MAX_ASSET_DESCRIPTION_LENGTH = ASSET_LIMITS.maxDescriptionLength;
const MAX_ASSET_TAGS = ASSET_LIMITS.maxTags;
const MAX_ASSET_TAG_LENGTH = ASSET_LIMITS.maxTagLength;
/** The longest file name kept as the asset's original name: what a file system allows in one name. */
export const MAX_ORIGINAL_NAME_LENGTH = 255;

const text = (field: string) => z.string({ error: `Send the ${field} once, as text.` });

/** Comma-separated tags as one list: each trimmed, empty ones dropped, each kept once. */
const tagList = text('tags')
  .transform((raw) => [...new Set(raw.split(',').map((tag) => tag.trim()).filter(Boolean))])
  .pipe(
    z
      .array(z.string().max(MAX_ASSET_TAG_LENGTH, `Each tag must be ${MAX_ASSET_TAG_LENGTH} characters or fewer`))
      .max(MAX_ASSET_TAGS, `An asset can have at most ${MAX_ASSET_TAGS} tags`)
  );

export const UploadMetadataSchema = z.object({
  name: text('name')
    .trim()
    .max(MAX_ASSET_NAME_LENGTH, `The asset name must be ${MAX_ASSET_NAME_LENGTH} characters or fewer`)
    .optional(),
  description: text('description')
    .trim()
    .max(MAX_ASSET_DESCRIPTION_LENGTH, `The asset description must be ${MAX_ASSET_DESCRIPTION_LENGTH} characters or fewer`)
    .optional(),
  tags: tagList.optional(),
});

export interface UploadMetadata {
  /** Empty when none was given, and the file's own name is used. */
  name: string;
  description: string | null;
  tags: string[];
}

/** Read an upload's name, description and tags from its form fields. */
export function parseUploadMetadata(body: unknown): { ok: true; value: UploadMetadata } | { ok: false; message: string } {
  const parsed = UploadMetadataSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid upload details' };
  }
  return {
    ok: true,
    value: {
      name: parsed.data.name ?? '',
      description: parsed.data.description || null,
      tags: parsed.data.tags ?? [],
    },
  };
}

/** The first `max` UTF-16 units of `text`, without cutting a character in two. */
function cut(text: string, max: number): string {
  let end = Math.max(0, max);
  const code = text.charCodeAt(end - 1);
  if (end < text.length && code >= 0xd800 && code <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

/**
 * A file name cut to at most `max` characters, keeping its extension, so a
 * name typed as the asset's own, or taken from a very long file name, stays
 * something every list can show.
 */
export function shortenFileName(name: string, max: number): string {
  if (name.length <= max) return name;
  const ext = path.extname(name);
  if (ext.length === 0 || ext.length > 20) return cut(name, max);
  return `${cut(name.slice(0, name.length - ext.length), max - ext.length)}${ext}`;
}
