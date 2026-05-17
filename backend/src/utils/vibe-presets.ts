/**
 * Vibe Tracker Presets & Validation
 * Per SOW Section 18.3: Vibe Tracker Details
 *
 * Default time periods with visual effects (hue, CSS filter, ambient audio).
 * DMs can customize periods or create their own.
 */

export interface VibePeriod {
  name: string;
  hue: string;
  filter: string;
  audio: string | null;
}

export interface VibeSettings {
  enabled: boolean;
  periods: VibePeriod[];
}

/**
 * Default vibe periods per SOW Section 18.3
 * Dawn, Day, Dusk, Night with appropriate colors and CSS filters
 */
export const DEFAULT_VIBE_PERIODS: VibePeriod[] = [
  {
    name: 'dawn',
    hue: '#FFB88C',
    filter: 'brightness(0.9) saturate(1.1)',
    audio: 'birds_chirping.mp3',
  },
  {
    name: 'day',
    hue: '#FFFACD',
    filter: 'brightness(1.0) saturate(1.0)',
    audio: null,
  },
  {
    name: 'dusk',
    hue: '#FF9966',
    filter: 'brightness(0.85) saturate(1.3) hue-rotate(10deg)',
    audio: 'evening_breeze.mp3',
  },
  {
    name: 'night',
    hue: '#1A1A2E',
    filter: 'brightness(0.6) saturate(0.7) contrast(1.1)',
    audio: 'night_crickets.mp3',
  },
];

/**
 * Default vibe settings for new campaigns
 */
export const DEFAULT_VIBE_SETTINGS: VibeSettings = {
  enabled: true,
  periods: DEFAULT_VIBE_PERIODS,
};

/**
 * Validate a vibe settings object structure.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateVibeSettings(settings: unknown): string | null {
  if (!settings || typeof settings !== 'object') {
    return 'vibeSettings must be an object';
  }

  const s = settings as Record<string, unknown>;

  if (typeof s.enabled !== 'boolean') {
    return 'vibeSettings.enabled must be a boolean';
  }

  if (!Array.isArray(s.periods)) {
    return 'vibeSettings.periods must be an array';
  }

  if (s.periods.length === 0) {
    return 'vibeSettings.periods must have at least one period';
  }

  if (s.periods.length > 20) {
    return 'vibeSettings.periods cannot exceed 20 periods';
  }

  for (let i = 0; i < s.periods.length; i++) {
    const period = s.periods[i] as Record<string, unknown>;

    if (!period || typeof period !== 'object') {
      return `vibeSettings.periods[${i}] must be an object`;
    }

    if (typeof period.name !== 'string' || period.name.trim().length === 0) {
      return `vibeSettings.periods[${i}].name must be a non-empty string`;
    }

    if (period.name.length > 50) {
      return `vibeSettings.periods[${i}].name cannot exceed 50 characters`;
    }

    if (typeof period.hue !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(period.hue)) {
      return `vibeSettings.periods[${i}].hue must be a valid hex color (e.g. #FF9966)`;
    }

    if (typeof period.filter !== 'string') {
      return `vibeSettings.periods[${i}].filter must be a string`;
    }

    if (period.filter.length > 200) {
      return `vibeSettings.periods[${i}].filter cannot exceed 200 characters`;
    }

    if (period.audio !== null && typeof period.audio !== 'string') {
      return `vibeSettings.periods[${i}].audio must be a string or null`;
    }
  }

  // Check for duplicate period names
  const names = (s.periods as VibePeriod[]).map((p) => p.name.toLowerCase());
  const uniqueNames = new Set(names);
  if (uniqueNames.size !== names.length) {
    return 'vibeSettings.periods must have unique period names';
  }

  return null;
}

/**
 * Normalize vibe settings from any format (old or new) to the current VibeSettings format.
 *
 * Legacy format:
 *   { periods: ["dawn", "day", ...], hues: { dawn: "#FFB88C", ... } }
 *
 * Current format:
 *   { enabled: boolean, periods: [{ name, hue, filter, audio }, ...] }
 *
 * If the settings are already in the new format, returns them as-is.
 * If in the old format, converts using default filters/audio and sets enabled: true.
 * Returns DEFAULT_VIBE_SETTINGS if the input is null/undefined/invalid.
 */
export function normalizeVibeSettings(raw: unknown): VibeSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_VIBE_SETTINGS;
  }

  const settings = raw as Record<string, unknown>;

  // Check if already in new format (periods is array of objects with 'name' field)
  if (Array.isArray(settings.periods) && settings.periods.length > 0) {
    const firstPeriod = settings.periods[0];

    if (typeof firstPeriod === 'object' && firstPeriod !== null && 'name' in firstPeriod) {
      // New format - ensure enabled field exists (default to true if missing)
      return {
        enabled: typeof settings.enabled === 'boolean' ? settings.enabled : true,
        periods: settings.periods as VibePeriod[],
      };
    }

    // Old format: periods is string[], hues is { [name]: color }
    if (typeof firstPeriod === 'string') {
      const hues = (settings.hues || {}) as Record<string, string>;
      const periodNames = settings.periods as string[];

      // Build a lookup from default periods for filter/audio
      const defaultLookup = new Map(DEFAULT_VIBE_PERIODS.map((p) => [p.name, p]));

      const convertedPeriods: VibePeriod[] = periodNames.map((name) => {
        const defaultPeriod = defaultLookup.get(name);
        return {
          name,
          hue: hues[name] || defaultPeriod?.hue || '#FFFFFF',
          filter: defaultPeriod?.filter || 'brightness(1.0) saturate(1.0)',
          audio: defaultPeriod?.audio || null,
        };
      });

      return {
        enabled: typeof settings.enabled === 'boolean' ? settings.enabled : true,
        periods: convertedPeriods,
      };
    }
  }

  return DEFAULT_VIBE_SETTINGS;
}

/**
 * Find a period by name in vibe settings.
 * Returns the period or null if not found.
 */
export function findVibePeriod(settings: VibeSettings, periodName: string): VibePeriod | null {
  return settings.periods.find((p) => p.name.toLowerCase() === periodName.toLowerCase()) || null;
}
