/**
 * Validation Utilities — Unit Tests
 */

import {
  validatePasswordStrength,
  validateEmail,
  sanitizeInput,
} from './validation';

// ============================================
// validatePasswordStrength
// ============================================

describe('validatePasswordStrength', () => {
  it('accepts a strong password', () => {
    const result = validatePasswordStrength('Str0ng!Pass');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = validatePasswordStrength('Ab1!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at least 8 characters long');
  });

  it('rejects a password with no uppercase letter', () => {
    const result = validatePasswordStrength('str0ng!pass');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one uppercase letter');
  });

  it('rejects a password with no lowercase letter', () => {
    const result = validatePasswordStrength('STR0NG!PASS');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one lowercase letter');
  });

  it('rejects a password with no number', () => {
    const result = validatePasswordStrength('StrongPass!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one number');
  });

  it('rejects a password with no special character', () => {
    const result = validatePasswordStrength('Str0ngPass1');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one special character');
  });

  it('accumulates multiple errors', () => {
    const result = validatePasswordStrength('weak');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it('accepts a password with exactly 8 characters that meets all requirements', () => {
    const result = validatePasswordStrength('Abc1!xyz');
    expect(result.valid).toBe(true);
  });

  it('accepts a password with all supported special characters', () => {
    const specials = '!@#$%^&*()_+-=[]{};\':"\\|,.<>/?';
    for (const char of specials) {
      const password = `Abcdef1${char}`;
      const result = validatePasswordStrength(password);
      expect(result.errors).not.toContain('Password must contain at least one special character');
    }
  });
});

// ============================================
// validateEmail
// ============================================

describe('validateEmail', () => {
  it('accepts standard email addresses', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('user.name+tag@domain.co.uk')).toBe(true);
    expect(validateEmail('user123@subdomain.example.org')).toBe(true);
  });

  it('rejects emails without @', () => {
    expect(validateEmail('notanemail')).toBe(false);
  });

  it('rejects emails without a domain', () => {
    expect(validateEmail('user@')).toBe(false);
  });

  it('rejects emails without a local part', () => {
    expect(validateEmail('@example.com')).toBe(false);
  });

  it('rejects emails with spaces', () => {
    expect(validateEmail('user @example.com')).toBe(false);
    expect(validateEmail('user@ example.com')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(validateEmail('')).toBe(false);
  });
});

// ============================================
// sanitizeInput
// ============================================

describe('sanitizeInput', () => {
  it('trims leading and trailing whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
    expect(sanitizeInput('\t text \n')).toBe('text');
  });

  it('removes < and > characters', () => {
    expect(sanitizeInput('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });

  it('leaves safe characters intact', () => {
    expect(sanitizeInput('User Name')).toBe('User Name');
    expect(sanitizeInput('hello-world_123')).toBe('hello-world_123');
  });

  it('handles an empty string', () => {
    expect(sanitizeInput('')).toBe('');
  });

  it('handles strings with only whitespace', () => {
    expect(sanitizeInput('   ')).toBe('');
  });
});
