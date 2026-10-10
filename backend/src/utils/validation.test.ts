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
    const result = validatePasswordStrength('Str0ng!Passw0rd');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // Twelve, the same number every page that asks for a password shows. The
  // server accepted eight, so the API and the profile page took passwords
  // the setup wizard and the register page refused.
  it('rejects a password shorter than 12 characters', () => {
    const result = validatePasswordStrength('Str0ng!Pass');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at least 12 characters long');
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

  it('accepts a password with exactly 12 characters that meets all requirements', () => {
    const result = validatePasswordStrength('Abc1!xyzxyz!');
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

  it('accepts the addresses people actually use', () => {
    expect(validateEmail('first.last+campaign@mail.example.co.uk')).toBe(true);
    expect(validateEmail('o\'brien@example.ie')).toBe(true);
    expect(validateEmail('player@a.b.c.d.example.org')).toBe(true);
    expect(validateEmail('dm@example.photography')).toBe(true);
    expect(validateEmail('dm@xn--bcher-kva.example')).toBe(true);
    expect(validateEmail('DM@EXAMPLE.COM')).toBe(true);
  });

  // The sign-in page checks an address with the same rule before sending it,
  // so an address an account already holds has to keep passing.
  it('still accepts unusual addresses an existing account may hold', () => {
    expect(validateEmail('a@b..c')).toBe(true);
    expect(validateEmail('a@.b.c')).toBe(true);
    expect(validateEmail('a@b.c.')).toBe(true);
  });

  it('rejects more than one @, and a domain without a dot inside it', () => {
    expect(validateEmail('a@b@c.d')).toBe(false);
    expect(validateEmail('a@localhost')).toBe(false);
    expect(validateEmail('a@.com')).toBe(false);
    expect(validateEmail('a@com.')).toBe(false);
  });

  it('rejects any kind of whitespace', () => {
    expect(validateEmail('user@example.com\n')).toBe(false);
    expect(validateEmail('user\t@example.com')).toBe(false);
    expect(validateEmail('user@exam\u00a0ple.com')).toBe(false);
  });

  // 254 characters is the longest address the email standards allow.
  it('accepts an address of 254 characters and refuses one of 255', () => {
    const address = (length: number) => 'a'.repeat(64) + '@' + 'b'.repeat(length - 69) + '.com';
    expect(address(254)).toHaveLength(254);
    expect(validateEmail(address(254))).toBe(true);
    expect(validateEmail(address(255))).toBe(false);
  });

  it('answers a crafted 100,000-character address within 50 ms', () => {
    const crafted = 'a@' + '.'.repeat(100_000) + '@';
    const started = performance.now();
    expect(validateEmail(crafted)).toBe(false);
    expect(performance.now() - started).toBeLessThan(50);
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
