/**
 * A refused sheet names the check a union option failed.
 *
 * A D&D 5e sheet's `proficiencies` is an object, or a list of names on sheets
 * stored by an older version. A list over its limit was reported as "Invalid
 * input" once zod stopped reading an oversized list before its entries, which
 * its union took for the wrong kind of value. The option's own message is
 * surfaced again, with the field's path in front.
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { surfaceUnionChecks, withUnionChecks } from '../unionIssues';

const shape = z.object({
  proficiencies: z.union([
    z.object({ armor: z.string().optional() }),
    z.array(z.string()).max(2, 'Can hold at most 2 entries'),
  ]),
});

const lines = (error: z.ZodError) =>
  withUnionChecks(error).issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

describe('a union option that failed only a check', () => {
  it('is reported under the field, with its own message', () => {
    const result = shape.safeParse({ proficiencies: ['a', 'b', 'c'] });
    expect(result.success).toBe(false);
    expect(lines(result.error!)).toEqual(['proficiencies: Can hold at most 2 entries']);
  });

  it('keeps the union issue when every option was the wrong kind of value', () => {
    const result = shape.safeParse({ proficiencies: 5 });
    expect(result.success).toBe(false);
    expect(withUnionChecks(result.error!).issues.map((issue) => issue.code)).toEqual(['invalid_union']);
  });

  it('keeps the union issue when two options failed checks', () => {
    const two = z.union([z.string().max(1, 'short'), z.string().regex(/^a/, 'starts with a')]);
    const result = two.safeParse('bb');
    expect(result.success).toBe(false);
    expect(surfaceUnionChecks(result.error!.issues).map((issue) => issue.code)).toEqual(['invalid_union']);
  });

  it('prefixes the option issue paths with the union path, through nesting', () => {
    const nested = z.object({
      sheet: z.object({
        rows: z.union([z.object({ kind: z.literal('none') }), z.array(z.object({ name: z.string().max(3, 'long') }))]),
      }),
    });
    const result = nested.safeParse({ sheet: { rows: [{ name: 'abcd' }] } });
    expect(result.success).toBe(false);
    expect(lines(result.error!)).toEqual(['sheet.rows.0.name: long']);
  });

  it('leaves issues that are not from a union alone', () => {
    const result = z.object({ name: z.string().max(1, 'long') }).safeParse({ name: 'ab' });
    expect(result.success).toBe(false);
    expect(surfaceUnionChecks(result.error!.issues)).toEqual(result.error!.issues);
  });
});
