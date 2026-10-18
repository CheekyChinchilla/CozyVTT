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
import { cutText } from '../utils/cutText';

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

/**
 * A file name cut to at most `max` characters, keeping its extension, so a
 * name typed as the asset's own, or taken from a very long file name, stays
 * something every list can show.
 */
export function shortenFileName(name: string, max: number): string {
  if (name.length <= max) return name;
  const ext = path.extname(name);
  if (ext.length === 0 || ext.length > 20) return cutText(name, max);
  return `${cutText(name.slice(0, name.length - ext.length), max - ext.length)}${ext}`;
}

/**
 * The name an asset downloads under. multer reads an upload's file name as
 * latin1, so a name with accented letters is stored as its UTF-8 bytes, one
 * character each: "café.png" as "cafÃ©.png" (the TODO(upload) in
 * routes/assets.ts). Express 4 sent that name as those bytes, which browsers
 * read as UTF-8; Express 5 writes it out properly, so it is read back as UTF-8
 * here. A name that is not such a run of bytes, such as one stored in its
 * real letters, is returned as it is.
 */
export function downloadNameOf(stored: string): string {
  const codes = Array.from(stored, (c) => c.codePointAt(0) ?? 0);
  if (!codes.some((c) => c >= 0x80) || codes.some((c) => c > 0xff)) return stored;
  const bytes = Buffer.from(stored, 'latin1');
  const read = bytes.toString('utf8');
  return Buffer.from(read, 'utf8').equals(bytes) ? read : stored;
}
