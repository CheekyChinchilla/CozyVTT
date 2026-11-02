/**
 * What a campaign's shared documents show, kept so a request never reads a file.
 *
 * The asset list asks it for every player's every Asset Library open, so a
 * document must not be able to cost the backend its memory or its time.
 * What a document names is kept when it is written: only the start of its
 * text is read, a fixed number of addresses is kept from it, each naming an
 * asset that exists. A document stored before that is read a few at a time
 * by the requests, each once. Only a document whose text the campaign's DM
 * controls counts: a global one someone else uploaded does not, even linked
 * by the DM.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import { prisma as appPrisma } from '../../config/database';
import logger from '../../utils/logger';
import {
  assetIdsNamedIn,
  assetIdsNamedInBytes,
  picturesInSharedDocuments,
  readSomeUnreadDocuments,
  recordDocumentPictures,
  MAX_SCANNED_BYTES,
  MAX_IDS_PER_DOCUMENT,
  DOCUMENTS_READ_PER_REQUEST,
  DOCUMENT_READ_RETRY_MS,
} from '../sharedDocumentPictures';

jest.setTimeout(60000);

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-doc-pictures-'));
let dmId: string;
let otherId: string;
let campaignId: string;
let elsewhereId: string;
const docIds: string[] = [];

beforeAll(async () => {
  dmId = (await createTestUser({ displayName: 'Scan DM' })).id;
  otherId = (await createTestUser({ displayName: 'Scan Global Manager' })).id;
  campaignId = (await createTestCampaign(dmId, { name: 'Scan' })).id;
  elsewhereId = (await createTestCampaign(otherId, { name: 'Scan elsewhere' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: otherId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: otherId, campaignId: elsewhereId, role: 'DM', characterIds: [] },
    ],
  });
});

afterAll(async () => {
  await prisma.campaignDocument.deleteMany({ where: { campaignId } });
  await prisma.asset.deleteMany({ where: { OR: [{ id: { in: docIds } }, { campaignId: { in: [campaignId, elsewhereId] } }] } });
  await cleanupCampaigns([campaignId, elsewhereId]);
  await cleanupUsers([dmId, otherId]);
  await prisma.$disconnect();
  fs.rmSync(DIR, { recursive: true, force: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const address = (id: string) => `/api/assets/maps/${id}`;

/** `count` map pictures in a campaign's library, as rows: what a document may name. */
async function pictures(count: number, inCampaign = campaignId): Promise<string[]> {
  const ids = Array.from({ length: count }, () => randomUUID());
  await prisma.asset.createMany({
    data: ids.map((id) => ({
      id, type: 'MAP' as const, scope: 'CAMPAIGN' as const, campaignId: inCampaign, uploadedById: dmId, filename: `${id}.png`,
      originalName: `${id}.png`, mimeType: 'image/png', fileSize: 1, filePath: path.join(DIR, `${id}.png`), name: id,
    })),
  });
  return ids;
}

/**
 * A Markdown document of a campaign's, written by `uploadedById` (the DM
 * unless said), stored as one from before what documents name was kept: a
 * row and a file, not read.
 */
async function campaignDocument(text: string | Buffer, options: { uploadedById?: string; inCampaign?: string } = {}): Promise<string> {
  const filename = `scan-${randomUUID()}.md`;
  const filePath = path.join(DIR, filename);
  fs.writeFileSync(filePath, text);
  const doc = await prisma.asset.create({
    data: {
      type: 'DOCUMENT', scope: 'CAMPAIGN', campaignId: options.inCampaign ?? campaignId, uploadedById: options.uploadedById ?? dmId,
      filename, originalName: filename, mimeType: 'text/markdown', fileSize: fs.statSync(filePath).size, filePath, name: filename,
    },
  });
  docIds.push(doc.id);
  return doc.id;
}

const readAt = async (documentId: string) =>
  (await prisma.asset.findUniqueOrThrow({ where: { id: documentId }, select: { picturesReadAt: true } })).picturesReadAt;

const named = async (documentId: string) =>
  new Set((await prisma.documentPicture.findMany({ where: { documentId }, select: { pictureId: true } })).map((row) => row.pictureId));

/** Read every document of the campaign not read yet, as the requests would. */
async function readAll(): Promise<void> {
  const unread = () => prisma.asset.count({ where: { campaignId, type: 'DOCUMENT', picturesReadAt: null } });
  // Until none is left, or the rest wait to be read again after a failed read.
  for (let left = await unread(), before = Infinity; left > 0 && left < before; before = left, left = await unread()) {
    await readSomeUnreadDocuments({ campaignIds: [campaignId] });
  }
}

