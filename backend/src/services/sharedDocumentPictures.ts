// ============================================
// The pictures a campaign's shared documents show
//
// A DM writes a handout in Markdown and embeds a picture by its address
// (`![The letter](/api/assets/maps/<id>)`), as the user guide shows. Sharing
// the handout with the campaign is the DM's choice to show that picture to
// its members, so the map-picture rule lets such a picture through for them
// (mapPictureHidden). This reads which pictures each shared document names.
//
// "Shared with the campaign" is what the campaign's document list shows and
// its members may read: a document linked to it (CampaignDocument), and one
// written or uploaded in it (a CAMPAIGN document of that campaign). Of those,
// only the ones whose text the campaign's DM controls now count, since
// showing the picture is the DM's choice: a document the DM uploaded or
// wrote, linked or written in the campaign. A document a former DM wrote
// while they held the seat (which they can still rewrite as a member), one
// any other member got there, and a global one someone else uploaded and
// the DM linked, count for nothing. The members of the campaign are exactly
// those the document is shared with.
//
// A picture counts when the document's text holds its address,
// `/api/assets/<kind>/<id>`, with no letter, digit, hyphen or underscore
// after the id, its folder in any case as the reader takes it, after
// numeric and the few named character references an address can be spelt
// with are read. A mention counts as an embed: whoever is granted the
// picture can read its address in the same text. Only plain text and
// Markdown documents hold addresses; a PDF names nothing.
//
// Every cost is bounded, since any signed-in user can run a campaign and
// upload a document: only the first MAX_SCANNED_BYTES of a file are read,
// at most MAX_IDS_PER_DOCUMENT addresses are kept from it, the answers are
// kept for at most MAX_KEPT_IDS ids in all (the least recently used go
// first), and one read of a document is shared by every request waiting on
// it.
// ============================================

import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../config/database';
import logger from '../utils/logger';
import { storedFilePath } from '../utils/storedPath';

/** How much of a document is read for addresses: far more than any handout, so a picture's address past it does not count. */
export const MAX_SCANNED_BYTES = 1024 * 1024;
/** The most addresses kept from one document; a picture named after them does not count. */
export const MAX_IDS_PER_DOCUMENT = 200;
/** The most ids kept in all, over every document read. */
export const MAX_KEPT_IDS = 50_000;

const ADDRESS = /\/api\/assets\/(?:maps|tokens|avatars|audio|documents)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9A-Za-z_-])/gi;
const NAMED_REFERENCES: Record<string, string> = { sol: '/', hyphen: '-', dash: '-', period: '.', colon: ':', lowbar: '_' };

/** Character references read as Markdown reads them, for the ones an address can be spelt with. */
function readCharacterReferences(text: string): string {
  return text.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]+));/g, (whole, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    const code = dec !== undefined ? Number(dec) : hex !== undefined ? parseInt(hex, 16) : null;
    if (code !== null) return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    return (name && NAMED_REFERENCES[name]) ?? whole;
  });
}

/** The asset ids a text names by their address, the first `limit` of them. */
export function assetIdsNamedIn(text: string, limit = MAX_IDS_PER_DOCUMENT): Set<string> {
  const ids = new Set<string>();
  for (const match of readCharacterReferences(text).matchAll(ADDRESS)) {
    ids.add(match[1]);
    if (ids.size >= limit) break;
  }
  return ids;
}

interface Scan { file: string; mtimeMs: number; size: number; ids: ReadonlySet<string> }
/** The answers kept, oldest used first. */
const scans = new Map<string, Scan>();
let keptIds = 0;
/** A read under way, per document, which later requests wait on. */
const reading = new Map<string, Promise<ReadonlySet<string>>>();
/** Files found missing, each reported once. */
const reportedMissing = new Set<string>();
const NONE: ReadonlySet<string> = new Set();

/** How much is kept now. */
export function documentPictureScanStats(): { documents: number; ids: number; reading: number } {
  return { documents: scans.size, ids: keptIds, reading: reading.size };
}

