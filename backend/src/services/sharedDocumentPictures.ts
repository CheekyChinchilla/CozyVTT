// ============================================
// The pictures a campaign's shared documents show
//
// A DM writes a handout in Markdown and embeds a picture by its address
// (`![The letter](/api/assets/maps/<id>)`), as the user guide shows. Sharing
// the handout with the campaign is the DM's choice to show that picture to
// its members, so the map-picture rule lets such a picture through for them
// (mapPictureHidden). This says which pictures the shared documents name.
//
// "Shared with the campaign" is what the campaign's document list shows and
// its members may read: a document linked to it (CampaignDocument), and one
// written or uploaded in it (a CAMPAIGN document of that campaign). Of those,
// only the ones whose text the campaign's DM controls now count, since
// showing the picture is the DM's choice: a document the DM uploaded or
// wrote, written in the campaign or linked to it from their own library or
// the global one. A document a former DM wrote while they held the seat
// (which they can still rewrite as a member), one any other member got
// there, a global one someone else uploaded and the DM linked, and a
// document of another campaign linked to it (whose DM, later someone else,
// could rewrite it), count for nothing. The members of the campaign are exactly
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
// What a document names is read from its text when it is uploaded, written
// or saved, and kept (DocumentPicture), so a request reads the database and
// never a file: its work does not grow with the files of a campaign. Only
// the first MAX_SCANNED_BYTES of a text are read, and at most
// MAX_IDS_PER_DOCUMENT addresses kept from it, each naming an asset that
// exists. A document stored before this was kept (Asset.picturesReadAt
// null) is read by the requests that ask, DOCUMENTS_READ_PER_REQUEST at a
// time, until none is left: a player's request, the documents of the
// campaigns it asks about; the list of an asset's uses, any. A read that
// fails leaves the document unread, to be read again DOCUMENT_READ_RETRY_MS
// later. The check that keeps an uploader who does not run a campaign from
// deleting a picture others there use cannot wait for that: it reads the
// campaign's other members' unread documents at once, up to
// MAX_UNREAD_DOCUMENTS_READ_FOR_REMOVAL, and refuses while any is left
// (readUnreadDocumentsBy, services/assetRemoval.ts).
// ============================================

import fs from 'fs/promises';
import path from 'path';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import logger from '../utils/logger';
import { storedFilePath } from '../utils/storedPath';
import { errorCode } from '../utils/errors';

/** How much of a document is read for addresses: far more than any handout, so a picture's address past it does not count. */
export const MAX_SCANNED_BYTES = 1024 * 1024;
/** The most addresses kept from one document; a picture named after them does not count. */
export const MAX_IDS_PER_DOCUMENT = 200;
/** How many documents not read yet one request reads, until none is left. */
export const DOCUMENTS_READ_PER_REQUEST = 5;
/** How long a document whose file could not be read waits before it is read again. */
export const DOCUMENT_READ_RETRY_MS = 10 * 60 * 1000;
/** The most documents not read yet that one delete's or move's check reads (readUnreadDocumentsBy); any left past it refuse the uploader. */
export const MAX_UNREAD_DOCUMENTS_READ_FOR_REMOVAL = 100;

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

/** The asset ids a document's bytes name: its first MAX_SCANNED_BYTES, read as UTF-8. */
export function assetIdsNamedInBytes(bytes: Buffer): Set<string> {
  return assetIdsNamedIn(bytes.subarray(0, MAX_SCANNED_BYTES).toString('utf8'));
}

