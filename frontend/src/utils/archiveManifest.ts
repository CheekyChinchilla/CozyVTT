// ============================================
// Reading a campaign archive's manifest in the browser
// ============================================
//
// The import window shows what an archive holds before importing it. That
// came from the server, which meant sending the whole archive (up to 500 MB)
// once to be looked at and again to be imported. A .cozyvtt archive is a ZIP
// whose manifest.json says what is in it, and a ZIP lists its files at its
// end, so the manifest can be found and unpacked here from a few kilobytes of
// the file.
//
// Anything this does not read plainly (not a ZIP, a ZIP64 archive, an
// encrypted or unusually packed manifest, one that does not have the fields
// the window shows) gives null, and the window asks the server, which says
// what is wrong with it. The import checks everything again either way.

import type { CampaignImportPreview } from '@/types';

/** The archive format version this app's server imports. */
const FORMAT_VERSION = 1;

/** A manifest is a few hundred bytes; anything far larger is not one to read here. */
const MANIFEST_READ_LIMIT = 1024 * 1024;

/** The list of files a ZIP keeps at its end, read here up to this size. */
const DIRECTORY_READ_LIMIT = 4 * 1024 * 1024;

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const END_RECORD_LENGTH = 22;
const MAX_COMMENT_LENGTH = 0xffff;
const STORED = 0;
const DEFLATED = 8;
const MANIFEST_NAME = new TextEncoder().encode('manifest.json');

async function bytesOf(file: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

/** Where the file list starts and how long it is, or null for an archive not read here. */
async function findDirectory(file: Blob): Promise<{ offset: number; size: number } | null> {
  if (file.size < END_RECORD_LENGTH) return null;
  const tailStart = Math.max(0, file.size - END_RECORD_LENGTH - MAX_COMMENT_LENGTH);
  const tail = await bytesOf(file, tailStart, file.size);
  for (let at = tail.byteLength - END_RECORD_LENGTH; at >= 0; at -= 1) {
    if (tail.getUint32(at, true) !== END_OF_DIRECTORY) continue;
    const size = tail.getUint32(at + 12, true);
    const offset = tail.getUint32(at + 16, true);
    // 0xFFFFFFFF marks a ZIP64 archive, whose real values are elsewhere.
    if (size === 0xffffffff || offset === 0xffffffff) return null;
    if (size > DIRECTORY_READ_LIMIT || offset + size > tailStart + at) return null;
    return { offset, size };
  }
  return null;
}

function isManifestName(view: DataView, at: number, length: number): boolean {
  if (length !== MANIFEST_NAME.length) return false;
  for (let i = 0; i < length; i += 1) {
    if (view.getUint8(at + i) !== MANIFEST_NAME[i]) return false;
  }
  return true;
}

interface ManifestEntry {
  method: number;
  compressedSize: number;
  size: number;
  headerOffset: number;
}

/** The first file named manifest.json in the list, as the server takes it. */
function findManifest(directory: DataView): ManifestEntry | null {
  let at = 0;
  while (at + 46 <= directory.byteLength) {
    if (directory.getUint32(at, true) !== DIRECTORY_ENTRY) return null;
    const flags = directory.getUint16(at + 8, true);
    const method = directory.getUint16(at + 10, true);
    const compressedSize = directory.getUint32(at + 20, true);
    const size = directory.getUint32(at + 24, true);
    const nameLength = directory.getUint16(at + 28, true);
    const extraLength = directory.getUint16(at + 30, true);
    const commentLength = directory.getUint16(at + 32, true);
    const headerOffset = directory.getUint32(at + 42, true);
    if (at + 46 + nameLength > directory.byteLength) return null;
    if (isManifestName(directory, at + 46, nameLength)) {
      // Bit 0 is encryption.
      if (flags & 1) return null;
      return { method, compressedSize, size, headerOffset };
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

/** A stream of one chunk. */
function streamOf(bytes: BufferSource): ReadableStream<BufferSource> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** Unpack a DEFLATE stream, giving up past `limit` bytes. */
async function inflate(packed: BufferSource, limit: number): Promise<Uint8Array | null> {
  const reader = streamOf(packed).pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

async function manifestBytes(file: Blob, entry: ManifestEntry): Promise<Uint8Array | null> {
  if (entry.size > MANIFEST_READ_LIMIT || entry.compressedSize > MANIFEST_READ_LIMIT) return null;
  const header = await bytesOf(file, entry.headerOffset, entry.headerOffset + 30);
  if (header.byteLength < 30 || header.getUint32(0, true) !== LOCAL_HEADER) return null;
  const start = entry.headerOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  const packed = new Uint8Array(await file.slice(start, start + entry.compressedSize).arrayBuffer());
  if (packed.byteLength !== entry.compressedSize) return null;
  if (entry.method === STORED) return packed;
  if (entry.method === DEFLATED) return inflate(packed, MANIFEST_READ_LIMIT);
  return null;
}

const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const isText = (value: unknown): value is string => typeof value === 'string';

/** The manifest as the import window shows it, when it has every field the right way. */
function asPreview(value: unknown): CampaignImportPreview | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const m = value as Record<string, unknown>;
  if (m.formatVersion !== FORMAT_VERSION) return null;
  if (!isText(m.exportedAt) || !isText(m.exportedFrom) || !isText(m.gameSystem)) return null;
  if (!isText(m.campaignName) || m.campaignName.length === 0) return null;
  const counts = [m.mapCount, m.tokenCount, m.creatureCount, m.tokenTemplateCount, m.assetCount, m.totalSizeBytes];
  if (!counts.every(isCount) || typeof m.includesAudio !== 'boolean') return null;
  return {
    formatVersion: m.formatVersion,
    exportedAt: m.exportedAt,
    exportedFrom: m.exportedFrom,
    campaignName: m.campaignName,
    gameSystem: m.gameSystem,
    mapCount: m.mapCount as number,
    tokenCount: m.tokenCount as number,
    creatureCount: m.creatureCount as number,
    tokenTemplateCount: m.tokenTemplateCount as number,
    assetCount: m.assetCount as number,
    includesAudio: m.includesAudio,
    totalSizeBytes: m.totalSizeBytes as number,
  };
}

/**
 * What a campaign archive says it holds, read from its manifest.json here in
 * the browser, or null when that cannot be read plainly and the server should
 * be asked instead.
 */
export async function readArchiveManifest(file: Blob): Promise<CampaignImportPreview | null> {
  try {
    const directory = await findDirectory(file);
    if (!directory) return null;
    const entry = findManifest(await bytesOf(file, directory.offset, directory.offset + directory.size));
    if (!entry) return null;
    const bytes = await manifestBytes(file, entry);
    if (!bytes) return null;
    return asPreview(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    return null;
  }
}
