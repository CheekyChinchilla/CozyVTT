import type { z } from 'zod';

/**
 * A refused request's problems as one message, each starting with the field
 * it is about: `statBlock.traits.0.description: Too big: ...`. The creature and
 * token template forms show it as it comes, and a stat block has dozens of
 * fields a bare "Too big" could be about.
 */
export function issueMessages(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length ? `${issue.path.map(String).join('.')}: ${issue.message}` : issue.message))
    .join('; ');
}
