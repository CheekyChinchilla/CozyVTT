/**
 * Upload Size Limits — Unit Tests
 *
 * Covers the MAX_<TYPE>_SIZE_MB environment overrides that back
 * FILE_SIZE_LIMITS, and the proxy body-size warnings derived from them.
 */

import { resolveFileSizeLimits, DEFAULT_FILE_SIZE_LIMITS_MB } from './fileUtils';
import { parseProxyBodySize } from './proxyLimits';

const MB = 1024 * 1024;

// ============================================
// resolveFileSizeLimits
// ============================================

describe('resolveFileSizeLimits', () => {
  it('falls back to the documented defaults when nothing is set', () => {
    const limits = resolveFileSizeLimits({});

    expect(limits).toEqual({
      MAP: DEFAULT_FILE_SIZE_LIMITS_MB.MAP * MB,
      TOKEN: DEFAULT_FILE_SIZE_LIMITS_MB.TOKEN * MB,
      AUDIO: DEFAULT_FILE_SIZE_LIMITS_MB.AUDIO * MB,
      AVATAR: DEFAULT_FILE_SIZE_LIMITS_MB.AVATAR * MB,
    });
    expect(limits.MAP).toBe(50 * MB);
    expect(limits.AUDIO).toBe(20 * MB);
  });

  it('applies each MAX_<TYPE>_SIZE_MB override', () => {
    const limits = resolveFileSizeLimits({
      MAX_MAP_SIZE_MB: '500',
      MAX_TOKEN_SIZE_MB: '8',
      MAX_AUDIO_SIZE_MB: '250',
      MAX_AVATAR_SIZE_MB: '3',
    });

    expect(limits.MAP).toBe(500 * MB);
    expect(limits.TOKEN).toBe(8 * MB);
    expect(limits.AUDIO).toBe(250 * MB);
    expect(limits.AVATAR).toBe(3 * MB);
  });

  it('overrides only the types that are set', () => {
    const limits = resolveFileSizeLimits({ MAX_AUDIO_SIZE_MB: '250' });

    expect(limits.AUDIO).toBe(250 * MB);
    expect(limits.MAP).toBe(50 * MB);
  });

  it('treats an empty value as unset (docker-compose passes "" for unset vars)', () => {
    const limits = resolveFileSizeLimits({ MAX_AUDIO_SIZE_MB: '', MAX_MAP_SIZE_MB: '   ' });

    expect(limits.AUDIO).toBe(20 * MB);
    expect(limits.MAP).toBe(50 * MB);
  });

  it('ignores invalid values instead of crashing', () => {
    const limits = resolveFileSizeLimits({
      MAX_MAP_SIZE_MB: '250mb',
      MAX_TOKEN_SIZE_MB: '0',
      MAX_AUDIO_SIZE_MB: '-5',
      MAX_AVATAR_SIZE_MB: 'not-a-number',
    });

    expect(limits.MAP).toBe(50 * MB);
    expect(limits.TOKEN).toBe(5 * MB);
    expect(limits.AUDIO).toBe(20 * MB);
    expect(limits.AVATAR).toBe(2 * MB);
  });

  it('accepts fractional megabytes', () => {
    const limits = resolveFileSizeLimits({ MAX_AVATAR_SIZE_MB: '1.5' });

    expect(limits.AVATAR).toBe(Math.round(1.5 * MB));
  });
});

// ============================================
// parseProxyBodySize
// ============================================

describe('parseProxyBodySize', () => {
  it('parses Nginx size suffixes', () => {
    expect(parseProxyBodySize('55M')).toBe(55 * MB);
    expect(parseProxyBodySize('512k')).toBe(512 * 1024);
    expect(parseProxyBodySize('1G')).toBe(1024 * MB);
    expect(parseProxyBodySize('1048576')).toBe(1048576);
  });

  it('returns null for missing or malformed values', () => {
    expect(parseProxyBodySize(undefined)).toBeNull();
    expect(parseProxyBodySize('')).toBeNull();
    expect(parseProxyBodySize('big')).toBeNull();
    expect(parseProxyBodySize('0M')).toBeNull();
  });
});

// ============================================
// getProxyLimitWarnings
//
// Reloaded per case: the warnings are derived from the limits resolved at
// module load, mirroring how the server sees them at startup.
// ============================================

describe('getProxyLimitWarnings', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  const loadWith = (env: Record<string, string>): string[] => {
    process.env = { ...originalEnv, ...env };
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getProxyLimitWarnings } = require('./proxyLimits');
    return getProxyLimitWarnings(process.env);
  };

  it('stays quiet when the proxy limit covers the largest upload', () => {
    expect(loadWith({ MAX_MAP_SIZE_MB: '50', NGINX_MAX_BODY_SIZE: '55M' })).toEqual([]);
  });

  it('warns when NGINX_MAX_BODY_SIZE is smaller than the largest limit', () => {
    const warnings = loadWith({ MAX_AUDIO_SIZE_MB: '250', NGINX_MAX_BODY_SIZE: '55M' });

    expect(warnings.some((w) => w.includes('NGINX_MAX_BODY_SIZE=255M'))).toBe(true);
  });

  it('warns about the Cloudflare 100 MB body cap for large limits', () => {
    const warnings = loadWith({ MAX_AUDIO_SIZE_MB: '250', NGINX_MAX_BODY_SIZE: '300M' });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Cloudflare');
  });

  it('warns when no proxy limit is configured and limits are large', () => {
    const warnings = loadWith({ MAX_MAP_SIZE_MB: '80' });

    expect(warnings.some((w) => w.includes('client_max_body_size 85M'))).toBe(true);
  });
});
