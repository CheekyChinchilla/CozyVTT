import { z } from 'zod';

/**
 * Report the issues of the one union option that failed only its checks.
 *
 * A union whose every option fails reports one `invalid_union` issue, "Invalid
 * input", and keeps each option's own issues under `errors`. When exactly one
 * option was the right kind of value and failed only a check, such as a list
 * over its limit, that option's issues are the ones worth showing, with the
 * union's path put in front of theirs. zod did this itself until 4.6.6, where a
 * list over its `.max()` stops before its entries are read and the union counts
 * that as the wrong kind of value, so a sheet's `proficiencies` over 500 entries
 * came back as "Invalid input" where it had said "Can hold at most 500 entries".
 */
const CHECK_CODES: ReadonlySet<string> = new Set(['too_big', 'too_small', 'invalid_format', 'not_multiple_of', 'custom']);

export function surfaceUnionChecks(issues: readonly z.core.$ZodIssue[]): z.core.$ZodIssue[] {
  return issues.flatMap((issue) => {
    if (issue.code !== 'invalid_union') return [issue];
    const checked = issue.errors.filter((option) => option.every((inner) => CHECK_CODES.has(inner.code)));
    if (checked.length !== 1) return [issue];
    return surfaceUnionChecks(checked[0].map((inner) => ({ ...inner, path: [...issue.path, ...inner.path] })));
  });
}

/** The same error with every such union issue replaced by its option's issues. */
export function withUnionChecks(error: z.ZodError): z.ZodError {
  return new z.ZodError(surfaceUnionChecks(error.issues));
}