describe('assetIdsNamedIn', () => {
  const id = randomUUID();

  it('reads an address with nothing that could continue the id after it', () => {
    expect([...assetIdsNamedIn(`![x](${address(id)})`)]).toEqual([id]);
    expect([...assetIdsNamedIn(`${address(id)}/thumbnail and ${address(id)}?v=2`)]).toEqual([id]);
    expect(assetIdsNamedIn(`${address(id)}x`).size).toBe(0);
    expect(assetIdsNamedIn(`${address(id)}-1`).size).toBe(0);
  });

  it('reads the folder in any case and a full address, but not a bare id', () => {
    expect([...assetIdsNamedIn(`![x](/api/assets/Maps/${id})`)]).toEqual([id]);
    expect([...assetIdsNamedIn(`![x](https://vtt.example.com/api/assets/tokens/${id})`)]).toEqual([id]);
    expect(assetIdsNamedIn(`The picture is ${id}.`).size).toBe(0);
  });

  it('reads an address spelt with character references', () => {
    const spelt = `&sol;api&sol;assets/maps&#47;${id.replace(/-/g, '&#45;')}`;
    expect([...assetIdsNamedIn(`![x](${spelt})`)]).toEqual([id]);
  });

  it(`keeps at most ${MAX_IDS_PER_DOCUMENT} of a text's addresses`, () => {
    const many = Array.from({ length: 1000 }, () => address(randomUUID())).join('\n');
    expect(assetIdsNamedIn(many).size).toBe(MAX_IDS_PER_DOCUMENT);
  });

  it(`reads nothing of a text past its first ${MAX_SCANNED_BYTES} bytes`, () => {
    const early = randomUUID();
    const late = randomUUID();
    const text = `${address(early)}\n${'filler '.repeat(Math.ceil((MAX_SCANNED_BYTES * 2) / 7))}\n${address(late)}\n`;
    expect([...assetIdsNamedInBytes(Buffer.from(text))]).toEqual([early]);
  });
});

describe('what a document names, kept', () => {
  it('holds only assets that exist, and never the document itself', async () => {
    const [real] = await pictures(1);
    const docId = await campaignDocument('');
    expect(await recordDocumentPictures(docId, new Set([real, randomUUID(), docId]))).toBe(true);
    expect(await named(docId)).toEqual(new Set([real]));
    const row = await prisma.asset.findUniqueOrThrow({ where: { id: docId }, select: { picturesReadAt: true } });
    expect(row.picturesReadAt).not.toBeNull();
  });

  it('is replaced whole by the next record of the document', async () => {
    const [first, second] = await pictures(2);
    const docId = await campaignDocument('');
    await recordDocumentPictures(docId, new Set([first]));
    await recordDocumentPictures(docId, new Set([second]));
    expect(await named(docId)).toEqual(new Set([second]));
  });

  it('goes with the document, and with each asset it names', async () => {
    const [kept, deleted] = await pictures(2);
    const docId = await campaignDocument('');
    await recordDocumentPictures(docId, new Set([kept, deleted]));
    await prisma.asset.delete({ where: { id: deleted } });
    expect(await named(docId)).toEqual(new Set([kept]));
    await prisma.asset.delete({ where: { id: docId } });
    expect(await prisma.documentPicture.count({ where: { documentId: docId } })).toBe(0);
  });

  it('leaves the document to be read again when it cannot be kept', async () => {
    const [picture] = await pictures(1);
    const docId = await campaignDocument('');
    await recordDocumentPictures(docId, new Set([picture]));
    jest.spyOn(appPrisma, '$transaction').mockRejectedValueOnce(new Error('the database went away'));
    jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    expect(await recordDocumentPictures(docId, new Set())).toBe(false);
    const row = await prisma.asset.findUniqueOrThrow({ where: { id: docId }, select: { picturesReadAt: true } });
    expect(row.picturesReadAt).toBeNull();
  });
});

