/**
 * A walk over a character sheet schema, for the tests that fail when a kind of
 * value on a sheet goes without its limit: a string without a length limit, a
 * list without a count limit.
 *
 * It throws on a kind of schema it does not know, so a new kind used in a
 * sheet is taught here before the tests that rely on the walk can pass.
 */

import { z } from 'zod';

/**
 * Calls `visit` with every schema in `schema` and the path to it. `[]` follows
 * a list's entries, `|0` a union's first option, `{}` a record's values and
 * `{key}` its keys.
 */
export function walkSheetSchema(
  schema: z.ZodType,
  path: string,
  visit: (node: z.ZodType, at: string) => void
): void {
  visit(schema, path);
  if (schema instanceof z.ZodObject) {
    for (const [key, field] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
      walkSheetSchema(field, path ? `${path}.${key}` : key, visit);
    }
    return;
  }
  if (schema instanceof z.ZodArray) {
    walkSheetSchema(schema.element as z.ZodType, `${path}[]`, visit);
    return;
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) {
    walkSheetSchema(schema.unwrap() as z.ZodType, path, visit);
    return;
  }
  if (schema instanceof z.ZodUnion) {
    (schema.options as readonly z.ZodType[]).forEach((option, i) => walkSheetSchema(option, `${path}|${i}`, visit));
    return;
  }
  if (schema instanceof z.ZodPipe) {
    walkSheetSchema(schema.in as z.ZodType, path, visit);
    walkSheetSchema(schema.out as z.ZodType, path, visit);
    return;
  }
  if (schema instanceof z.ZodRecord) {
    walkSheetSchema(schema.keyType as z.ZodType, `${path}{key}`, visit);
    walkSheetSchema(schema.valueType as z.ZodType, `${path}{}`, visit);
    return;
  }
  if (
    schema instanceof z.ZodString ||
    schema instanceof z.ZodNumber ||
    schema instanceof z.ZodBoolean ||
    schema instanceof z.ZodEnum ||
    schema instanceof z.ZodLiteral ||
    schema instanceof z.ZodTransform ||
    schema instanceof z.ZodNull ||
    schema instanceof z.ZodUnknown
  ) {
    return;
  }
  throw new Error(`${path}: a kind of schema this walk does not know; teach it before trusting it`);
}

/** The path of every list in `schema` that has no maximum count. */
export function unboundedLists(schema: z.ZodType, path = ''): string[] {
  const found: string[] = [];
  walkSheetSchema(schema, path, (node, at) => {
    if (!(node instanceof z.ZodArray)) return;
    const capped = (node.def.checks ?? []).some(
      (check) => (check._zod.def as { check?: string }).check === 'max_length'
    );
    if (!capped) found.push(at);
  });
  return found;
}
