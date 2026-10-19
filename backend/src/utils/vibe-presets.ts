
/**
 * Vibe Tracker Presets & Validation
 * Vibe Tracker Details
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
 * Default vibe periods
 * Dawn, Day, Dusk, Night with appropriate colors and CSS filters
 */
export const DEFAULT_VIBE_PERIODS: VibePeriod[] = [
  {
    name: 'dawn',
    hue: '#FFB88C',
    filter: 'brightness(0.9) saturate(1.1)',
    audio: null,
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
    audio: null,
  },
  {
    name: 'night',
    hue: '#1A1A2E',
    filter: 'brightness(0.6) saturate(0.7) contrast(1.1)',
    audio: null,
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
 * Carry the stored atmosphere track through a settings write.
 *
 * `vibeSettings.atmosphereAudio` names an asset, and naming one there lets
 * everyone at the table read it. Only the socket handler that sets a track may
 * decide that, because it checks the DM can read the asset first. Every other
 * writer of this column keeps whatever is already stored and ignores the
 * client's value, so an ordinary settings update neither opens a file nor stops
 * the music.
 *
 * `stored` is the campaign's current vibeSettings, or undefined for a campaign
 * that does not exist yet.
 */
export function preserveAtmosphereAudio(incoming: unknown, stored?: unknown): unknown {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return incoming;
  }

  const next: Record<string, unknown> = { ...(incoming as Record<string, unknown>) };
  delete next.atmosphereAudio;

  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const current = (stored as Record<string, unknown>).atmosphereAudio;
    if (current !== undefined) next.atmosphereAudio = current;
  }

  return next;
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
export function findVibePeriod<P extends Pick<VibePeriod, 'name'> = VibePeriod>(
  settings: { periods: readonly P[] },
  periodName: string
): P | null {
  return settings.periods.find((p) => p.name.toLowerCase() === periodName.toLowerCase()) || null;
}