describe('a document stored before what it names was kept', () => {
  it(`is read ${DOCUMENTS_READ_PER_REQUEST} at a time, the asked campaign's first, and not again once read`, async () => {
    // Whatever the campaign has not read yet first, so the ones made here are all there is.
    await readAll();
    const mine = await pictures(DOCUMENTS_READ_PER_REQUEST);
    const docs: string[] = [];
    for (const id of mine) docs.push(await campaignDocument(address(id)));
    // Newer, and of another campaign.
    for (let i = 0; i < 3; i += 1) await campaignDocument(address(randomUUID()), { uploadedById: otherId, inCampaign: elsewhereId });

    await readSomeUnreadDocuments({ campaignIds: [campaignId] });
    expect(await prisma.asset.count({ where: { id: { in: docs }, picturesReadAt: null } })).toBe(0);
    const found = await picturesInSharedDocuments([campaignId], new Set(mine));
    expect(found.get(campaignId)).toEqual(new Set(mine));

    const opened = jest.spyOn(fs.promises, 'open');
    await readSomeUnreadDocuments({ campaignIds: [campaignId] });
    const ours = new Set((await prisma.asset.findMany({ where: { campaignId, type: 'DOCUMENT' }, select: { filePath: true } })).map((d) => d.filePath));
    expect(opened.mock.calls.filter(([file]) => ours.has(String(file)))).toHaveLength(0);
  });

  it(`counts nothing past its first ${MAX_SCANNED_BYTES} bytes`, async () => {
    const [early, late] = await pictures(2);
    const text = `${address(early)}\n${'filler '.repeat(Math.ceil((MAX_SCANNED_BYTES * 2) / 7))}\n${address(late)}\n`;
    await campaignDocument(text);
    await readAll();
    const found = await picturesInSharedDocuments([campaignId], new Set([early, late]));
    expect([...(found.get(campaignId) ?? [])]).toEqual([early]);
  });

  it('keeps no more of a document full of addresses than its share', async () => {
    const ids = await pictures(MAX_IDS_PER_DOCUMENT + 50);
    const docId = await campaignDocument(ids.map(address).join('\n'));
    await readAll();
    expect(await named(docId)).toEqual(new Set(ids.slice(0, MAX_IDS_PER_DOCUMENT)));
  });

  it('says once that its file is gone, shows nothing, and is not marked read', async () => {
    const [picture] = await pictures(1);
    const docId = await campaignDocument(address(picture));
    const doc = await prisma.asset.findUniqueOrThrow({ where: { id: docId }, select: { filePath: true } });
    fs.rmSync(doc.filePath);
    const warned = jest.spyOn(logger, 'warn');
    await readAll();
    await picturesInSharedDocuments([campaignId], new Set([picture]));
    expect(warned.mock.calls.filter(([message]) => String(message).includes('could not be read'))).toHaveLength(1);
    expect(await named(docId)).toEqual(new Set());
    expect(await readAt(docId)).toBeNull();
  });

  // A file the server could not read once, such as uploads not yet mounted
  // after an upgrade, or too many files open, is read again later.
  it('is read again a while after a read that failed, and not before', async () => {
    const [picture] = await pictures(1);
    const docId = await campaignDocument(address(picture));
    const { filePath } = await prisma.asset.findUniqueOrThrow({ where: { id: docId }, select: { filePath: true } });
    await readAll();
    const unreadDoc = await campaignDocument(address(picture));
    const unreadPath = (await prisma.asset.findUniqueOrThrow({ where: { id: unreadDoc }, select: { filePath: true } })).filePath;
    expect(filePath).not.toBe(unreadPath);
    const realOpen = fsPromises.open.bind(fsPromises);
    let tries = 0;
    jest.spyOn(fsPromises, 'open').mockImplementation(async (file, ...rest) => {
      if (String(file) === unreadPath) {
        tries += 1;
        if (tries === 1) throw Object.assign(new Error('i/o error'), { code: 'EIO' });
      }
      return realOpen(file, ...rest);
    });
    jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    await readSomeUnreadDocuments({ campaignIds: [campaignId] });
    expect(await readAt(unreadDoc)).toBeNull();
    await readSomeUnreadDocuments({ campaignIds: [campaignId] });
    expect(tries).toBe(1);

    await readSomeUnreadDocuments({ campaignIds: [campaignId], now: Date.now() + DOCUMENT_READ_RETRY_MS + 1 });
    expect(tries).toBe(2);
    expect(await readAt(unreadDoc)).not.toBeNull();
    expect(await named(unreadDoc)).toEqual(new Set([picture]));
  });

  it('is left alone once recorded meanwhile, as a save since holds the newer text', async () => {
    const [older, newer] = await pictures(2);
    const docId = await campaignDocument(address(older));
    await recordDocumentPictures(docId, new Set([newer]));
    expect(await recordDocumentPictures(docId, new Set([older]), { onlyIfUnread: true })).toBe(false);
    expect(await named(docId)).toEqual(new Set([newer]));
  });
});

