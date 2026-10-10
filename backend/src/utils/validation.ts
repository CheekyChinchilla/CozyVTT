/**
 * Password validation utilities
 * Strong password requirements
 */

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * The characters a password must contain one of. The browser checks the same
 * pattern as the password is typed (frontend/src/utils/validation.ts), and
 * keepInStep.test.ts fails if the two differ.
 */
export const SPECIAL_CHARACTER = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

/**
 * Validates password strength
 * Requirements:
 * - Minimum 12 characters (the number every page that asks for a password
 *   shows and the API document states; the server took eight, so the API
 *   and the profile page accepted passwords the wizard and the register
 *   page refused)
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!SPECIAL_CHARACTER.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/** The longest address the email standards allow. */
export const MAX_EMAIL_LENGTH = 254;

/**
 * Whether `email` is shaped like an address: no whitespace, one `@` with
 * something before it, and a dot inside the domain, not at either end of it.
 * That is all it checks; whether the mailbox exists is for the mail server.
 *
 * The length is refused first, and the rest is plain string searching, so a
 * long crafted value costs no more than reading it once. The pattern this
 * replaces took minutes on one. The browser checks with the same function
 * (isValidEmail in frontend/src/utils/validation.ts), and keepInStep.test.ts
 * fails if the two differ.
 */
export function validateEmail(email: string): boolean {
  if (typeof email !== 'string' || email.length > MAX_EMAIL_LENGTH) return false;
  if (/\s/.test(email)) return false;
  const at = email.indexOf('@');
  if (at < 1 || email.indexOf('@', at + 1) !== -1) return false;
  const domain = email.slice(at + 1);
  const dot = domain.indexOf('.', 1);
  return dot !== -1 && dot < domain.length - 1;
}

/**
 * Sanitizes user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

/**
 * Whether a branding image URL points at this instance.
 *
 * The logo, mascot and favicon are replaced by swapping the files in
 * `frontend/public/` and rebuilding, so these only ever name a path this
 * instance serves. An address on another host is refused: it would have every
 * visitor's browser contact a third party before they sign in, and the app
 * page's Content-Security-Policy allows images from this origin only, so the
 * picture would not appear anyway.
 *
 * A single leading slash and no scheme. `//host/x` is rejected along with the
 * rest: the browser reads it as another origin, not as a path. So is any
 * backslash: browsers read `/\\host/x` the same way. So is any control
 * character: the URL parser strips tabs and newlines before it looks, so
 * `/<tab>/host/x` would become `//host/x` on the way in.
 */
export function isSameOriginPath(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/[\u0000-\u001f\u007f]/.test(value);
}
