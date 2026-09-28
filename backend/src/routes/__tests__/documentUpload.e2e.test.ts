/**
 * Uploading a document — End-to-End Tests
 *
 * `file-type` is ESM-only and Jest cannot load it, so it is stubbed here as it
 * is everywhere else. The stub is not a shortcut: it encodes what the real
 * library was observed to do for exactly these inputs, checked by hand before
 * writing it. A real PDF is identified as application/pdf. An ELF executable is
 * identified as application/x-elf. Plain text, Markdown, HTML and arbitrary
 * bytes are all reported as unidentified. What is under test is what the
 * validator does with each of those answers, which is where the decisions live.
 *
 * The library itself has no automated coverage in this repository. That is a
 * pre-existing gap of the test infrastructure, not of this feature, and it is
 * recorded in FUTURE_FEATURES.
 *
 * What has to hold:
 * - A real PDF, a text file and a Markdown file upload and land under
 *   `documents/`.
 * - An executable renamed `.md` or `.pdf` is refused. `file-type` identifies
 *   the executable, and the MIME allowlist rejects it before any extension
 *   logic runs.
 * - Bytes that `file-type` cannot identify are refused unless they prove they
 *   are text. There is no "it is named .pdf, let it through" path for documents.
 * - A refused file is deleted, not left in the temp directory.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-docupload-test-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

// See the header. Identification by leading bytes, matching the real library's
// observed verdicts for these fixtures.
jest.mock('file-type', () => ({
  fileTypeFromFile: jest.fn(async (filePath: string) => {
    const head = fs.readFileSync(filePath).subarray(0, 8);
    if (head.subarray(0, 5).toString('latin1') === '%PDF-') {
      return { ext: 'pdf', mime: 'application/pdf' };
    }
    if (head[0] === 0x7f && head.subarray(1, 4).toString('latin1') === 'ELF') {
      return { ext: 'elf', mime: 'application/x-elf' };
    }
    return undefined;
  }),
  fileTypeFromBuffer: jest.fn(async () => undefined),
}));

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

/** Where the row says the file is: the response no longer says, since where a file sits on the server is the server's business. */
const storedPath = async (id: string) =>
  (await prisma.asset.findUniqueOrThrow({ where: { id }, select: { filePath: true } })).filePath;

/** Small enough to write inline, real enough for file-type to identify. */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n' +
    'trailer\n<< /Root 1 0 R >>\n%%EOF\n'
);
const TEXT = Buffer.from('The rule of cool.\n\nWhen in doubt, roll a d20.\n');
const MARKDOWN = Buffer.from('# House Rules\n\n- Nat 20 on a skill check is a *flourish*\n');
const HTML_AS_MD = Buffer.from('<html><body><script>alert(1)</script></body></html>');
/** Plausible text, then a NUL. A prefix check would miss this. */
const NUL_AFTER_PREAMBLE = Buffer.concat([Buffer.from('a'.repeat(4096)), Buffer.from([0x00, 0x41])]);
/** Bytes file-type cannot identify and that are not text either. */
const UNIDENTIFIABLE = Buffer.from([0x80, 0x81, 0x82, 0xfe, 0xfd, 0x00, 0x99]);

function filesInTemp(): string[] {
  const temp = path.join(UPLOAD_DIR, 'temp');
  return fs.existsSync(temp) ? fs.readdirSync(temp) : [];
}