describe('a campaign with many handouts', () => {
  // 300 handouts naming 200 pictures each: past the old cache's hold, every
  // list read every file again, about 7.5 seconds a request.
  it('is answered from what was kept, with no file read, however many there are', async () => {
    const candidates = await pictures(200);
    // Written as recordDocumentPictures keeps them, in bulk: each read, each
    // naming every one of the pictures.
    const handouts = Array.from({ length: 300 }, (_, i) => ({ id: randomUUID(), filePath: path.join(DIR, `many-${i}-${randomUUID()}.md`) }));
    await prisma.asset.createMany({
      data: handouts.map(({ id, filePath }) => ({
        id, type: 'DOCUMENT' as const, scope: 'CAMPAIGN' as const, campaignId, uploadedById: dmId, filename: path.basename(filePath),
        originalName: path.basename(filePath), mimeType: 'text/markdown', fileSize: 1, filePath, name: id, picturesReadAt: new Date(),
      })),
    });
    docIds.push(...handouts.map((h) => h.id));
    const links = handouts.flatMap(({ id }) => candidates.map((pictureId) => ({ documentId: id, pictureId })));
    for (let i = 0; i < links.length; i += 10_000) await prisma.documentPicture.createMany({ data: links.slice(i, i + 10_000) });
    const ours = new Set(handouts.map((h) => h.filePath));

    const opened = jest.spyOn(fs.promises, 'open');
    const timings: number[] = [];
    for (let call = 0; call < 3; call += 1) {
      const start = performance.now();
      const found = await picturesInSharedDocuments([campaignId], new Set(candidates));
      timings.push(performance.now() - start);
      expect(found.get(campaignId)?.size).toBe(candidates.length);
    }
    if (process.env.PRINT_TIMINGS) console.table(timings.map((ms) => ({ ms: Math.round(ms) })));
    expect(opened.mock.calls.filter(([file]) => ours.has(String(file)))).toHaveLength(0);
    expect(Math.max(...timings)).toBeLessThan(500);
  });
});

describe('a document of another campaign the DM runs', () => {
  // That campaign's later DM could rewrite it, and add the address of any
  // picture of this campaign they were once shown.
  it('counts for nothing in this one, even linked to it by the DM', async () => {
    const otherCampaign = (await createTestCampaign(dmId, { name: 'Scan other table' })).id;
    try {
      await prisma.campaignMembership.create({ data: { userId: dmId, campaignId: otherCampaign, role: 'DM', characterIds: [] } });
      const [picture] = await pictures(1);
      const docId = await campaignDocument(address(picture), { inCampaign: otherCampaign });
      await prisma.campaignDocument.create({ data: { campaignId, assetId: docId, linkedById: dmId } });
      await recordDocumentPictures(docId, new Set([picture]));
      const found = await picturesInSharedDocuments([campaignId], new Set([picture]));
      expect(found.get(campaignId)?.has(picture) ?? false).toBe(false);
    } finally {
      await prisma.campaignDocument.deleteMany({ where: { campaignId } });
      await prisma.asset.deleteMany({ where: { campaignId: otherCampaign } });
      await cleanupCampaigns([otherCampaign]);
    }
  });

  it("still counts the DM's own document linked to it", async () => {
    const [picture] = await pictures(1);
    const filename = `own-${randomUUID()}.md`;
    const filePath = path.join(DIR, filename);
    fs.writeFileSync(filePath, address(picture));
    const doc = await prisma.asset.create({
      data: {
        type: 'DOCUMENT', scope: 'USER', campaignId: null, uploadedById: dmId, filename, originalName: filename,
        mimeType: 'text/markdown', fileSize: 60, filePath, name: filename,
      },
    });
    docIds.push(doc.id);
    await prisma.campaignDocument.create({ data: { campaignId, assetId: doc.id, linkedById: dmId } });
    await recordDocumentPictures(doc.id, new Set([picture]));
    const found = await picturesInSharedDocuments([campaignId], new Set([picture]));
    expect(found.get(campaignId)?.has(picture)).toBe(true);
  });
});

describe('a global document someone else uploaded', () => {
  it('counts for nothing, even linked by the DM', async () => {
    const [picture] = await pictures(1);
    const filename = `global-${randomUUID()}.md`;
    const filePath = path.join(DIR, filename);
    fs.writeFileSync(filePath, address(picture));
    const doc = await prisma.asset.create({
      data: {
        type: 'DOCUMENT', scope: 'GLOBAL', campaignId: null, uploadedById: otherId, filename, originalName: filename,
        mimeType: 'text/markdown', fileSize: 60, filePath, name: filename,
      },
    });
    docIds.push(doc.id);
    await prisma.campaignDocument.create({ data: { campaignId, assetId: doc.id, linkedById: dmId } });
    await recordDocumentPictures(doc.id, new Set([picture]));
    const found = await picturesInSharedDocuments([campaignId], new Set([picture]));
    expect(found.get(campaignId)?.has(picture) ?? false).toBe(false);
  });
});