/** The start of a file, at most MAX_SCANNED_BYTES of it. */
async function readStart(file: string): Promise<Buffer> {
  const handle = await fs.open(file, 'r');
  try {
    const buffer = Buffer.alloc(Math.min((await handle.stat()).size, MAX_SCANNED_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Documents whose failed read has been logged, each once in this process. */
const reportedUnreadable = new Set<string>();

/**
 * The asset ids a stored document's file names: none for a PDF, which names
 * nothing, and null for a file that could not be read, logged once for each
 * document, so the document is read again later rather than kept as naming
 * nothing. Until then it shows nothing and grants nothing.
 */
export async function assetIdsNamedInFile(documentId: string, storedPath: string): Promise<Set<string> | null> {
  const ext = path.extname(storedPath).toLowerCase();
  if (ext !== '.md' && ext !== '.txt') return new Set();
  try {
    return assetIdsNamedInBytes(await readStart(storedFilePath(storedPath)));
  } catch (error) {
    if (!reportedUnreadable.has(documentId)) {
      if (reportedUnreadable.size >= 1000) reportedUnreadable.clear();
      reportedUnreadable.add(documentId);
      logger.warn('A document could not be read for the pictures it shows; it will be read again later', { err: error, documentId });
    }
    return null;
  }
}

/**
 * Keep what a document names, in place of what it named before, and that it
 * has been read. Only assets that exist are kept, the document itself left
 * out. The document's row is written first, which holds back any other
 * record of the same document until this one is done. `onlyIfUnread` leaves
 * a document someone has recorded meanwhile alone, as the reading of one
 * stored before must: a save since has the newer text. Never throws: a
 * record that fails leaves the document unread, for a later request to read
 * again. Answers whether it was recorded.
 */
export async function recordDocumentPictures(
  documentId: string,
  named: ReadonlySet<string>,
  options: { onlyIfUnread?: boolean } = {}
): Promise<boolean> {
  const ids = [...named].filter((id) => id !== documentId);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const marked = await tx.asset.updateMany({
          where: { id: documentId, type: 'DOCUMENT', ...(options.onlyIfUnread ? { picturesReadAt: null } : {}) },
          data: { picturesReadAt: new Date() },
        });
        if (marked.count === 0) return false;
        await tx.documentPicture.deleteMany({ where: { documentId } });
        if (ids.length > 0) {
          const existing = await tx.asset.findMany({ where: { id: { in: ids } }, select: { id: true } });
          await tx.documentPicture.createMany({
            data: existing.map((asset) => ({ documentId, pictureId: asset.id })),
            skipDuplicates: true,
          });
        }
        return true;
      });
    } catch (error) {
      // An asset it names deleted between the two reads: once more, without it.
      if (errorCode(error) === 'P2003' && attempt < 2) continue;
      logger.warn('What a document shows could not be kept; it will be read again', { err: error, documentId });
      await prisma.asset
        .updateMany({ where: { id: documentId }, data: { picturesReadAt: null } })
        .catch((markError: unknown) => logger.warn('A document could not be marked to be read again', { err: markError, documentId }));
      return false;
    }
  }
}

/** Documents this process is reading now, so requests that come together read different ones. */
const reading = new Set<string>();
/**
 * Documents whose file could not be read, with when each may be tried
 * again, so a file that is missing is not read on every request. At most
 * this many wait; past that, one is tried again at the next request.
 */
const readAgainAt = new Map<string, number>();
const MAX_WAITING_TO_READ_AGAIN = 1000;

/**
 * Read up to DOCUMENTS_READ_PER_REQUEST documents stored before what they
 * name was kept, newest first, and keep what each names: those `ownerId`
 * uploaded, then those shared with `campaignIds` (written in one or linked
 * to one), and with `othersToo` any other after them. A request that reads
 * only those campaigns' documents (the handout grant) asks for theirs; the
 * list of an asset's uses (assetUsageFor) asks for the caller's own first,
 * then any. Each request
 * that reads what documents name asks this first, so the documents from
 * before are read once each, by the requests that need them; once none is
 * left, it is a query or two that find none.
 */
