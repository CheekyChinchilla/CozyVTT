// ============================================
// Formatting Utilities
// ============================================

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface RelativeTimeOptions {
  /** The moment to count back from, in milliseconds; the current time when left out. */
  now?: number;
  /** "5 minutes ago" in place of "5m ago". */
  words?: boolean;
  /** From this many days back, the date itself (formatDate); left out, the days count on. */
  dateAfterDays?: number;
}

/** How long ago `date` was: "just now", "5m ago", "3h ago", "2d ago". */
export function formatRelativeTime(date: string | Date, options: RelativeTimeOptions = {}): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor(((options.now ?? Date.now()) - d.getTime()) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const ago = (n: number, short: string, word: string) =>
    options.words ? `${n} ${word}${n === 1 ? '' : 's'} ago` : `${n}${short} ago`;

  if (seconds < 60) return 'just now';
  if (minutes < 60) return ago(minutes, 'm', 'minute');
  if (hours < 24) return ago(hours, 'h', 'hour');
  if (options.dateAfterDays !== undefined && days >= options.dateAfterDays) return formatDate(d);
  return ago(days, 'd', 'day');
}

/**
 * How a length of time is written:
 * - `largest`: its largest whole unit, "45s", "5m", "3h", "2d".
 * - `hoursMinutes`: to the nearest minute, "3h 30m", "45m", or "<1m" under half a minute.
 * - `words`: whole minutes, "5 minutes", "1 hour 0 minutes"; nothing below zero.
 */
export type DurationStyle = 'largest' | 'hoursMinutes' | 'words';

export function formatDuration(ms: number, style: DurationStyle): string {
  if (style === 'largest') {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }
  if (style === 'hoursMinutes') {
    const minutes = Math.round(ms / 60000);
    if (minutes < 1) return '<1m';
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
  }
  const totalMinutes = Math.floor(Math.max(0, ms) / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const minutesText = `${m} minute${m !== 1 ? 's' : ''}`;
  return h === 0 ? minutesText : `${h} hour${h !== 1 ? 's' : ''} ${minutesText}`;
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export interface FileSizeOptions {
  /** Decimal places from KB up; 1 when left out. */
  decimals?: number;
  /** Decimal places for KB alone, when they differ from the larger units. */
  kbDecimals?: number;
  /** Decimal places for a size under 1 KB; 0 when left out. Zero is always "0 B". */
  byteDecimals?: number;
  /** The smallest unit: KB writes a size under 1 KB in KB. */
  smallest?: 'B' | 'KB';
  /** The largest unit; GB when left out. */
  largest?: 'MB' | 'GB' | 'TB';
}

/** A size in bytes in the largest unit it fills: "512 B", "1.5 KB", "2.5 MB". */
export function formatFileSize(bytes: number, options: FileSizeOptions = {}): string {
  const smallest = SIZE_UNITS.indexOf(options.smallest ?? 'B');
  const largest = SIZE_UNITS.indexOf(options.largest ?? 'GB');
  let i = smallest;
  while (i < largest && bytes >= 1024 ** (i + 1)) i += 1;
  const unit = SIZE_UNITS[i];
  if (unit === 'B' && bytes === 0) return '0 B';
  const decimals =
    unit === 'B' ? (options.byteDecimals ?? 0) : unit === 'KB' ? (options.kbDecimals ?? options.decimals ?? 1) : (options.decimals ?? 1);
  return `${(bytes / 1024 ** i).toFixed(decimals)} ${unit}`;
}
