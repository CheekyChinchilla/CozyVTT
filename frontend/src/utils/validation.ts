// ============================================
// Validation Utilities
// ============================================

/** The longest address the email standards allow. */
export const MAX_EMAIL_LENGTH = 254;

/**
 * Whether `email` is shaped like an address: no whitespace, one `@` with
 * something before it, and a dot inside the domain, not at either end of it.
 *
 * The same check as validateEmail in backend/src/utils/validation.ts, written
 * the same way, and keepInStep.test.ts there fails if the two differ. It has
 * to accept every address an account already holds, since the sign-in page
 * will not send one it refuses.
 */
export function isValidEmail(email: string): boolean {
  if (typeof email !== 'string' || email.length > MAX_EMAIL_LENGTH) return false;
  if (/\s/.test(email)) return false;
  const at = email.indexOf('@');
  if (at < 1 || email.indexOf('@', at + 1) !== -1) return false;
  const domain = email.slice(at + 1);
  const dot = domain.indexOf('.', 1);
  return dot !== -1 && dot < domain.length - 1;
}

/**
 * Password rules shown as a live checklist on the pages where a password is
 * chosen, and the one rule every page checks by. These mirror
 * `validatePasswordStrength` in the backend exactly; keep them in step, or
 * the UI will accept passwords the server rejects. The quick check below
 * used to ask for twelve characters but no special character, while the
 * checklist asked for eight, so the pages disagreed with each other and
 * with the server.
 */
/**
 * The characters a password must contain one of: the server's list, which
 * does not count a space, ~, ` or a letter outside A-Z. Written the same as
 * in backend/src/utils/validation.ts, and keepInStep.test.ts there fails if
 * the two differ.
 */
export const SPECIAL_CHARACTER = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

export const PASSWORD_REQUIREMENTS: Array<{ test: (p: string) => boolean; label: string }> = [
  { test: (p) => p.length >= 12,         label: 'At least 12 characters' },
  { test: (p) => /[A-Z]/.test(p),        label: 'One uppercase letter' },
  { test: (p) => /[a-z]/.test(p),        label: 'One lowercase letter' },
  { test: (p) => /[0-9]/.test(p),        label: 'One number' },
  { test: (p) => SPECIAL_CHARACTER.test(p), label: 'One special character, such as ! @ # $ %' },
];

/** True when every rule in PASSWORD_REQUIREMENTS passes. */
export function meetsPasswordRequirements(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((r) => r.test(password));
}

/** The same rule under the name the register page and the setup wizard use. */
export function isStrongPassword(password: string): boolean {
  return meetsPasswordRequirements(password);
}

export function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (SPECIAL_CHARACTER.test(password)) score++;

  if (score <= 2) return { score, label: 'Weak', color: 'red' };
  if (score <= 4) return { score, label: 'Fair', color: 'orange' };
  if (score <= 5) return { score, label: 'Good', color: 'yellow' };
  return { score, label: 'Strong', color: 'green' };
}

export function validateDiceExpression(expression: string): boolean {
  // Basic dice notation validation (e.g., 2d6+3, 1d20, 4d6kh3)
  const diceRegex = /^(\d+)?d(\d+)(kh\d+|kl\d+|dl\d+)?([+\-*/]\d+)*$/i;
  return diceRegex.test(expression.replace(/\s/g, ''));
}
