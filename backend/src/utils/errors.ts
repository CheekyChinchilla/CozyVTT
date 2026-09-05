/**
 * Reading things off a caught error, without `any`.
 *
 * A `catch` binding is `unknown` under `strict` — anything can be thrown, so
 * TypeScript refuses to assume otherwise. The backend used to sidestep that with
 * `catch (err: any)`, which made every subsequent property access unchecked.
 *
 * These accessors narrow properly and return `undefined` when the shape is not
 * there, so a caller decides what to do about it rather than reading a silent
 * `undefined` off an unchecked object.
 *
 * They deliberately do **not** take a fallback argument: call sites use both
 * `||` and `??` against these values, and those differ on an empty string.
 * Returning `undefined` lets each keep the operator it already had.
 */

/** `err.message` when the thrown value is a real Error, or carries a string message. */
export function errorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return undefined;
}

/**
 * `err.code` when it is a string.
 *
 * Node's filesystem errors (`ENOENT`, `EACCES`) and Prisma's known request
 * errors (`P2002` for a unique-constraint violation) both report this way, and
 * both are branched on in the routes.
 */
export function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/**
 * `err.stack` when present — for logging only.
 *
 * Duck-typed like `errorMessage` above rather than gated on `instanceof Error`.
 * Errors that have crossed a serialisation boundary, and those from libraries
 * with their own Error subclasses in a separate realm, carry a stack without
 * passing `instanceof` — and dropping a stack is exactly the wrong failure mode
 * for the one accessor that exists to help diagnose a problem.
 */
export function errorStack(err: unknown): string | undefined {
  if (err && typeof err === 'object') {
    const stack = (err as { stack?: unknown }).stack;
    if (typeof stack === 'string') return stack;
  }
  return undefined;
}

/**
 * `err.stderr` when present — what a failed `child_process` exec wrote.
 *
 * The admin backup/restore routes shell out to `pg_dump` and `psql`, and the
 * useful diagnostic is the tool's own stderr rather than the wrapper message
 * Node builds.
 */
export function errorStderr(err: unknown): string | undefined {
  if (err && typeof err === 'object') {
    const stderr = (err as { stderr?: unknown }).stderr;
    if (typeof stderr === 'string') return stderr;
  }
  return undefined;
}