describe('POST /api/assets/upload with type DOCUMENT', () => {
  let userId: string;
  let agent: ReturnType<typeof request.agent>;
  const uploadedIds: string[] = [];
  let elf: Buffer;

  beforeAll(async () => {
    const user = await createTestUser({ displayName: 'Document Uploader' });
    userId = user.id;
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    // A genuine executable, as an attacker would rename one.
    elf = fs.readFileSync('/bin/ls');
  });

  afterAll(async () => {
    await prisma.asset.deleteMany({ where: { id: { in: uploadedIds } } });
    await cleanupUsers([userId]);
    await prisma.$disconnect();
    fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  });

  async function upload(filename: string, body: Buffer, contentType: string, type = 'DOCUMENT') {
    const res = await agent
      .post('/api/assets/upload')
      .field('type', type)
      .field('scope', 'USER')
      .attach('file', body, { filename, contentType });
    if (res.body?.asset?.id) uploadedIds.push(res.body.asset.id);
    return res;
  }

  describe('accepts the three supported formats', () => {
    it('a PDF, identified by its bytes', async () => {
      const res = await upload('rules.pdf', PDF, 'application/pdf');
      expect(res.status).toBe(201);
      expect(res.body.asset.type).toBe('DOCUMENT');
      expect((await storedPath(res.body.asset.id)).replace(/\\/g, '/')).toContain('/documents/');
    });

    it('a plain text file', async () => {
      const res = await upload('notes.txt', TEXT, 'text/plain');
      expect(res.status).toBe(201);
      expect((await storedPath(res.body.asset.id)).replace(/\\/g, '/')).toContain('/documents/');
    });

    it('a Markdown file', async () => {
      const res = await upload('house-rules.md', MARKDOWN, 'text/markdown');
      expect(res.status).toBe(201);
    });

    it('leaves the file readable at the recorded path', async () => {
      const res = await upload('reachable.txt', TEXT, 'text/plain');
      expect(res.status).toBe(201);
      expect(fs.existsSync((await storedPath(res.body.asset.id)))).toBe(true);
      expect(fs.readFileSync((await storedPath(res.body.asset.id)))).toEqual(TEXT);
    });

    it('HTML named .md, because it is text and the serving route neutralises it', async () => {
      // Refusing this would be inventing a rule the check cannot enforce
      // reliably anyway. Safety comes from serving it as text/plain.
      const res = await upload('sneaky.md', HTML_AS_MD, 'text/markdown');
      expect(res.status).toBe(201);
    });
  });

  describe('refuses a masked executable', () => {
    it('renamed .md', async () => {
      const before = filesInTemp().length;
      const res = await upload('rules.md', elf, 'text/markdown');
      expect(res.status).toBe(400);
      expect(filesInTemp().length).toBe(before);
    });

    it('renamed .pdf', async () => {
      const res = await upload('rules.pdf', elf, 'application/pdf');
      expect(res.status).toBe(400);
    });

    it('renamed .txt', async () => {
      const res = await upload('rules.txt', elf, 'text/plain');
      expect(res.status).toBe(400);
    });
  });

  describe('refuses bytes that only claim to be text', () => {
    it('a NUL byte after a long text preamble', async () => {
      const res = await upload('padded.txt', NUL_AFTER_PREAMBLE, 'text/plain');
      expect(res.status).toBe(400);
    });

    it('bytes nothing can identify, even when named .pdf', async () => {
      // MAP has an old "named .pdf and unidentified, allow it" path. Documents
      // must not: a real PDF is identified by its bytes and needs no exception.
      const res = await upload('garbage.pdf', UNIDENTIFIABLE, 'application/pdf');
      expect(res.status).toBe(400);
    });

    it('bytes nothing can identify, named .md', async () => {
      const res = await upload('garbage.md', UNIDENTIFIABLE, 'text/markdown');
      expect(res.status).toBe(400);
    });
  });

  describe('refuses formats that are not supported', () => {
    it('an EPUB', async () => {
      const res = await upload('book.epub', TEXT, 'application/epub+zip');
      expect(res.status).toBe(400);
    });

    it('an HTML file by its real name', async () => {
      const res = await upload('page.html', HTML_AS_MD, 'text/html');
      expect(res.status).toBe(400);
    });

    it('an executable by its real name', async () => {
      const res = await upload('tool.exe', elf, 'application/octet-stream');
      expect(res.status).toBe(400);
    });

    it('a document sent as type OTHER', async () => {
      const res = await upload('rules.pdf', PDF, 'application/pdf', 'OTHER');
      expect(res.status).toBe(400);
    });
  });

  describe('scope rules, answered by the one shared decision', () => {
    /**
     * The upload route used to carry these checks inline; they now come from
     * canPlaceAssetAtScope so the document-creation route can ask the same
     * question. The wording is pinned because nothing else pins it, and a
     * refactor that changed a message would otherwise pass every test.
     */
    it('refuses GLOBAL for an ordinary user, with the original wording', async () => {
      const res = await agent
        .post('/api/assets/upload')
        .field('type', 'DOCUMENT')
        .field('scope', 'GLOBAL')
        .attach('file', TEXT, { filename: 'g.txt', contentType: 'text/plain' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Only administrators or global asset managers can upload GLOBAL assets');
    });

    it('refuses CAMPAIGN with no campaign id, with the original wording', async () => {
      const res = await agent
        .post('/api/assets/upload')
        .field('type', 'DOCUMENT')
        .field('scope', 'CAMPAIGN')
        .attach('file', TEXT, { filename: 'c.txt', contentType: 'text/plain' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Campaign ID is required for CAMPAIGN scope');
    });

    it('refuses CAMPAIGN for a non-member, with the original wording', async () => {
      const res = await agent
        .post('/api/assets/upload')
        .field('type', 'DOCUMENT')
        .field('scope', 'CAMPAIGN')
        .field('campaignId', '00000000-0000-4000-8000-000000000000')
        .attach('file', TEXT, { filename: 'c.txt', contentType: 'text/plain' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('You do not have access to this campaign');
    });
  });

  it('cleans the temp directory after every refusal above', () => {
    // Runs last. The five accepted uploads prove the refusals above have
    // already happened, so an empty temp directory means each one deleted
    // its file instead of leaking it.
    expect(uploadedIds).toHaveLength(5);
    expect(filesInTemp()).toEqual([]);
  });
});
