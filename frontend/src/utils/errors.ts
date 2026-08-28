/**
 * Reading things off a caught error, without `any`.
 *
 * A `catch` binding is `unknown` under `strict` — anything can be thrown, so
 * TypeScript refuses to assume otherwise. The codebase used to sidestep that
 * with `catch (err: any)` in 71 places, which turned every subsequent property
 * access into an unchecked one: `err.response.data.message` compiled whether or
 * not any of those existed, and a typo in the chain failed silently at runtime
 * instead of loudly at build time.
 *
 * These accessors narrow properly and return `undefined` when the shape is not
 * there.
 *
 * ---------------------------------------------------------------------------
 * They deliberately do **not** take a fallback argument.
 * ---------------------------------------------------------------------------
 * Call sites use both `||` and `??` against these values, and the two differ
 * when the server sends an empty string — `?? 'Failed to save'` keeps the empty
 * message, `|| 'Failed to save'` replaces it. Folding the fallback in here would
 * silently pick one and change what some users see. Returning `undefined` lets
 * every call site keep the operator it already had.
 *
 * One deliberate narrowing: a value is only returned when it is actually of the
 * expected primitive type. If a server ever sent a non-string `message`, the old
 * code passed it straight to the UI (where an object would throw during render);
 * this yields `undefined` and the call site's fallback instead.
 */

/** An axios-shaped error body, as this API returns it. */
interface ApiErrorBody {
  message?: unknown;
  error?: unknown;
  validationErrors?: unknown;
}

function errorResponse(err: unknown): { status?: unknown; data?: ApiErrorBody } | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const response = (err as { response?: unknown }).response;
  if (!response || typeof response !== 'object') return undefined;
  return response as { status?: unknown; data?: ApiErrorBody };
}

/** `err.response.data.message` when it is a string. */
export function apiErrorMessage(err: unknown): string | undefined {
  const message = errorResponse(err)?.data?.message;
  return typeof message === 'string' ? message : undefined;
}

/**
 * `err.response.data.error` when it is a string.
 *
 * A second field rather than an alias for `message`: some endpoints send one and
 * some the other, and a few call sites check `error` first and fall back to
 * `message`, so they cannot be collapsed without changing which one wins.
 */
export function apiErrorText(err: unknown): string | undefined {
  const text = errorResponse(err)?.data?.error;
  return typeof text === 'string' ? text : undefined;
}

/** `err.response.status` when it is a number — used to branch on 401/403/409. */
export function apiErrorStatus(err: unknown): number | undefined {
  const status = errorResponse(err)?.status;
  return typeof status === 'number' ? status : undefined;
}

/** One entry from the backend's Zod validation report. */
export interface ApiValidationIssue {
  path: string;
  message: string;
  /** Zod's issue code, e.g. `invalid_type`. Present on the backend's report. */
  code?: string;
}

/**
 * `err.response.data.validationErrors` when it is an array.
 *
 * Entries are coerced to strings for display; the backend builds them from Zod
 * issues (`{ path, message, code }`), but this is the one error field whose
 * shape is assembled per route, so it is treated as untrusted.
 */
export function apiValidationIssues(err: unknown): ApiValidationIssue[] | undefined {
  const issues = errorResponse(err)?.data?.validationErrors;
  if (!Array.isArray(issues)) return undefined;
  return issues.map((issue) => {
    const record = issue && typeof issue === 'object' ? (issue as Record<string, unknown>) : {};
    return {
      path: typeof record.path === 'string' ? record.path : String(record.path ?? ''),
      message: typeof record.message === 'string' ? record.message : String(record.message ?? ''),
      ...(typeof record.code === 'string' ? { code: record.code } : {}),
    };
  });
}

/** `err.message` when the thrown value is a real Error, or carries a string message. */
export function errorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return undefined;
}