export async function readSomeUnreadDocuments(of: {
  ownerId?: string;
  campaignIds: readonly string[];
  othersToo?: boolean;
  now?: number;
}): Promise<void> {
  const now = of.now ?? Date.now();
  for (const [id, at] of readAgainAt) if (at <= now) readAgainAt.delete(id);
  const busy = [...reading, ...readAgainAt.keys()];
  const unread = (skip: readonly string[]): Prisma.AssetWhereInput => ({
    type: 'DOCUMENT', picturesReadAt: null, ...(skip.length > 0 ? { id: { notIn: [...skip] } } : {}),
  });
  const select = { id: true, filePath: true } as const;
  const orderBy: Prisma.AssetOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'asc' }];
  const picked: Array<{ id: string; filePath: string }> = [];
  const more = async (where: Prisma.AssetWhereInput) => {
    if (picked.length >= DOCUMENTS_READ_PER_REQUEST) return;
    picked.push(...await prisma.asset.findMany({
      where: { AND: [unread([...busy, ...picked.map((doc) => doc.id)]), where] },
      select,
      orderBy,
      take: DOCUMENTS_READ_PER_REQUEST - picked.length,
    }));
  };
  if (of.ownerId) await more({ uploadedById: of.ownerId });
  const ids = [...new Set(of.campaignIds)];
  if (ids.length > 0) {
    await more({ scope: 'CAMPAIGN', campaignId: { in: ids } });
    if (picked.length < DOCUMENTS_READ_PER_REQUEST) {
      const linked = await prisma.campaignDocument.findMany({ where: { campaignId: { in: ids } }, select: { assetId: true } });
      if (linked.length > 0) await more({ id: { in: [...new Set(linked.map((link) => link.assetId))] } });
    }
  }
  if (of.othersToo) await more({});
  await readDocuments(picked, now);
}

/**
 * Read each of `docs` and keep what it names, all at once; one whose file
 * could not be read waits DOCUMENT_READ_RETRY_MS before a request that
 * reads a few picks it again.
 */
async function readDocuments(docs: ReadonlyArray<{ id: string; filePath: string }>, now: number): Promise<void> {
  for (const doc of docs) reading.add(doc.id);
  await Promise.all(docs.map(async (doc) => {
    try {
      const named = await assetIdsNamedInFile(doc.id, doc.filePath);
      if (named) await recordDocumentPictures(doc.id, named, { onlyIfUnread: true });
      else if (readAgainAt.size < MAX_WAITING_TO_READ_AGAIN) readAgainAt.set(doc.id, now + DOCUMENT_READ_RETRY_MS);
    } finally {
      reading.delete(doc.id);
    }
  }));
}

/** What readUnreadDocumentsBy did: how many documents it tried to read, and whether any of the writers' is still not read. */
export interface UnreadDocumentsRead {
  read: number;
  stillUnread: boolean;
}

/**
 * Read the documents `writerIds` uploaded that were stored before what
 * documents name was kept, DOCUMENTS_READ_PER_REQUEST at a time and at most
 * MAX_UNREAD_DOCUMENTS_READ_FOR_REMOVAL in all, newest first, for a check
 * that must decide now whether one of them shows an asset. One whose file
 * could not be read before is tried again. Answers whether any of theirs is
 * still not read afterwards: one past the cap, one another request in this
 * process is reading, or one whose file could not be read. Once none is
 * left, it is two queries that find none.
 */
