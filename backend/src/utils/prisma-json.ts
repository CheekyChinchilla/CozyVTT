/**
 * prisma-json.ts
 * Bridges validated payloads into Prisma's JSON column types, and reads them
 * back out again.
 *
 * Zod produces object types whose optional properties are `T | undefined`,
 * which Prisma's InputJsonValue does not accept even though the value
 * serialises fine — `undefined` keys simply vanish. The write helpers make that
 * conversion explicit and one-line rather than scattering casts through routes.
 *
 * The read helpers exist for the same reason in the other direction: Prisma
 * types a JSON column as `JsonValue`, which matches none of the shapes this app
 * stores, so call sites reached for `as any` to get at them.
 *
 * ---------------------------------------------------------------------------
 * The read helpers assert exactly what those casts asserted — no more.
 * ---------------------------------------------------------------------------
 * They deliberately do **not** validate. Each reproduces the
 * `Array.isArray(x) ? x : []` guard the call sites already used and then asserts
 * the element type, because that is what the previous code did. Validating here
 * would reject rows written by earlier versions of the app and turn a typing
 * change into a data migration — a self-hosted instance upgrading with years of
 * maps must keep loading them.
 *
 * What they buy is a single named place per shape. When a blob's structure is
 * eventually worth validating, there is one function to add it to rather than
 * sixty scattered assertions.
 */

import { Prisma } from '@prisma/client';
import type { Token } from '../websocket/shared';
import type { FogState, LightSource, WallSegment } from '../types/walls';

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Convert a validated value to a Prisma JSON input, mapping null/undefined to JSON null. */
export function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value == null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

/**
 * Convert a value that is known to be present into a Prisma JSON input.
 * Use where the schema guarantees the field exists (a required stat block).
 */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** What Prisma hands back from a `Json` column. */
type JsonColumn = Prisma.JsonValue | null | undefined;

/**
 * Read a JSON array column, falling back to empty.
 *
 * Anything that is not an array becomes `[]` — including `null`, which is what
 * a column holds before it is first written.
 *
 * The stored array is returned as-is rather than copied: several call sites
 * mutate it in place and write it back, which only works without a clone.
 */
function readArray<T>(value: JsonColumn): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Tokens on a map. */
export function readTokens(value: JsonColumn): Token[] {
  return readArray<Token>(value);
}

/** Wall and door segments on a map. */
export function readWallSegments(value: JsonColumn): WallSegment[] {
  return readArray<WallSegment>(value);
}

/** Light sources on a map. */
export function readLights(value: JsonColumn): LightSource[] {
  return readArray<LightSource>(value);
}

/**
 * A JSON array column whose elements have no declared shape — map annotations,
 * for instance. Elements come back as `unknown`, so a reader has to check what
 * it found.
 */
export function readJsonArray(value: JsonColumn): unknown[] {
  return readArray<unknown>(value);
}

/**
 * Fog of war for a map, or null when none has been drawn.
 *
 * Unlike the others this is an object rather than an array, and `null` is a
 * meaningful value: it means the map has no fog, which is different from fog
 * covering nothing.
 */
export function readFogState(value: JsonColumn): FogState | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as unknown as FogState)
    : null;
}

/**
 * A JSON object column as an indexable record, or null.
 *
 * For blobs with no declared shape — a character sheet, a saved session state,
 * a token's metadata. Values come back as `unknown`, so a reader has to check
 * what it found; that is the difference from the `as any` this replaces, which
 * let any property be read off any of them.
 */
export function readJsonObject(value: JsonColumn): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
