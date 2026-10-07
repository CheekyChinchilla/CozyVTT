import { types } from 'util';
import winston from 'winston';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

/**
 * The longest string written whole. A longer one keeps half this many
 * characters from each end: the start of an error says what failed and the
 * end often says why, and a database error can quote a whole request body
 * between the two.
 */
const MAX_STRING_LENGTH = 8_000;

/** How far into nested metadata values are followed. */
const MAX_DEPTH = 8;

/**
 * An email address, matched in bounded pieces so a long run of text costs
 * linear time. The top-level domain must be letters, which keeps package
 * versions such as `socket.io@4.8.3` out of it.
 */
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{0,63}@((?:[A-Za-z0-9-]{1,63}\.){1,8}[A-Za-z]{2,63})/g;

/** Longer than any text EMAIL can match, so an address cut by `clip` is still masked. */
const EMAIL_MAX_LENGTH = 64 + 1 + 8 * 64 + 63;

/**
 * Cut every email address to its first letter and domain: `a***@example.com`.
 * Enough to tell which account a line is about, and nothing more stays in the
 * log files after that account is deleted.
 */
function maskEmails(text: string): string {
  return text.includes('@') ? text.replace(EMAIL, '$1***@$2') : text;
}

function clip(text: string): string {
  if (text.length <= MAX_STRING_LENGTH) return maskEmails(text);
  const keep = MAX_STRING_LENGTH / 2;
  const head = maskEmails(text.slice(0, keep + EMAIL_MAX_LENGTH)).slice(0, keep);
  const tail = maskEmails(text.slice(-(keep + EMAIL_MAX_LENGTH))).slice(-keep);
  return `${head} ... [${text.length - MAX_STRING_LENGTH} characters left out] ... ${tail}`;
}

/** Native errors from any realm, and anything built on Error. */
function isError(value: unknown): value is Error {
  return types.isNativeError(value) || value instanceof Error;
}

/** Only plain objects and arrays are copied; dates, buffers and the like are written as JSON writes them. */
function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/**
 * An error's fields as a plain object. Its name, message and stack are not
 * enumerable, so JSON would write the error itself as `{}`. Enumerable fields
 * such as a database error's `code` and `meta` come along too.
 */
function errorFields(error: Error): Record<string, unknown> {
  const fields: Record<string, unknown> = { name: error.name, message: error.message };
  const source = error as unknown as Record<string, unknown>;
  if ('code' in error) fields.code = source.code;
  for (const key of Object.keys(error)) fields[key] = source[key];
  if (error.cause !== undefined) fields.cause = error.cause;
  fields.stack = error.stack;
  return fields;
}

/**
 * A copy of a logged value that is safe to write: errors as their fields,
 * email addresses masked, long strings clipped. Objects are copied, never
 * changed, because the caller still holds them.
 */
function clean(value: unknown, depth: number, ancestors: Set<object>): unknown {
  if (typeof value === 'string') return clip(value);
  if (typeof value !== 'object' || value === null) return value;
  if (ancestors.has(value)) return '[Circular]';

  const error = isError(value);
  if (!error && !Array.isArray(value) && !isPlainObject(value)) return value;
  if (depth >= MAX_DEPTH) return '[Nested too deeply]';

  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((item: unknown) => clean(item, depth + 1, ancestors));
    const source = error ? errorFields(value) : (value as Record<string, unknown>);
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(source)) copy[key] = clean(source[key], depth + 1, ancestors);
    return copy;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Applied to every entry before any transport writes it. Callers log a caught
 * error as `{ err: error }` throughout the backend, and that has to come out
 * with its message and stack in the files and on the console alike.
 */
const sanitize = winston.format((info) => {
  const ancestors = new Set<object>();
  for (const key of Object.keys(info)) {
    info[key] = clean(info[key], 1, ancestors);
  }
  return info;
});

/**
 * Each production log file starts afresh at 10 MB and five are kept, so the
 * two files take about 100 MB between them at most. `tailable` keeps the
 * newest lines under the plain name (`combined.log`), with `combined1.log` the
 * next newest. The backend holds its files open, so it has to be what rotates
 * them: a host logrotate rule that renames a file leaves it writing there.
 */
const ROTATION = { maxsize: 10 * 1024 * 1024, maxFiles: 5, tailable: true };

const devFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}] ${message}${metaStr}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: combine(timestamp(), errors({ stack: true }), sanitize()),
  transports:
    process.env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error', format: json(), ...ROTATION }),
          new winston.transports.File({ filename: 'logs/combined.log', format: json(), ...ROTATION }),
          new winston.transports.Console({ format: combine(timestamp(), json()) }),
        ]
      : [
          new winston.transports.Console({
            format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), devFormat),
          }),
        ],
});

export default logger;