export async function readUnreadDocumentsBy(writerIds: readonly string[], now = Date.now()): Promise<UnreadDocumentsRead> {
  const writers = [...new Set(writerIds)];
  if (writers.length === 0) return { read: 0, stillUnread: false };
  const theirs: Prisma.AssetWhereInput = { type: 'DOCUMENT', picturesReadAt: null, uploadedById: { in: writers } };
  const tried = new Set<string>();
  while (tried.size < MAX_UNREAD_DOCUMENTS_READ_FOR_REMOVAL) {
    const skip = [...tried, ...reading];
    const batch = await prisma.asset.findMany({
      where: { AND: [theirs, skip.length > 0 ? { id: { notIn: skip } } : {}] },
      select: { id: true, filePath: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: Math.min(DOCUMENTS_READ_PER_REQUEST, MAX_UNREAD_DOCUMENTS_READ_FOR_REMOVAL - tried.size),
    });
    if (batch.length === 0) break;
    for (const doc of batch) tried.add(doc.id);
    await readDocuments(batch.filter((doc) => !reading.has(doc.id)), now);
  }
  const left = await prisma.asset.findFirst({ where: theirs, select: { id: true } });
  return { read: tried.size, stillUnread: left !== null };
}

/** What the handout grant reads of a document. */
interface SharedDocument {
  id: string;
  scope: string;
  campaignId: string | null;
  uploadedById: string | null;
}

/**
 * Whether a document counts for `campaignId` while `dms` hold its DM seat:
 * theirs, and written or uploaded in the campaign, or `linked` to it from
 * their own library or the global one. A document of another campaign
 * linked to it does not count, even one the DM wrote: that campaign's
 * later DM could rewrite it.
 */
function countsFor(doc: SharedDocument, campaignId: string, dms: ReadonlySet<string>, linked: boolean): boolean {
  if (!doc.uploadedById || !dms.has(doc.uploadedById)) return false;
  if (doc.scope === 'CAMPAIGN' && doc.campaignId === campaignId) return true;
  return linked && !(doc.scope === 'CAMPAIGN' && doc.campaignId !== null);
}

/**
 * For each of `campaignIds`, which of `candidates` (asset ids of that
 * campaign's library) the documents shared with it name; a picture counts
 * only for its own campaign.
 *
 * Each statement reads one table, by an index or whole, and the rest is
 * put together here: a statement joining the documents' pictures to the
 * documents was planned from statistics PostgreSQL gathers now and then,
 * and with ones taken while the tables were small it read every handout's
 * pictures for every candidate, minutes a call. What it reads grows with
 * the documents shared with the campaigns and the pictures they name, never
 * with anything else.
 */
export async function picturesInSharedDocuments(
  campaignIds: string[],
  candidates: ReadonlySet<string>
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  if (campaignIds.length === 0 || candidates.size === 0) return result;
  const ids = [...new Set(campaignIds)];
  await readSomeUnreadDocuments({ campaignIds: ids });
  const seats = await prisma.campaignMembership.findMany({
    where: { campaignId: { in: ids }, role: 'DM' },
    select: { campaignId: true, userId: true },
  });
  const dmsOf = new Map<string, Set<string>>();
  for (const seat of seats) dmsOf.set(seat.campaignId, (dmsOf.get(seat.campaignId) ?? new Set<string>()).add(seat.userId));
  if (dmsOf.size === 0) return result;
  const dmIds = [...new Set(seats.map((seat) => seat.userId))];
  const select = { id: true, scope: true, campaignId: true, uploadedById: true } as const;

  // The documents that count for each campaign, by document.
  const [written, links] = await Promise.all([
    prisma.asset.findMany({
      where: { type: 'DOCUMENT', scope: 'CAMPAIGN', campaignId: { in: [...dmsOf.keys()] }, uploadedById: { in: dmIds } },
      select,
    }),
    prisma.campaignDocument.findMany({ where: { campaignId: { in: [...dmsOf.keys()] } }, select: { campaignId: true, assetId: true } }),
  ]);
  const linkedDocs = links.length === 0 ? [] : await prisma.asset.findMany({
    where: { id: { in: [...new Set(links.map((link) => link.assetId))] }, type: 'DOCUMENT', uploadedById: { in: dmIds } },
    select,
  });
  const counts = new Map<string, Set<string>>();
  const count = (docId: string, campaignId: string) => counts.set(docId, (counts.get(docId) ?? new Set<string>()).add(campaignId));
  for (const doc of written) {
    if (doc.campaignId && countsFor(doc, doc.campaignId, dmsOf.get(doc.campaignId) ?? new Set(), false)) count(doc.id, doc.campaignId);
  }
  const byId = new Map(linkedDocs.map((doc) => [doc.id, doc]));
  for (const link of links) {
    const doc = byId.get(link.assetId);
    if (doc && countsFor(doc, link.campaignId, dmsOf.get(link.campaignId) ?? new Set(), true)) count(doc.id, link.campaignId);
  }
  if (counts.size === 0) return result;

  // Which campaign each candidate is of, and which of them those documents name.
  const pictures = await prisma.asset.findMany({
    where: { id: { in: [...candidates] }, campaignId: { in: [...dmsOf.keys()] } },
    select: { id: true, campaignId: true },
  });
  if (pictures.length === 0) return result;
  const campaignOf = new Map(pictures.map((picture) => [picture.id, picture.campaignId]));
  const named = await prisma.documentPicture.findMany({
    where: { pictureId: { in: [...campaignOf.keys()] }, documentId: { in: [...counts.keys()] } },
    select: { documentId: true, pictureId: true },
  });
  for (const { documentId, pictureId } of named) {
    const campaignId = campaignOf.get(pictureId);
    if (!campaignId || !counts.get(documentId)?.has(campaignId)) continue;
    result.set(campaignId, (result.get(campaignId) ?? new Set<string>()).add(pictureId));
  }
  return result;
}
