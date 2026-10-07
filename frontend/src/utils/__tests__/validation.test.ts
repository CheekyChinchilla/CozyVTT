import { describe, it, expect } from 'vitest';
import { isValidEmail, isStrongPassword, getPasswordStrength, validateDiceExpression, meetsPasswordRequirements } from '../validation';

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

  it('accepts the addresses people actually use', () => {
    expect(isValidEmail('first.last+campaign@mail.example.co.uk')).toBe(true);
    expect(isValidEmail('o\'brien@example.ie')).toBe(true);
    expect(isValidEmail('player@a.b.c.d.example.org')).toBe(true);
    expect(isValidEmail('dm@example.photography')).toBe(true);
    expect(isValidEmail('DM@EXAMPLE.COM')).toBe(true);
  });

  // The sign-in page refuses to send an address this rejects, so an address
  // an account already holds has to keep passing.
  it('still accepts unusual addresses an existing account may hold', () => {
    expect(isValidEmail('a@b..c')).toBe(true);
    expect(isValidEmail('a@b.c.')).toBe(true);
  });

  it('rejects more than one @, and a domain without a dot inside it', () => {
    expect(isValidEmail('a@b@c.d')).toBe(false);
    expect(isValidEmail('a@localhost')).toBe(false);
    expect(isValidEmail('a@.com')).toBe(false);
  });

  it('accepts an address of 254 characters and refuses one of 255, as the server does', () => {
    const address = (length: number) => 'a'.repeat(64) + '@' + 'b'.repeat(length - 69) + '.com';
    expect(address(254)).toHaveLength(254);
    expect(isValidEmail(address(254))).toBe(true);
    expect(isValidEmail(address(255))).toBe(false);
  });

  it('answers a crafted 100,000-character address within 50 ms', () => {
    const crafted = 'a@' + '.'.repeat(100_000) + '@';
    const started = performance.now();
    expect(isValidEmail(crafted)).toBe(false);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

// ============================================
// isStrongPassword
// ============================================

describe('isStrongPassword', () => {
  it('accepts a password meeting all requirements', () => {
    expect(isStrongPassword('SecurePass123!')).toBe(true);
    expect(isStrongPassword('MyP@ssw0rd!!')).toBe(true);
  });

  // The server has always required one; this check did not, so a password
  // the wizard and the register page accepted was then refused by the server.
  it('rejects passwords without a special character, as the server does', () => {
    expect(isStrongPassword('SecurePass123')).toBe(false);
  });

  // The server counts only the ASCII punctuation it lists as special. A
  // character outside that list turned every checklist item green, and the
  // server then refused the password.
  it.each(['Password1234~', 'Password1234 ', 'Pässwort12345', 'Password1234`'])(
    'rejects %j, whose only candidate for a special character the server does not count',
    (password) => {
      expect(isStrongPassword(password)).toBe(false);
    }
  );

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
    expect(isStrongPassword('Abc123Abc12!')).toBe(true);
  });
});

describe('PASSWORD_REQUIREMENTS', () => {
  it('asks for twelve characters, like the quick check and the server', () => {
    expect(meetsPasswordRequirements('Abc123Abc1!')).toBe(false);
    expect(meetsPasswordRequirements('Abc123Abc12!')).toBe(true);
  });

  it('is the quick check, rule for rule', () => {
    for (const p of ['Abc123Abc12!', 'Abc123Abc1!', 'abc123abc12!', 'ABC123ABC12!', 'Abcdefghijk!', 'Abc123Abc123']) {
      expect(meetsPasswordRequirements(p)).toBe(isStrongPassword(p));
    }
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
