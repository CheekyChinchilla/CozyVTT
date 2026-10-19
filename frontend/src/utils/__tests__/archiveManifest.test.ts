/**
 * Reading a campaign archive's manifest in the browser.
 *
 * The import window sent the whole archive to the server to show what it
 * holds, then sent it again to import it. It now reads manifest.json here,
 * and asks the server (null below) only about an archive it cannot read
 * plainly.
 */

import { describe, it, expect } from 'vitest';
import { readArchiveManifest } from '../archiveManifest';
import { zipFixture } from '@/test/zipFixture';

const manifest = {
  formatVersion: 1,
  exportedAt: '2026-10-18T00:00:00.000Z',
  exportedFrom: 'CozyVTT v1.5.3',
  campaignName: 'The Sunken Keep',
  gameSystem: 'DND_5E',
  mapCount: 3,
  tokenCount: 14,
  creatureCount: 2,
  tokenTemplateCount: 1,
  assetCount: 4,
  includesAudio: true,
  totalSizeBytes: 123456,
};

const archive = async (...args: Parameters<typeof zipFixture>) => new Blob([(await zipFixture(...args)) as BlobPart]);

describe('readArchiveManifest', () => {
  it('reads a compressed manifest', async () => {
    const file = await archive([{ name: 'manifest.json', data: JSON.stringify(manifest) }]);
    expect(await readArchiveManifest(file)).toEqual(manifest);
  });

  it('reads a stored manifest among other files, with an archive comment', async () => {
    const file = await archive(
      [
        { name: 'campaign.json', data: '{"name":"The Sunken Keep"}' },
        { name: 'assets/map.png', data: new Uint8Array(5000), method: 0 },
        { name: 'manifest.json', data: JSON.stringify(manifest), method: 0 },
      ],
      'made by a tool that writes comments'
    );
    expect(await readArchiveManifest(file)).toEqual(manifest);
  });

  it('keeps only the fields the window shows', async () => {
    const file = await archive([{ name: 'manifest.json', data: JSON.stringify({ ...manifest, extra: 'x' }) }]);
    expect(await readArchiveManifest(file)).toEqual(manifest);
  });

  it('takes the first manifest.json, as the server does', async () => {
    const file = await archive([
      { name: 'manifest.json', data: JSON.stringify(manifest) },
      { name: 'manifest.json', data: JSON.stringify({ ...manifest, campaignName: 'Second' }) },
    ]);
    expect((await readArchiveManifest(file))?.campaignName).toBe('The Sunken Keep');
  });

  it.each([
    ['a file that is not an archive', async () => new Blob(['PK'])],
    ['an empty file', async () => new Blob([])],
    ['an archive with no manifest', async () => archive([{ name: 'campaign.json', data: '{}' }])],
    ['a manifest of another format version', async () => archive([{ name: 'manifest.json', data: JSON.stringify({ ...manifest, formatVersion: 2 }) }])],
    ['a manifest missing a count', async () => {
      const { mapCount: _omitted, ...rest } = manifest;
      return archive([{ name: 'manifest.json', data: JSON.stringify(rest) }]);
    }],
    ['a manifest with no campaign name', async () => archive([{ name: 'manifest.json', data: JSON.stringify({ ...manifest, campaignName: '' }) }])],
    ['a manifest that is not JSON', async () => archive([{ name: 'manifest.json', data: '{"formatVersion":' }])],
    ['an encrypted manifest', async () => archive([{ name: 'manifest.json', data: JSON.stringify(manifest), flags: 1 }])],
    ['a manifest over a megabyte', async () => archive([{ name: 'manifest.json', data: ' '.repeat(1024 * 1024 + 1) + JSON.stringify(manifest) }])],
  ])('leaves %s to the server', async (_label, make) => {
    expect(await readArchiveManifest(await make())).toBeNull();
  });

  it('leaves a damaged compressed manifest to the server', async () => {
    const bytes = await zipFixture([{ name: 'manifest.json', data: JSON.stringify(manifest) }]);
    // Overwrite the compressed body, which starts after the 30-byte header and the name.
    bytes.fill(0xff, 30 + 'manifest.json'.length, 30 + 'manifest.json'.length + 8);
    expect(await readArchiveManifest(new Blob([bytes as BlobPart]))).toBeNull();
  });

  it('leaves a ZIP64 archive to the server', async () => {
    const bytes = await zipFixture([{ name: 'manifest.json', data: JSON.stringify(manifest) }]);
    // The end record's directory offset, 0xFFFFFFFF in a ZIP64 archive.
    new DataView(bytes.buffer).setUint32(bytes.byteLength - 22 + 16, 0xffffffff, true);
    expect(await readArchiveManifest(new Blob([bytes as BlobPart]))).toBeNull();
  });

  // Text that does not compress, so its compressed size is about its length.
  const noise = (length: number) => {
    const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let x = 2463534242;
    let out = '';
    for (let i = 0; i < length; i += 1) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      out += letters[x % letters.length];
    }
    return out;
  };

  // A manifest is a few hundred bytes. Handed to the decompressor whole, a
  // compressed one near the old 1 MB cap could unpack to far more than the
  // 1 MB the reader stops at before it could stop.
  it('leaves a manifest over 64 KB compressed to the server', async () => {
    const file = await archive([{ name: 'manifest.json', data: JSON.stringify({ ...manifest, exportedFrom: noise(100_000) }) }]);
    expect(await readArchiveManifest(file)).toBeNull();
  });

  it('reads a compressed manifest larger than one slice of its input', async () => {
    const long = { ...manifest, exportedFrom: noise(40_000) };
    const file = await archive([{ name: 'manifest.json', data: JSON.stringify(long) }]);
    expect(await readArchiveManifest(file)).toEqual(long);
  });
});

