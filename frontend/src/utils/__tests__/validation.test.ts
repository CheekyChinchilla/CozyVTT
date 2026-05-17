import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  isStrongPassword,
  getPasswordStrength,
  validateDiceExpression,
} from '../validation';

// ============================================
// isValidEmail
// ============================================

describe('isValidEmail', () => {
  it('accepts valid email addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('user.name+tag@domain.co.uk')).toBe(true);
    expect(isValidEmail('alice123@sub.example.org')).toBe(true);
  });

  it('rejects addresses without @', () => {
    expect(isValidEmail('notanemail')).toBe(false);
  });

  it('rejects addresses without a domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects addresses without a local part', () => {
    expect(isValidEmail('@example.com')).toBe(false);
  });

  it('rejects addresses with spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
    expect(isValidEmail('user@ example.com')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });
});

// ============================================
// isStrongPassword
// ============================================

describe('isStrongPassword', () => {
  it('accepts a password meeting all requirements', () => {
    expect(isStrongPassword('SecurePass123')).toBe(true);
    expect(isStrongPassword('MyP@ssw0rd!!')).toBe(true);
  });

  it('rejects passwords shorter than 12 characters', () => {
    expect(isStrongPassword('Short1A')).toBe(false);
    expect(isStrongPassword('Sh0rtPass!')).toBe(false);
  });

  it('rejects passwords without an uppercase letter', () => {
    expect(isStrongPassword('alllowercase123')).toBe(false);
  });

  it('rejects passwords without a lowercase letter', () => {
    expect(isStrongPassword('ALLUPPERCASE123')).toBe(false);
  });

  it('rejects passwords without a number', () => {
    expect(isStrongPassword('NoNumbersHere!!!')).toBe(false);
  });

  it('accepts a password with exactly 12 characters meeting all rules', () => {
    expect(isStrongPassword('Abc123Abc123')).toBe(true);
  });
});

// ============================================
// getPasswordStrength
// ============================================

describe('getPasswordStrength', () => {
  it('rates a very short password as Weak', () => {
    const result = getPasswordStrength('ab');
    expect(result.label).toBe('Weak');
    expect(result.color).toBe('red');
  });

  it('rates a medium password as Fair', () => {
    // score 3-4: ≥8 chars + uppercase + lowercase
    const result = getPasswordStrength('Abcdefgh');
    expect(['Fair', 'Good']).toContain(result.label);
  });

  it('rates a strong password as Strong', () => {
    // Should achieve score > 5: length ≥16, upper, lower, number, special
    const result = getPasswordStrength('StrongPass123!@#$');
    expect(result.label).toBe('Strong');
    expect(result.color).toBe('green');
  });

  it('returns a numeric score', () => {
    const result = getPasswordStrength('Test');
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('increases score as complexity grows', () => {
    const weak = getPasswordStrength('abc');
    const stronger = getPasswordStrength('StrongPass123!@#$');
    expect(stronger.score).toBeGreaterThan(weak.score);
  });
});

// ============================================
// validateDiceExpression
// ============================================

describe('validateDiceExpression', () => {
  it('accepts basic dice notation', () => {
    expect(validateDiceExpression('1d20')).toBe(true);
    expect(validateDiceExpression('2d6')).toBe(true);
    expect(validateDiceExpression('d8')).toBe(true);
  });

  it('accepts dice with modifiers', () => {
    expect(validateDiceExpression('1d20+5')).toBe(true);
    expect(validateDiceExpression('2d6-2')).toBe(true);
    expect(validateDiceExpression('1d8+3')).toBe(true);
  });

  it('accepts keep-highest notation', () => {
    expect(validateDiceExpression('4d6kh3')).toBe(true);
    expect(validateDiceExpression('2d20kh1')).toBe(true);
  });

  it('accepts keep-lowest notation', () => {
    expect(validateDiceExpression('2d20kl1')).toBe(true);
  });

  it('accepts drop-lowest notation', () => {
    expect(validateDiceExpression('4d6dl1')).toBe(true);
  });

  it('handles whitespace gracefully', () => {
    expect(validateDiceExpression('1d20 + 5')).toBe(true);
    expect(validateDiceExpression('  2d6  ')).toBe(true);
  });

  it('rejects arbitrary text', () => {
    expect(validateDiceExpression('roll some dice')).toBe(false);
    expect(validateDiceExpression('2x6')).toBe(false);
    expect(validateDiceExpression('')).toBe(false);
  });
});
