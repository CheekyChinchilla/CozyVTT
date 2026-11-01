/**
 * Reading the pictures a campaign's shared documents name stays cheap.
 *
 * The asset list asks it for every player's every Asset Library open, so a
 * document must not be able to cost the backend its memory or its time.
 * Only the start of a file is read, a fixed number of addresses is kept from
 * it, one read is shared by every request waiting for it, and a lost file is
 * reported once. Only a document whose text the campaign's DM controls
 * counts: a global one someone else uploaded does not, even linked by the DM.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import logger from '../../utils/logger';
import {
  assetIdsNamedIn,
  picturesInSharedDocuments,
  documentPictureScanStats,
  MAX_SCANNED_BYTES,
  MAX_IDS_PER_DOCUMENT,
} from '../sharedDocumentPictures';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-doc-scan-'));
let dmId: string;
let otherId: string;
let campaignId: string;
const docIds: string[] = [];

beforeAll(async () => {
  dmId = (await createTestUser({ displayName: 'Scan DM' })).id;
  otherId = (await createTestUser({ displayName: 'Scan Global Manager' })).id;
  campaignId = (await createTestCampaign(dmId, { name: 'Scan' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: otherId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
});

afterAll(async () => {
  await prisma.campaignDocument.deleteMany({ where: { campaignId } });
  await prisma.asset.deleteMany({ where: { id: { in: docIds } } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, otherId]);
  await prisma.$disconnect();
  fs.rmSync(DIR, { recursive: true, force: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const address = (id: string) => `/api/assets/maps/${id}`;

/** A Markdown document of the campaign's, written by `uploadedById` (the DM unless said). */
async function campaignDocument(text: string | Buffer, uploadedById = dmId): Promise<string> {
  const filename = `scan-${randomUUID()}.md`;
  const filePath = path.join(DIR, filename);
  fs.writeFileSync(filePath, text);
  const doc = await prisma.asset.create({
    data: {
      type: 'DOCUMENT', scope: 'CAMPAIGN', campaignId, uploadedById, filename, originalName: filename,
      mimeType: 'text/markdown', fileSize: fs.statSync(filePath).size, filePath, name: filename,
    },
  });
  docIds.push(doc.id);
  return doc.id;
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
});

describe('a document the DM shared', () => {
  it(`counts nothing past its first ${MAX_SCANNED_BYTES} bytes`, async () => {
    const early = randomUUID();
    const late = randomUUID();
    const text = `${address(early)}\n${'filler '.repeat(Math.ceil((MAX_SCANNED_BYTES * 2) / 7))}\n${address(late)}\n`;
    await campaignDocument(text);
    const found = await picturesInSharedDocuments([campaignId], new Set([early, late]));
    expect([...(found.get(campaignId) ?? [])]).toEqual([early]);
  });

  it('keeps no more of a document full of addresses than its share', async () => {
    const before = documentPictureScanStats().ids;
    const ids = Array.from({ length: 1000 }, () => randomUUID());
    await campaignDocument(ids.map(address).join('\n'));
    const found = await picturesInSharedDocuments([campaignId], new Set(ids));
    expect(found.get(campaignId)?.size).toBe(MAX_IDS_PER_DOCUMENT);
    expect(found.get(campaignId)).toEqual(new Set(ids.slice(0, MAX_IDS_PER_DOCUMENT)));
    expect(documentPictureScanStats().ids - before).toBeLessThanOrEqual(MAX_IDS_PER_DOCUMENT);
  });

  it('is read once for requests that come together', async () => {
    const id = randomUUID();
    await campaignDocument(address(id));
    const opened = jest.spyOn(fsPromises, 'open');
    const [first, second] = await Promise.all([
      picturesInSharedDocuments([campaignId], new Set([id])),
      picturesInSharedDocuments([campaignId], new Set([id])),
    ]);
    expect(first.get(campaignId)?.has(id)).toBe(true);
    expect(second.get(campaignId)?.has(id)).toBe(true);
    // Every other document of the campaign was read before and is kept.
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('says once that its file is gone', async () => {
    const docId = await campaignDocument('gone');
    const doc = await prisma.asset.findUniqueOrThrow({ where: { id: docId }, select: { filePath: true } });
    fs.rmSync(doc.filePath);
    const warned = jest.spyOn(logger, 'warn');
    await picturesInSharedDocuments([campaignId], new Set([randomUUID()]));
    await picturesInSharedDocuments([campaignId], new Set([randomUUID()]));
    expect(warned.mock.calls.filter(([message]) => String(message).includes('shared document'))).toHaveLength(1);
  });
});

describe('a global document someone else uploaded', () => {
  it('counts for nothing, even linked by the DM', async () => {
    const id = randomUUID();
    const filename = `global-${randomUUID()}.md`;
    const filePath = path.join(DIR, filename);
    fs.writeFileSync(filePath, address(id));
    const doc = await prisma.asset.create({
      data: {
        type: 'DOCUMENT', scope: 'GLOBAL', campaignId: null, uploadedById: otherId, filename, originalName: filename,
        mimeType: 'text/markdown', fileSize: 60, filePath, name: filename,
      },
    });
    docIds.push(doc.id);
    await prisma.campaignDocument.create({ data: { campaignId, assetId: doc.id, linkedById: dmId } });
    const found = await picturesInSharedDocuments([campaignId], new Set([id]));
    expect(found.get(campaignId)?.has(id) ?? false).toBe(false);
  });
});
