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
