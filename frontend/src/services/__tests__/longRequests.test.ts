/**
 * The requests a server takes minutes over are given minutes.
 *
 * Every request shares a 30-second timeout. Making a backup dumps and zips
 * the whole database, and a restore also writes a safety copy of the current
 * one before loading anything, so both can run far longer; the bundled
 * nginx gives these two routes ten minutes. The browser gave up after
 * thirty seconds and reported a restore as failed while the server carried
 * on and replaced the database.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AxiosInstance } from 'axios';
import { api } from '@/services/api';
import nginxConf from '../../../../nginx/nginx.conf?raw';

/** The proxy_read_timeout the bundled nginx gives a location, in milliseconds. */
function proxyTimeoutMs(location: string): number {
  const block = new RegExp(`\\n\\s*location ${location.replace(/\//g, '\\/')} \\{([^}]*)\\}`).exec(nginxConf);
  if (!block) throw new Error(`nginx.conf has no location ${location}; update this test with the file`);
  const seconds = /proxy_read_timeout\s+(\d+)s;/.exec(block[1]);
  if (!seconds) throw new Error(`location ${location} sets no proxy_read_timeout`);
  return Number(seconds[1]) * 1000;
}

const client = (api as unknown as { client: AxiosInstance }).client;

afterEach(() => vi.restoreAllMocks());

describe('the backup requests', () => {
  // A restore uploads the backup first. The browser's timeout covers the
  // upload too, while nginx's counts only from when the upload is done, so a
  // slow upload used to run the page out of time as the server went on
  // restoring. The page leaves the limit to the proxy.
  it('leave a restore to the proxy, which times it from the end of the upload', async () => {
    const post = vi.spyOn(client, 'post').mockResolvedValue({ data: {} });
    await api.restoreAdminBackup(new File(['zip'], 'backup.zip'));
    expect(proxyTimeoutMs('/api/admin/backups/restore')).toBeGreaterThan(0);
    expect(post.mock.calls[0][2]?.timeout).toBe(0);
  });

  it('wait as long as the proxy does for a new backup', async () => {
    const post = vi.spyOn(client, 'post').mockResolvedValue({ data: {} });
    await api.createAdminBackup();
    expect(post.mock.calls[0][2]?.timeout).toBe(proxyTimeoutMs('/api/admin/backups'));
  });
});

describe('the campaign import requests', () => {
  // Both send the whole archive, up to 500 MB. The preview had the shared 30
  // seconds and the import five minutes, each counting the upload, so a
  // large archive on a slow connection failed while it was still being sent.
  it.each([
    ['preview', () => api.previewCampaignImport(new FormData())],
    ['import', () => api.importCampaign(new FormData())],
  ])('leave the %s to the proxy, which gives the import location time of its own', async (_name, call) => {
    const post = vi.spyOn(client, 'post').mockResolvedValue({ data: { preview: {} } });
    await call();
    expect(proxyTimeoutMs('/api/campaigns/import')).toBeGreaterThanOrEqual(300_000);
    expect(post.mock.calls[0][2]?.timeout).toBe(0);
  });
});
