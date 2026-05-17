/**
 * Auth Service — Unit Tests
 *
 * Tests pure cryptographic functions that have no database dependency:
 * hashPassword, verifyPassword, sanitizeUser.
 *
 * registerUser and authenticateUser are covered by the auth e2e integration tests.
 */

import { hashPassword, verifyPassword, sanitizeUser } from './auth';
import { User, PlatformRole } from '@prisma/client';

// ============================================
// hashPassword / verifyPassword
// ============================================

describe('hashPassword', () => {
  it('produces a non-empty string', async () => {
    const hash = await hashPassword('TestPass1!');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('produces a different hash each call (salting)', async () => {
    const hash1 = await hashPassword('TestPass1!');
    const hash2 = await hashPassword('TestPass1!');
    expect(hash1).not.toBe(hash2);
  });

  it('produces a hash that does not contain the original password', async () => {
    const password = 'SuperSecret99!';
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
  });
});

describe('verifyPassword', () => {
  it('returns true for a correct password', async () => {
    const password = 'CorrectPass1!';
    const hash = await hashPassword(password);
    expect(await verifyPassword(hash, password)).toBe(true);
  });

  it('returns false for an incorrect password', async () => {
    const hash = await hashPassword('CorrectPass1!');
    expect(await verifyPassword(hash, 'WrongPass1!')).toBe(false);
  });

  it('returns false for an empty password', async () => {
    const hash = await hashPassword('SomePass1!');
    expect(await verifyPassword(hash, '')).toBe(false);
  });

  it('returns false for a malformed hash string', async () => {
    expect(await verifyPassword('not-a-valid-hash', 'SomePass1!')).toBe(false);
  });
});

// ============================================
// sanitizeUser
// ============================================

describe('sanitizeUser', () => {
  const mockUser: User = {
    id: 'user-001',
    email: 'alice@example.com',
    displayName: 'Alice',
    passwordHash: '$argon2id$v=19$test-hash-value',
    platformRole: PlatformRole.USER,
    mfaEnabled: false,
    mfaSecret: 'JBSWY3DPEHPK3PXP',
    mfaBackupCodes: ['code1', 'code2'],
    bio: null,
    avatarUrl: null,
    isApproved: true,
    mustChangePassword: false,
    globalAssetManager: false,
    rememberMe: false,
    preferences: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('removes passwordHash from the returned object', () => {
    const sanitized = sanitizeUser(mockUser);
    expect('passwordHash' in sanitized).toBe(false);
  });

  it('removes mfaSecret from the returned object', () => {
    const sanitized = sanitizeUser(mockUser);
    expect('mfaSecret' in sanitized).toBe(false);
  });

  it('removes mfaBackupCodes from the returned object', () => {
    const sanitized = sanitizeUser(mockUser);
    expect('mfaBackupCodes' in sanitized).toBe(false);
  });

  it('preserves non-sensitive fields', () => {
    const sanitized = sanitizeUser(mockUser);
    expect(sanitized.id).toBe('user-001');
    expect(sanitized.email).toBe('alice@example.com');
    expect(sanitized.displayName).toBe('Alice');
    expect(sanitized.platformRole).toBe(PlatformRole.USER);
  });

  it('does not mutate the original user object', () => {
    sanitizeUser(mockUser);
    expect(mockUser.passwordHash).toBeDefined();
    expect(mockUser.mfaSecret).toBeDefined();
    expect(mockUser.mfaBackupCodes).toBeDefined();
  });
});
