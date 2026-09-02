/**
 * The shapes a map token stores.
 *
 * These were declared inside `validators/tokenTemplates.ts` and used only there,
 * so a token *template* was validated while a token placed on a map was not:
 * `POST /maps/:id/tokens` did `hp: tokenData.hp || null` and wrote whatever
 * arrived straight into the JSON column. Anything at all could be stored, and
 * the sheet then rendered it — HP written in the character-sheet shape came out
 * as "8/undefined" on every reader.
 *
 * CLAUDE.md is explicit that validation is the real boundary, since types are
 * erased at runtime. One declaration here, imported by both.
 */

import { z } from 'zod';
import { NpcStatBlockSchema } from './statBlock';

/** How many squares a token occupies. */
export const TokenSizeSchema = z.object({
  width: z.number().int().min(1).max(10),
  height: z.number().int().min(1).max(10),
});

/**
 * A token's hit points.
 *
 * `{current, max, temp}` — deliberately not the character sheet's
 * `{current, maximum, temporary}`. They describe different things and every
 * token reader uses these names; the mismatch is exactly what went unnoticed.
 */
export const TokenHpSchema = z.object({
  current: z.number().int().min(0).max(99999),
  max: z.number().int().min(1).max(99999),
  temp: z.number().int().min(0).max(99999),
});

/**
 * Conditions on a token.
 *
 * Free text rather than an enum: a DM may track something the rules do not name,
 * and homebrew is not worth blocking. Bounded so the column cannot be used as
 * storage, and blanks dropped so an empty chip cannot appear on the map.
 */
export const TokenConditionsSchema = z
  .array(z.string().trim().min(1).max(60))
  .max(50)
  .transform((conditions) => conditions.filter((c) => c.length > 0));

/** Arbitrary per-token data. Bounded, since nothing reads it structurally. */
export const TokenMetadataSchema = z.record(z.string(), z.unknown()).refine(
  (value) => JSON.stringify(value).length <= 8000,
  { message: 'Token metadata is too large (8KB maximum)' }
);

/**
 * Check the JSON-valued fields of a token payload.
 *
 * Each field is optional, so a partial update is checked only on what it
 * actually carries. `null` is accepted for `hp` and `statBlock`, which is how
 * a token records having neither.
 *
 * Returns the parsed values rather than the raw ones, so callers store what the
 * schema produced — a trimmed condition list, for instance — instead of what
 * arrived.
 */
export type TokenShapes = {
  hp?: z.infer<typeof TokenHpSchema> | null;
  size?: z.infer<typeof TokenSizeSchema>;
  conditions?: string[];
  metadata?: Record<string, unknown>;
  statBlock?: unknown;
};

export function validateTokenShapes(
  body: unknown
): { ok: true; value: TokenShapes } | { ok: false; message: string } {
  const payload = (body ?? {}) as Record<string, unknown>;
  const value: TokenShapes = {};

  const check = <T>(field: string, schema: z.ZodType<T>, nullable = false):
    | { failed: string }
    | { parsed: T | null | undefined } => {
    const raw = payload[field];
    if (raw === undefined) return { parsed: undefined };
    if (raw === null) {
      if (nullable) return { parsed: null };
      return { failed: `Token ${field} must not be null` };
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.length ? ` (${issue.path.join('.')})` : '';
      return { failed: `Invalid token ${field}${path}: ${issue?.message ?? 'invalid'}` };
    }
    return { parsed: result.data };
  };

  const hp = check('hp', TokenHpSchema, true);
  if ('failed' in hp) return { ok: false, message: hp.failed };
  value.hp = hp.parsed;

  const size = check('size', TokenSizeSchema);
  if ('failed' in size) return { ok: false, message: size.failed };
  if (size.parsed) value.size = size.parsed;

  const conditions = check('conditions', TokenConditionsSchema);
  if ('failed' in conditions) return { ok: false, message: conditions.failed };
  if (conditions.parsed) value.conditions = conditions.parsed;

  const metadata = check('metadata', TokenMetadataSchema);
  if ('failed' in metadata) return { ok: false, message: metadata.failed };
  if (metadata.parsed) value.metadata = metadata.parsed;

  const statBlock = check('statBlock', NpcStatBlockSchema, true);
  if ('failed' in statBlock) return { ok: false, message: statBlock.failed };
  value.statBlock = statBlock.parsed;

  return { ok: true, value };
}
