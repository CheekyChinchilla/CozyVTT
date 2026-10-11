/**
 * The address an asset is downloaded from is built by the API client, like
 * every other address the browser asks the backend for, so it carries the
 * same base as the rest.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('getAssetDownloadUrl', () => {
  it('is the download route on this site when the client has no base address', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const { api } = await import('../api');
    expect(api.getAssetDownloadUrl('a1')).toBe('/api/assets/a1/download');
  });

  it('carries the base address the client uses for every other request', async () => {
    vi.stubEnv('VITE_API_URL', 'https://vtt.example.com');
    const { api } = await import('../api');
    expect(api.getAssetDownloadUrl('a1')).toBe('https://vtt.example.com/api/assets/a1/download');
    expect(api.getAssetUrl('a1', 'maps')).toBe('https://vtt.example.com/api/assets/maps/a1');
  });

  it('keeps an id from reaching another path', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const { api } = await import('../api');
    expect(api.getAssetDownloadUrl('../admin')).toBe('/api/assets/..%2Fadmin/download');
  });
});
