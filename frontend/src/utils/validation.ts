// ============================================
// Validation Utilities
// ============================================

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isStrongPassword(password: string): boolean {
  // At least 12 characters, 1 uppercase, 1 lowercase, 1 number
  if (password.length < 12) return false;

  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  return hasUpperCase && hasLowerCase && hasNumber;
}

/**
 * Password rules shown as a live checklist on the pages where a password is
 * chosen. These mirror `validatePasswordStrength` in the backend exactly — keep
 * them in step, or the UI will accept passwords the server rejects.
 */
export const PASSWORD_REQUIREMENTS: Array<{ test: (p: string) => boolean; label: string }> = [
  { test: (p) => p.length >= 8,          label: 'At least 8 characters' },
  { test: (p) => /[A-Z]/.test(p),        label: 'One uppercase letter' },
  { test: (p) => /[a-z]/.test(p),        label: 'One lowercase letter' },
  { test: (p) => /[0-9]/.test(p),        label: 'One number' },
  { test: (p) => /[^A-Za-z0-9]/.test(p), label: 'One special character' },
];

/** True when every rule in PASSWORD_REQUIREMENTS passes. */
export function meetsPasswordRequirements(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((r) => r.test(password));
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
  if (/[^A-Za-z0-9]/.test(password)) score++;

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