function keep(documentId: string, scan: Scan): void {
  const before = scans.get(documentId);
  if (before) {
    keptIds -= before.ids.size;
    scans.delete(documentId);
  }
  scans.set(documentId, scan);
  keptIds += scan.ids.size;
  while (keptIds > MAX_KEPT_IDS && scans.size > 1) {
    const oldest = scans.keys().next();
    if (oldest.done) break;
    keptIds -= scans.get(oldest.value)?.ids.size ?? 0;
    scans.delete(oldest.value);
  }
}

/** The start of a file, at most MAX_SCANNED_BYTES of it, as text. */
async function readStart(file: string, size: number): Promise<string> {
  const handle = await fs.open(file, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(size, MAX_SCANNED_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

async function idsNamedBy(documentId: string, storedPath: string): Promise<ReadonlySet<string>> {
  const ext = path.extname(storedPath).toLowerCase();
  if (ext !== '.md' && ext !== '.txt') return NONE;
  const file = storedFilePath(storedPath);
  let stat: { mtimeMs: number; size: number };
  try {
    stat = await fs.stat(file);
  } catch (error) {
    // A file gone from the disk shows nothing, and grants nothing. Said
    // once: every member's every list would say it again.
    if (!reportedMissing.has(file)) {
      if (reportedMissing.size >= 1000) reportedMissing.clear();
      reportedMissing.add(file);
      logger.warn('A shared document could not be read for the pictures it shows', { err: error, documentId });
    }
    return NONE;
  }
  const kept = scans.get(documentId);
  if (kept && kept.file === file && kept.mtimeMs === stat.mtimeMs && kept.size === stat.size) {
    scans.delete(documentId);
    scans.set(documentId, kept);
    return kept.ids;
  }
  const pending = reading.get(documentId);
  if (pending) return pending;
  const read = (async () => {
    try {
      const ids = assetIdsNamedIn(await readStart(file, stat.size));
      keep(documentId, { file, mtimeMs: stat.mtimeMs, size: stat.size, ids });
      return ids;
    } catch (error) {
      logger.warn('A shared document could not be read for the pictures it shows', { err: error, documentId });
      return NONE;
    } finally {
      reading.delete(documentId);
    }
  })();
  reading.set(documentId, read);
  return read;
}

/**
 * For each of `campaignIds`, which of `candidates` (asset ids) the documents
 * shared with it name. Only the candidates are tested, against what each
 * document names, so nothing is copied for the rest.
 */
export async function picturesInSharedDocuments(
  campaignIds: string[],
  candidates: ReadonlySet<string>
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  if (campaignIds.length === 0 || candidates.size === 0) return result;
  const ids = [...new Set(campaignIds)];
  const [dms, linked, own] = await Promise.all([
    prisma.campaignMembership.findMany({ where: { campaignId: { in: ids }, role: 'DM' }, select: { campaignId: true, userId: true } }),
    prisma.campaignDocument.findMany({
      where: { campaignId: { in: ids }, asset: { type: 'DOCUMENT' } },
      select: { campaignId: true, asset: { select: { id: true, filePath: true, uploadedById: true } } },
    }),
    prisma.asset.findMany({
      where: { type: 'DOCUMENT', scope: 'CAMPAIGN', campaignId: { in: ids } },
      select: { id: true, filePath: true, uploadedById: true, campaignId: true },
    }),
  ]);
  const isDmOf = (campaignId: string, userId: string | null) =>
    userId !== null && dms.some((dm) => dm.campaignId === campaignId && dm.userId === userId);
  const shared = [
    ...linked.filter((link) => isDmOf(link.campaignId, link.asset.uploadedById)),
    ...own.flatMap((asset) => (asset.campaignId && isDmOf(asset.campaignId, asset.uploadedById) ? [{ campaignId: asset.campaignId, asset }] : [])),
  ];
  for (const link of shared) {
    const named = await idsNamedBy(link.asset.id, link.asset.filePath);
    for (const id of named) {
      if (!candidates.has(id)) continue;
      const forCampaign = result.get(link.campaignId) ?? new Set<string>();
      forCampaign.add(id);
      result.set(link.campaignId, forCampaign);
    }
  }
  return result;
}
