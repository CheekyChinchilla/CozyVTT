import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatFileSize,
  formatDuration,
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

  it('counts days on past a week unless told to give the date', () => {
    expect(formatRelativeTime(new Date('2024-06-01T12:00:00Z'))).toBe('14d ago');
  });

  it('gives the date from dateAfterDays on', () => {
    const twoWeeksAgo = new Date('2024-06-01T12:00:00Z');
    expect(formatRelativeTime(twoWeeksAgo, { dateAfterDays: 7 })).toBe('Jun 1, 2024');
    expect(formatRelativeTime(new Date('2024-06-08T12:00:01Z'), { dateAfterDays: 7 })).toBe('6d ago');
  });

  it('writes the units out in words, as the chat log does', () => {
    const options = { words: true, dateAfterDays: 7 };
    expect(formatRelativeTime(new Date('2024-06-15T11:59:00Z'), options)).toBe('1 minute ago');
    expect(formatRelativeTime(new Date('2024-06-15T11:30:00Z'), options)).toBe('30 minutes ago');
    expect(formatRelativeTime(new Date('2024-06-15T11:00:00Z'), options)).toBe('1 hour ago');
    expect(formatRelativeTime(new Date('2024-06-14T12:00:00Z'), options)).toBe('1 day ago');
    expect(formatRelativeTime(new Date('2024-06-12T12:00:00Z'), options)).toBe('3 days ago');
  });

  it('counts from the moment it is given', () => {
    expect(formatRelativeTime('2024-06-15T11:00:00Z', { now: Date.parse('2024-06-15T11:05:00Z') })).toBe('5m ago');
  });

  it('calls a time in the future just now', () => {
    expect(formatRelativeTime('2024-06-15T13:00:00Z')).toBe('just now');
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
    expect(formatFileSize(1024 ** 4)).toBe('1024.0 GB');
  });

  // Each screen keeps the sizes it always showed.
  it.each([
    ['the Admin Panel', { byteDecimals: 1, largest: 'TB' as const }, ['0 B', '512.0 B', '1.5 KB', '1024.0 KB', '2.5 MB', '3.3 GB', '5.0 TB']],
    ['the Documents page', { kbDecimals: 0, largest: 'MB' as const }, ['0 B', '512 B', '2 KB', '1024 KB', '2.5 MB', '3328.0 MB', '5242880.0 MB']],
    ['campaign import and asset cards', { largest: 'MB' as const }, ['0 B', '512 B', '1.5 KB', '1024.0 KB', '2.5 MB', '3328.0 MB', '5242880.0 MB']],
    ['the Atmosphere panel', { smallest: 'KB' as const, kbDecimals: 0, largest: 'MB' as const }, ['0 KB', '1 KB', '2 KB', '1024 KB', '2.5 MB', '3328.0 MB', '5242880.0 MB']],
    ['the asset details', { decimals: 2, largest: 'MB' as const }, ['0 B', '512 B', '1.50 KB', '1024.00 KB', '2.50 MB', '3328.00 MB', '5242880.00 MB']],
  ])('writes sizes as %s did', (_screen, options, expected) => {
    const sizes = [0, 512, 1536, 1024 * 1024 - 1, 2.5 * 1024 * 1024, 3.25 * 1024 ** 3, 5 * 1024 ** 4];
    expect(sizes.map((bytes) => formatFileSize(bytes, options))).toEqual(expected);
  });
});

// ============================================
// formatDuration
// ============================================

describe('formatDuration', () => {
  const lengths = [0, 29_999, 30_000, 60_000, 90_000, 3_600_000, 3_660_000, 7_290_000, 86_400_000];

  it('gives the largest whole unit, as the Admin Panel shows timeouts', () => {
    expect(lengths.map((ms) => formatDuration(ms, 'largest'))).toEqual(
      ['0s', '29s', '30s', '1m', '1m', '1h', '1h', '2h', '1d'],
    );
  });

  it('gives hours and minutes to the nearest minute, as the session history does', () => {
    expect(lengths.map((ms) => formatDuration(ms, 'hoursMinutes'))).toEqual(
      ['<1m', '<1m', '1m', '1m', '2m', '1h 0m', '1h 1m', '2h 2m', '24h 0m'],
    );
  });

  it('writes whole minutes in words, as ending a session does', () => {
    expect([-5000, ...lengths].map((ms) => formatDuration(ms, 'words'))).toEqual([
      '0 minutes', '0 minutes', '0 minutes', '0 minutes', '1 minute', '1 minute',
      '1 hour 0 minutes', '1 hour 1 minute', '2 hours 1 minute', '24 hours 0 minutes',
    ]);
  });
});
