import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatFileSize,
  formatCampaignStatus,
  formatRoleName,
  truncate,
  formatBackupCode,
} from '../format';

// ============================================
// formatDate
// ============================================

describe('formatDate', () => {
  it('formats a Date object', () => {
    // Use a fixed UTC date to avoid timezone sensitivity
    const result = formatDate(new Date('2024-06-15T12:00:00Z'));
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/2024/);
  });

  it('formats a date string', () => {
    const result = formatDate('2023-01-20T00:00:00Z');
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/2023/);
  });
});

// ============================================
// formatDateTime
// ============================================

describe('formatDateTime', () => {
  it('formats a Date object with time', () => {
    const result = formatDateTime(new Date('2024-06-15T14:30:00'));
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/2024/);
    // Should include hour and minute parts
    expect(result).toMatch(/:/);
  });

  it('formats a date-time string', () => {
    const result = formatDateTime('2023-03-10T09:05:00');
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/2023/);
  });
});

// ============================================
// formatRelativeTime
// ============================================

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for times within the last minute', () => {
    const recent = new Date('2024-06-15T11:59:30Z');
    expect(formatRelativeTime(recent)).toBe('just now');
  });

  it('returns minutes ago for times within the last hour', () => {
    const thirtyMinutesAgo = new Date('2024-06-15T11:30:00Z');
    expect(formatRelativeTime(thirtyMinutesAgo)).toBe('30m ago');
  });

  it('returns hours ago for times within the last day', () => {
    const threeHoursAgo = new Date('2024-06-15T09:00:00Z');
    expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago');
  });

  it('returns days ago for times within the last week', () => {
    const twoDaysAgo = new Date('2024-06-13T12:00:00Z');
    expect(formatRelativeTime(twoDaysAgo)).toBe('2d ago');
  });

  it('returns formatted date for times older than a week', () => {
    const twoWeeksAgo = new Date('2024-06-01T12:00:00Z');
    const result = formatRelativeTime(twoWeeksAgo);
    // Falls back to formatDate — should include month and year
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/2024/);
  });

  it('accepts a date string', () => {
    const result = formatRelativeTime('2024-06-15T11:59:45Z');
    expect(result).toBe('just now');
  });
});

// ============================================
// formatFileSize
// ============================================

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
  });
});

// ============================================
// formatCampaignStatus
// ============================================

describe('formatCampaignStatus', () => {
  it('maps known statuses', () => {
    expect(formatCampaignStatus('PREPARATION')).toBe('In Preparation');
    expect(formatCampaignStatus('ACTIVE')).toBe('Active');
    expect(formatCampaignStatus('PAUSED')).toBe('Paused');
    expect(formatCampaignStatus('COMPLETED')).toBe('Completed');
    expect(formatCampaignStatus('ARCHIVED')).toBe('Archived');
  });

  it('returns the raw value for unknown statuses', () => {
    expect(formatCampaignStatus('UNKNOWN_STATUS')).toBe('UNKNOWN_STATUS');
  });
});

// ============================================
// formatRoleName
// ============================================

describe('formatRoleName', () => {
  it('maps known roles', () => {
    expect(formatRoleName('DM')).toBe('Dungeon Master');
    expect(formatRoleName('PLAYER')).toBe('Player');
    expect(formatRoleName('SPECTATOR')).toBe('Spectator');
    expect(formatRoleName('ADMIN')).toBe('Administrator');
    expect(formatRoleName('USER')).toBe('User');
  });

  it('returns the raw value for unknown roles', () => {
    expect(formatRoleName('UNKNOWN')).toBe('UNKNOWN');
  });
});

// ============================================
// truncate
// ============================================

describe('truncate', () => {
  it('returns the original string when shorter than maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns the original string when equal to maxLength', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates and appends ellipsis when longer than maxLength', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('handles truncation at small maxLength', () => {
    const result = truncate('abcdefghij', 6);
    expect(result).toBe('abc...');
    expect(result.length).toBe(6);
  });
});

// ============================================
// formatBackupCode
// ============================================

describe('formatBackupCode', () => {
  it('formats an 8-character code with a dash', () => {
    expect(formatBackupCode('ABCD1234')).toBe('ABCD-1234');
  });

  it('returns already-formatted codes unchanged', () => {
    expect(formatBackupCode('ABCD-1234')).toBe('ABCD-1234');
  });

  it('returns codes of different lengths unchanged', () => {
    expect(formatBackupCode('ABC123')).toBe('ABC123');
    expect(formatBackupCode('ABCDE12345')).toBe('ABCDE12345');
  });
});
