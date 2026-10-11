/**
 * The sign-in request bodies, checked at the boundary.
 *
 * Each schema here stands between a request and a password check or a
 * database lookup. A field that is not text is refused with a plain message
 * naming the field, and every text field has a ceiling, so the hashing and the
 * lookups only ever see strings of a sensible size.
 */

import {
  LoginBodySchema,
  ForgotPasswordBodySchema,
  ResetPasswordBodySchema,
  MfaVerifyLoginBodySchema,
  parseBody,
  MAX_PASSWORD_LENGTH,
} from '../auth';

describe('parseBody', () => {
  it('returns the data when the body fits', () => {
    expect(parseBody(LoginBodySchema, { email: 'A@B.co', password: 'pw', rememberMe: true })).toEqual({
      ok: true,
      data: { email: 'A@B.co', password: 'pw', rememberMe: true },
    });
  });

  it('names the missing field', () => {
    expect(parseBody(LoginBodySchema, { password: 'pw' })).toEqual({ ok: false, message: 'Email is required' });
    expect(parseBody(LoginBodySchema, { email: 'a@b.co', password: '' })).toEqual({ ok: false, message: 'Password is required' });
  });

  it('names a field that is not text', () => {
    expect(parseBody(LoginBodySchema, { email: {}, password: 'pw' })).toEqual({ ok: false, message: 'Email must be text' });
    expect(parseBody(ForgotPasswordBodySchema, { email: 42 })).toEqual({ ok: false, message: 'Email must be text' });
  });

  it('refuses a body that is not an object', () => {
    expect(parseBody(LoginBodySchema, 'email=a@b.co').ok).toBe(false);
    expect(parseBody(LoginBodySchema, null).ok).toBe(false);
  });
});

describe('field ceilings', () => {
  it('caps the email at 254 characters and the password well above any real one', () => {
    expect(parseBody(LoginBodySchema, { email: `${'a'.repeat(250)}@b.co`, password: 'pw' })).toEqual({
      ok: false,
      message: 'Email must be 254 characters or fewer',
    });
    expect(parseBody(LoginBodySchema, { email: 'a@b.co', password: 'p'.repeat(MAX_PASSWORD_LENGTH) }).ok).toBe(true);
    expect(parseBody(LoginBodySchema, { email: 'a@b.co', password: 'p'.repeat(MAX_PASSWORD_LENGTH + 1) }).ok).toBe(false);
  });

  it('accepts rememberMe only as true or false', () => {
    expect(parseBody(LoginBodySchema, { email: 'a@b.co', password: 'pw', rememberMe: 'yes' }).ok).toBe(false);
    expect(parseBody(LoginBodySchema, { email: 'a@b.co', password: 'pw' }).ok).toBe(true);
  });

  it('bounds a reset link token', () => {
    expect(parseBody(ResetPasswordBodySchema, { token: 't'.repeat(257), newPassword: 'pw' }).ok).toBe(false);
    expect(parseBody(ResetPasswordBodySchema, { token: 'a-link', newPassword: 'pw' }).ok).toBe(true);
  });
});

describe('the MFA sign-in step', () => {
  it('needs a code or a backup code, as text', () => {
    expect(parseBody(MfaVerifyLoginBodySchema, {})).toEqual({ ok: false, message: 'Either a TOTP token or backup code is required' });
    expect(parseBody(MfaVerifyLoginBodySchema, { token: '', backupCode: '' }).ok).toBe(false);
    expect(parseBody(MfaVerifyLoginBodySchema, { token: 123456 })).toEqual({ ok: false, message: 'The TOTP token and backup code must be strings' });
    expect(parseBody(MfaVerifyLoginBodySchema, { token: '123456' }).ok).toBe(true);
    expect(parseBody(MfaVerifyLoginBodySchema, { backupCode: 'ABCD-EFGH' }).ok).toBe(true);
  });
});
