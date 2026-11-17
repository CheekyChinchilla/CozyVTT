/**
 * How the API key settings word a key's permissions, use and expiry, and
 * what each expiry choice sends.
 */
import { describe, it, expect } from 'vitest';
import { effectiveLevel, expiresSoon, expiryFor, expiryText, lastUsedText, permissionSummary } from '../apiKeyFormat';

const NOW = Date.parse('2026-11-16T12:00:00.000Z');

describe('apiKeyFormat', () => {
  it('sums up a key\'s permissions', () => {
    expect(permissionSummary({})).toBe('No access');
    expect(permissionSummary({ maps: 'read' })).toBe('1 permission');
    expect(permissionSummary({ maps: 'read', notes: 'write' })).toBe('2 permissions');
    expect(permissionSummary({ '*': 'read' })).toBe('Everything: read');
    expect(permissionSummary({ '*': 'read', maps: 'write' })).toBe('Everything: read, 1 raised');
  });

  it('counts the "*" floor', () => {
    expect(effectiveLevel({ '*': 'read' }, 'maps')).toBe('read');
    expect(effectiveLevel({ '*': 'read', maps: 'write' }, 'maps')).toBe('write');
    expect(effectiveLevel({}, 'maps')).toBe('none');
  });

  it('sends an expiry for each choice, none for never, and leaves it out to keep it', () => {
    expect(expiryFor('30', NOW)).toBe('2026-12-16T12:00:00.000Z');
    expect(expiryFor('never', NOW)).toBeNull();
    expect(expiryFor('keep', NOW)).toBeUndefined();
  });

  it('words use and expiry', () => {
    expect(lastUsedText({ lastUsedAt: null })).toBe('Never used');
    expect(lastUsedText({ lastUsedAt: '2026-11-16T09:00:00.000Z' }, NOW)).toBe('Used 3 hours ago');
    expect(expiryText({ expiresAt: null, expired: false })).toBe('Never expires');
    // Midday, so the date is the same in every time zone the tests run in.
    expect(expiryText({ expiresAt: '2026-11-20T12:00:00.000Z', expired: false })).toBe('Expires Nov 20, 2026');
    expect(expiryText({ expiresAt: '2026-11-01T00:00:00.000Z', expired: true })).toMatch(/^Expired /);
    expect(expiresSoon({ expiresAt: '2026-11-20T00:00:00.000Z', expired: false }, NOW)).toBe(true);
    expect(expiresSoon({ expiresAt: '2027-11-20T00:00:00.000Z', expired: false }, NOW)).toBe(false);
    expect(expiresSoon({ expiresAt: '2026-11-01T00:00:00.000Z', expired: true }, NOW)).toBe(false);
  });
});
