/**
 * The bodies of the sign-in, registration, password and MFA routes.
 *
 * These routes read fields that go straight into a password check or a
 * database lookup, and most of them can be called by anyone. Each field is
 * checked for being text and for a ceiling here, so a number or an object is
 * refused with a message naming the field, and the route never sees a value
 * it has to defend against. The refusal is always 400 `Validation Error` with
 * the first message, through `parseBody`.
 */

import { z } from 'zod';
import { MAX_EMAIL_LENGTH } from '../utils/validation';

/**
 * Longer than any password a person types, and short enough that hashing one
 * costs what hashing any password costs. Argon2 hashes any length, so without
 * a ceiling a megabyte of "password" would be hashed on every attempt.
 */
export const MAX_PASSWORD_LENGTH = 1024;

/** A reset or invitation link token: 64 hex characters, or a 36-character UUID from an older link. */
const MAX_TOKEN_LENGTH = 256;

/** A TOTP code or a backup code, with room for the dashes and spaces people type. */
const MAX_CODE_LENGTH = 64;

/** Required text, with a ceiling: missing or empty says so, anything else says it must be text. */
function text(label: string, max: number) {
  return z
    .string({ error: (issue) => (issue.input === undefined ? `${label} is required` : `${label} must be text`) })
    .min(1, { error: `${label} is required` })
    .max(max, { error: `${label} must be ${max} characters or fewer` });
}

const email = text('Email', MAX_EMAIL_LENGTH);
const password = (label: string) => text(label, MAX_PASSWORD_LENGTH);

export const LoginBodySchema = z.object({
  email,
  password: password('Password'),
  rememberMe: z.boolean({ error: 'rememberMe must be true or false' }).optional(),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;

/** The display name's own rule (length after trimming) is applied by `parseDisplayName` in the service. */
export const RegisterBodySchema = z.object({
  email,
  password: password('Password'),
  displayName: z.string({
    error: (issue) => (issue.input === undefined ? 'Display name is required' : 'Display name must be text'),
  }),
});

export const ForgotPasswordBodySchema = z.object({ email });

export const ResetPasswordBodySchema = z.object({
  token: text('Token', MAX_TOKEN_LENGTH),
  newPassword: password('New password'),
});

export const ChangePasswordBodySchema = z.object({
  currentPassword: password('Current password'),
  newPassword: password('New password'),
});

export const PasswordBodySchema = z.object({ password: password('Password') });

export const MfaVerifyBodySchema = z.object({ token: text('Verification code', MAX_CODE_LENGTH) });

export const MfaDisableBodySchema = z.object({
  password: password('Password'),
  token: text('Authentication code', MAX_CODE_LENGTH),
});

/**
 * The MFA step of a sign-in: a code or a backup code. Sending both is not
 * refused; a non-empty code is checked and the backup code ignored, as before.
 */
export const MfaVerifyLoginBodySchema = z
  .object({
    token: z.string({ error: 'The TOTP token and backup code must be strings' }).max(MAX_CODE_LENGTH).optional(),
    backupCode: z.string({ error: 'The TOTP token and backup code must be strings' }).max(MAX_CODE_LENGTH).optional(),
  })
  .refine((body) => (body.token ?? '') !== '' || (body.backupCode ?? '') !== '', {
    error: 'Either a TOTP token or backup code is required',
  });

/**
 * Parse a request body against one of the schemas above: the data, or the
 * first message to send back as 400 `Validation Error`.
 */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): { ok: true; data: T } | { ok: false; message: string } {
  const parsed = schema.safeParse(body);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid request' };
}
