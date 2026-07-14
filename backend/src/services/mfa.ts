/**
 * MFA (Multi-Factor Authentication) Service
 * Multi-Factor Authentication Flow
 *
 * TOTP-based MFA with single-use backup codes.
 * Uses speakeasy for TOTP generation/verification and qrcode for QR code generation.
 * Backup codes are hashed with Argon2 before storage.
 *
 * Note: This service is not currently wired into the active MFA route handlers
 * (which live in routes/auth.ts). It is available for future route refactoring.
 */

import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { hashPassword, verifyPassword } from './auth';

/**
 * Generate a TOTP secret for MFA setup.
 * Returns the secret object with base32-encoded secret and otpauth URL.
 */
export function generateMfaSecret(email: string): { secret: string; otpauthUrl: string } {
  const generated = speakeasy.generateSecret({
    name: `CozyVTT (${email})`,
    issuer: 'CozyVTT',
    length: 20,
  });

  return {
    secret: generated.base32,
    otpauthUrl: generated.otpauth_url!,
  };
}

/**
 * Generate a QR code data URL from an otpauth URL.
 * The data URL can be rendered directly in an <img> tag.
 */
export async function generateQrCode(otpauthUrl: string): Promise<string> {
  return await QRCode.toDataURL(otpauthUrl);
}

/**
 * Verify a 6-digit TOTP token against a base32 secret.
 * 30-second window, allow 1 window before/after for clock drift.
 */
export function verifyTotpToken(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 1,
  });
}

/**
 * Generate random backup codes.
 * 10 single-use codes generated during MFA setup.
 * Each code is 8 alphanumeric characters, formatted as XXXX-XXXX for readability.
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes ambiguous chars (I, O, 0, 1)

  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(8);
    let code = '';
    for (let j = 0; j < 8; j++) {
      code += charset[bytes[j] % charset.length];
    }
    // Format as XXXX-XXXX for readability
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }

  return codes;
}

/**
 * Hash all backup codes with Argon2 for secure storage.
 * Codes are normalized (uppercase, hyphens removed) before hashing.
 */
export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  const normalized = codes.map((c) => c.replace(/-/g, '').toUpperCase());
  return await Promise.all(normalized.map((code) => hashPassword(code)));
}

/**
 * Verify a plaintext backup code against an array of hashed codes.
 * Returns the index of the matching code, or -1 if no match.
 * The caller should remove the matched code from storage after use.
 */
export async function verifyBackupCode(plainCode: string, hashedCodes: string[]): Promise<number> {
  const normalized = plainCode.replace(/-/g, '').toUpperCase();

  for (let i = 0; i < hashedCodes.length; i++) {
    const match = await verifyPassword(hashedCodes[i], normalized);
    if (match) {
      return i;
    }
  }

  return -1;
}
