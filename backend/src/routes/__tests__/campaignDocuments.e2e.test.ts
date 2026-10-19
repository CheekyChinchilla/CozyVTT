/**
 * Sharing and reading documents — End-to-End Tests
 *
 * The rule under test: a document is private to its uploader until a DM links
 * it to a campaign, and then that campaign's members can read it. Everyone else
 * gets 404, not 403, so a reply never confirms a private id exists.
 *
 * Also pinned: what the serving route puts on the wire. The content type must
 * come from the validated extension and never from the stored MIME type, so a
 * Markdown file that is secretly HTML is served as text/plain. The response
 * carries nosniff and a sandbox CSP; the CSP matters for text opened directly
 * and does nothing for a PDF, which is why the reader sandboxes its own frame.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-campaigndocs-test-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { createTestApp } from '../../__tests__/helpers/test-app';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const app = createTestApp();

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const MARKDOWN_THAT_IS_HTML = Buffer.from('<html><body><script>document.title="pwned"</script></body></html>\n');
const TEXT = Buffer.from('Just some notes.\n');

describe('campaign documents', () => {
  let ownerId: string;   // uploads the documents, and is DM of campaign A
  let playerId: string;  // member of campaign A only
  let strangerId: string; // member of campaign B only
  let campaignA: string;
  let campaignB: string;
  const emails: Record<string, string> = {};
  const assetIds: string[] = [];

  let owner: ReturnType<typeof request.agent>;
  let player: ReturnType<typeof request.agent>;
  let stranger: ReturnType<typeof request.agent>;

  let pdfId: string;
  let mdId: string;
  let txtId: string;

  async function login(email: string) {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  }

  async function uploadAs(agent: ReturnType<typeof request.agent>, name: string, body: Buffer, mime: string) {
    const res = await agent
      .post('/api/assets/upload')
      .field('type', 'DOCUMENT')
      .field('scope', 'USER')
      .attach('file', body, { filename: name, contentType: mime });
    expect(res.status).toBe(201);
    assetIds.push(res.body.asset.id);
    return res.body.asset.id as string;
  }

  beforeAll(async () => {
    const stamp = Date.now();
    for (const who of ['owner', 'player', 'stranger']) {
      emails[who] = `campdocs-${who}-${stamp}@test.cozyvtt.local`;
    }
    const [o, p, s] = await Promise.all([
      createTestUser({ email: emails.owner, displayName: 'Doc Owner' }),
      createTestUser({ email: emails.player, displayName: 'Doc Player' }),
      createTestUser({ email: emails.stranger, displayName: 'Doc Stranger' }),
    ]);
    ownerId = o.id; playerId = p.id; strangerId = s.id;

    campaignA = (await createTestCampaign(ownerId, { name: `Docs A ${stamp}` })).id;
    campaignB = (await createTestCampaign(strangerId, { name: `Docs B ${stamp}` })).id;
    await prisma.campaignMembership.createMany({
      data: [
        { userId: ownerId, campaignId: campaignA, role: 'DM', characterIds: [] },
        { userId: playerId, campaignId: campaignA, role: 'PLAYER', characterIds: [] },
        { userId: strangerId, campaignId: campaignB, role: 'DM', characterIds: [] },
      ],
    });

    [owner, player, stranger] = await Promise.all([login(emails.owner), login(emails.player), login(emails.stranger)]);

    pdfId = await uploadAs(owner, 'rules.pdf', PDF, 'application/pdf');
    mdId = await uploadAs(owner, 'sneaky.md', MARKDOWN_THAT_IS_HTML, 'text/markdown');
    txtId = await uploadAs(owner, 'notes.txt', TEXT, 'text/plain');
  });

  afterAll(async () => {
    await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
    await cleanupCampaigns([campaignA, campaignB]);
    await cleanupUsers([ownerId, playerId, strangerId]);
    await prisma.$disconnect();
    fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await prisma.campaignDocument.deleteMany({ where: { campaignId: { in: [campaignA, campaignB] } } });
  });

  const serve = (agent: ReturnType<typeof request.agent>, id: string) => agent.get(`/api/assets/documents/${id}`);
  const link = (agent: ReturnType<typeof request.agent>, cid: string, assetId: string) =>
    agent.post(`/api/campaigns/${cid}/documents`).send({ assetId });

  describe('before a document is shared', () => {
    it('the uploader can read it', async () => {
      expect((await serve(owner, pdfId)).status).toBe(200);
    });

    it('a member of the uploader\'s campaign cannot', async () => {
      // Being at the same table is not access. The DM has to share it.
      expect((await serve(player, pdfId)).status).toBe(404);
    });

    it('a stranger cannot, and gets 404 not 403', async () => {
      expect((await serve(stranger, pdfId)).status).toBe(404);
    });

    it('nobody sees it in the campaign list', async () => {
      const res = await player.get(`/api/campaigns/${campaignA}/documents`);
      expect(res.status).toBe(200);
      expect(res.body.documents).toEqual([]);
    });
  });

  describe('sharing', () => {
    it('the DM can share a document they can read', async () => {
      expect((await link(owner, campaignA, pdfId)).status).toBe(201);
    });

    it('sharing twice is not an error', async () => {
      expect((await link(owner, campaignA, pdfId)).status).toBe(201);
      expect((await link(owner, campaignA, pdfId)).status).toBe(201);
      expect(await prisma.campaignDocument.count({ where: { campaignId: campaignA, assetId: pdfId } })).toBe(1);
    });

    it('a player cannot share', async () => {
      expect((await link(player, campaignA, pdfId)).status).toBe(403);
    });

    it('a DM cannot share a document they cannot read', async () => {
      // The stranger is DM of campaign B but has never seen the owner's file.
      // Allowing this would let any DM grant a whole table access to a private
      // file from nothing but its id.
      const res = await link(stranger, campaignB, pdfId);
      expect(res.status).toBe(404);
      expect(await prisma.campaignDocument.count({ where: { assetId: pdfId } })).toBe(0);
    });

    it('a DM cannot pass on a document that was merely shared with them', async () => {
      // The owner shares with campaign A. The stranger sits in A as a player
      // and runs campaign B. Reading it in A must not let them share it into
      // B: the owner chose one table, not every table a member of it runs.
      await link(owner, campaignA, pdfId);
      const seat = await prisma.campaignMembership.create({
        data: { userId: strangerId, campaignId: campaignA, role: 'PLAYER', characterIds: [] },
      });
      try {
        expect((await serve(stranger, pdfId)).status).toBe(200);
        const res = await link(stranger, campaignB, pdfId);
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/uploaded/i);
        expect(await prisma.campaignDocument.count({ where: { campaignId: campaignB } })).toBe(0);
      } finally {
        await prisma.campaignMembership.delete({ where: { id: seat.id } });
      }
    });

    it('a DM can share a global document they did not upload', async () => {
      const global = await prisma.asset.create({
        data: {
          type: 'DOCUMENT', scope: 'GLOBAL', uploadedById: ownerId,
          filename: 'srd.pdf', originalName: 'srd.pdf', mimeType: 'application/pdf', fileSize: 1,
          filePath: '/nonexistent/srd.pdf', name: 'Everyone\'s rules',
        },
      });
      assetIds.push(global.id);
      expect((await link(stranger, campaignB, global.id)).status).toBe(201);
    });

    it('refuses an asset that is not a document', async () => {
      const png = await prisma.asset.create({
        data: {
          type: 'MAP', scope: 'USER', uploadedById: ownerId,
          filename: 'x.png', originalName: 'x.png', mimeType: 'image/png', fileSize: 1,
          filePath: '/nonexistent/x.png', name: 'Not a document',
        },
      });
      assetIds.push(png.id);
      expect((await link(owner, campaignA, png.id)).status).toBe(404);
    });

    it('refuses a malformed id', async () => {
      expect((await link(owner, campaignA, 'not-a-uuid')).status).toBe(400);
    });
  });

  describe('once shared', () => {
    beforeEach(async () => {
      await link(owner, campaignA, pdfId);
    });

    it('a member can read it', async () => {
      expect((await serve(player, pdfId)).status).toBe(200);
    });

    it('a member sees it in the campaign list', async () => {
      const res = await player.get(`/api/campaigns/${campaignA}/documents`);
      expect(res.body.documents.map((d: { id: string }) => d.id)).toEqual([pdfId]);
      expect(res.body.documents[0].uploadedBy.displayName).toBe('Doc Owner');
    });

    it('someone in a different campaign still cannot', async () => {
      expect((await serve(stranger, pdfId)).status).toBe(404);
    });

    it('unsharing revokes reading', async () => {
      expect((await owner.delete(`/api/campaigns/${campaignA}/documents/${pdfId}`)).status).toBe(200);
      expect((await serve(player, pdfId)).status).toBe(404);
    });

    it('a player cannot unshare', async () => {
      expect((await player.delete(`/api/campaigns/${campaignA}/documents/${pdfId}`)).status).toBe(403);
      expect((await serve(player, pdfId)).status).toBe(200);
    });

    it('unsharing something not shared is 404', async () => {
      expect((await owner.delete(`/api/campaigns/${campaignA}/documents/${txtId}`)).status).toBe(404);
    });
  });

  describe('what the serving route puts on the wire', () => {
    it('serves a PDF as application/pdf', async () => {
      const res = await serve(owner, pdfId);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^application\/pdf/);
    });

    it('serves Markdown as text/plain, even when the bytes are HTML', async () => {
      // This is the polyglot defence. The stored mimeType says text/markdown
      // and the bytes are a page with a script in it. Neither is allowed to
      // decide what the browser sees.
      const res = await serve(owner, mdId);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/plain/);
      expect(res.headers['content-type']).not.toMatch(/html|markdown/);
      expect(res.text).toContain('<script>');
    });

    it('serves plain text as text/plain', async () => {
      const res = await serve(owner, txtId);
      expect(res.headers['content-type']).toMatch(/^text\/plain/);
    });

    it('sandboxes the response and forbids sniffing', async () => {
      const res = await serve(owner, pdfId);
      expect(res.headers['content-security-policy']).toMatch(/default-src 'none'/);
      expect(res.headers['content-security-policy']).toMatch(/sandbox/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition']).toMatch(/^inline/);
    });

    it('ignores the stored mimeType entirely', async () => {
      // Tamper with the row the way a compromised upload path might.
      await prisma.asset.update({ where: { id: txtId }, data: { mimeType: 'text/html' } });
      const res = await serve(owner, txtId);
      expect(res.headers['content-type']).toMatch(/^text\/plain/);
      await prisma.asset.update({ where: { id: txtId }, data: { mimeType: 'text/plain' } });
    });

    it('refuses to serve a non-document through this route', async () => {
      const png = await prisma.asset.create({
        data: {
          type: 'MAP', scope: 'USER', uploadedById: ownerId,
          filename: 'y.png', originalName: 'y.png', mimeType: 'image/png', fileSize: 1,
          filePath: '/nonexistent/y.png', name: 'A map',
        },
      });
      assetIds.push(png.id);
      expect((await serve(owner, png.id)).status).toBe(404);
    });

    it('refuses an unauthenticated caller', async () => {
      expect((await request(app).get(`/api/assets/documents/${pdfId}`)).status).toBe(401);
    });
  });

  describe('downloading follows the same rule as reading', () => {
    /**
     * The download route had its own copy of the access rules, older than
     * canReadAsset and missing what it knows. A member who could read a shared
     * document inline was refused when downloading the same bytes.
     */
    const download = (agent: ReturnType<typeof request.agent>, id: string) =>
      agent.get(`/api/assets/${id}/download`);

    it('a member can download a document shared with their campaign', async () => {
      await link(owner, campaignA, pdfId);
      const res = await download(player, pdfId);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/attachment/);
    });

    it('a member cannot download one that is not shared', async () => {
      expect((await download(player, txtId)).status).toBe(404);
    });

    it('a stranger cannot download a shared document', async () => {
      await link(owner, campaignA, pdfId);
      expect((await download(stranger, pdfId)).status).toBe(404);
    });
  });

  describe('the asset library keeps documents separate', () => {
    /**
     * Documents have their own section. A rulebook among map thumbnails is
     * what the separation exists to avoid, so listing assets with no type
     * leaves documents out, and asking for DOCUMENT is how they are fetched.
     */
    it('a list with no type does not include documents', async () => {
      const res = await owner.get('/api/assets?limit=100');
      expect(res.status).toBe(200);
      const types = new Set(res.body.assets.map((a: { type: string }) => a.type));
      expect(types.has('DOCUMENT')).toBe(false);
    });

    it('a list asking for DOCUMENT returns only documents', async () => {
      const res = await owner.get('/api/assets?type=DOCUMENT&limit=100');
      expect(res.status).toBe(200);
      const ids = res.body.assets.map((a: { id: string }) => a.id);
      expect(ids).toEqual(expect.arrayContaining([pdfId, mdId, txtId]));
      for (const a of res.body.assets) expect(a.type).toBe('DOCUMENT');
    });
  });

  describe('creating a document from typed text', () => {
    const create = (agent: ReturnType<typeof request.agent>, body: Record<string, unknown>) =>
      agent.post('/api/assets/documents').send(body);

    it('creates a personal Markdown document and serves it back as text', async () => {
      const res = await create(owner, { name: 'Typed Rules', format: 'md', content: '# Typed\n\nHello' });
      expect(res.status).toBe(201);
      assetIds.push(res.body.asset.id);
      expect(res.body.asset.type).toBe('DOCUMENT');
      expect(res.body.asset.scope).toBe('USER');
      expect(res.body.asset.originalName).toBe('Typed Rules.md');
      expect(res.body.asset.fileSize).toBe(Buffer.byteLength('# Typed\n\nHello'));

      const served = await serve(owner, res.body.asset.id);
      expect(served.status).toBe(200);
      expect(served.headers['content-type']).toMatch(/^text\/plain/);
      expect(served.text).toBe('# Typed\n\nHello');
    });

    it('a DM can create a campaign document that members read at once', async () => {
      const res = await create(owner, {
        name: 'Table Notes', format: 'txt', content: 'Session 1', scope: 'CAMPAIGN', campaignId: campaignA,
      });
      expect(res.status).toBe(201);
      assetIds.push(res.body.asset.id);
      expect(res.body.asset.campaignId).toBe(campaignA);

      // No share step: it is the campaign's own.
      expect((await serve(player, res.body.asset.id)).status).toBe(200);
      const list = await player.get(`/api/campaigns/${campaignA}/documents`);
      const entry = list.body.documents.find((d: { id: string }) => d.id === res.body.asset.id);
      expect(entry).toBeDefined();
      expect(entry.shared).toBe(false);
    });

    it('a player cannot create a campaign document', async () => {
      const res = await create(player, {
        name: 'Nope', format: 'txt', content: 'x', scope: 'CAMPAIGN', campaignId: campaignA,
      });
      expect(res.status).toBe(403);
    });

    it('an ordinary user cannot create a global document', async () => {
      const res = await create(owner, { name: 'Nope', format: 'txt', content: 'x', scope: 'GLOBAL' });
      expect(res.status).toBe(403);
    });

    it('stores hostile text exactly, and the serving route neutralises it', async () => {
      const hostile = '<script>document.title="pwned"</script>\n[x](javascript:alert(1))';
      const res = await create(owner, { name: 'Hostile', format: 'md', content: hostile });
      expect(res.status).toBe(201);
      assetIds.push(res.body.asset.id);

      const served = await serve(owner, res.body.asset.id);
      expect(served.headers['content-type']).toMatch(/^text\/plain/);
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      expect(served.text).toBe(hostile);
    });

    it('refuses a NUL byte in the content', async () => {
      const res = await create(owner, { name: 'Bad', format: 'txt', content: 'a\u0000b' });
      expect(res.status).toBe(400);
    });

    it('refuses a format that cannot be typed', async () => {
      expect((await create(owner, { name: 'Bad', format: 'pdf', content: '%PDF-' })).status).toBe(400);
    });

    it('refuses an unauthenticated caller', async () => {
      expect((await request(app).post('/api/assets/documents').send({ name: 'x', format: 'txt', content: 'x' })).status).toBe(401);
    });
  });

  describe('editing a document', () => {
    const edit = (agent: ReturnType<typeof request.agent>, id: string, content: string) =>
      agent.put(`/api/assets/documents/${id}/content`).send({ content });

    it('the uploader can replace the text, and the size follows', async () => {
      const res = await edit(owner, txtId, 'Rewritten.');
      expect(res.status).toBe(200);
      expect(res.body.asset.fileSize).toBe(Buffer.byteLength('Rewritten.'));
      expect((await serve(owner, txtId)).text).toBe('Rewritten.');
      // put it back for the other tests
      await edit(owner, txtId, TEXT.toString());
    });

    it('a member of a campaign it is shared with cannot edit it', async () => {
      await link(owner, campaignA, txtId);
      expect((await serve(player, txtId)).status).toBe(200);
      // Reading is not editing. 404, so the answer does not confirm the id.
      expect((await edit(player, txtId, 'vandalised')).status).toBe(404);
      expect((await serve(owner, txtId)).text).toBe(TEXT.toString());
    });

    it('a stranger cannot edit it', async () => {
      expect((await edit(stranger, txtId, 'vandalised')).status).toBe(404);
    });

    it('a PDF cannot be edited as text', async () => {
      const res = await edit(owner, pdfId, 'not a pdf any more');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/upload a new file/i);
      // and the bytes are untouched
      expect((await serve(owner, pdfId)).headers['content-type']).toMatch(/^application\/pdf/);
    });

    it('refuses a NUL byte in the new content', async () => {
      expect((await edit(owner, txtId, 'a\u0000b')).status).toBe(400);
      expect((await serve(owner, txtId)).text).toBe(TEXT.toString());
    });

    it('404s on a document that does not exist', async () => {
      expect((await edit(owner, '00000000-0000-4000-8000-000000000000', 'x')).status).toBe(404);
    });

    describe('and reading it again afterwards', () => {
      // The other asset routes cache for a year as immutable, because their
      // files never change under an id. An edited document does. Seen in a
      // browser: save, reopen, and the old text came back from the cache.
      it('is not told to cache the text as immutable', async () => {
        const res = await serve(owner, txtId);
        expect(res.headers['cache-control']).not.toMatch(/immutable/);
        expect(res.headers['cache-control']).toMatch(/no-cache/);
      });

      it('gets a different ETag once the text has changed', async () => {
        const before = (await serve(owner, txtId)).headers['etag'];
        expect(before).toBeTruthy();
        await edit(owner, txtId, 'Changed since you last looked.');
        const after = (await serve(owner, txtId)).headers['etag'];
        expect(after).not.toBe(before);
        await edit(owner, txtId, TEXT.toString());
      });

      it('answers 304 to the current ETag and 200 with the new text to a stale one', async () => {
        const current = (await serve(owner, txtId)).headers['etag'];
        const unchanged = await owner
          .get(`/api/assets/documents/${txtId}`)
          .set('If-None-Match', current);
        expect(unchanged.status).toBe(304);

        await edit(owner, txtId, 'Newer.');
        const revalidated = await owner
          .get(`/api/assets/documents/${txtId}`)
          .set('If-None-Match', current);
        expect(revalidated.status).toBe(200);
        expect(revalidated.text).toBe('Newer.');
        await edit(owner, txtId, TEXT.toString());
      });

      it('still lets a PDF be cached, since a PDF cannot change under its id', async () => {
        const res = await serve(owner, pdfId);
        expect(res.headers['cache-control']).toMatch(/immutable/);
      });
    });
  });

  describe('cascade', () => {
    it('deleting the campaign keeps the document', async () => {
      const stamp = Date.now();
      const doomed = (await createTestCampaign(ownerId, { name: `Doomed ${stamp}` })).id;
      await prisma.campaignMembership.create({ data: { userId: ownerId, campaignId: doomed, role: 'DM', characterIds: [] } });
      expect((await link(owner, doomed, txtId)).status).toBe(201);

      await prisma.campaign.delete({ where: { id: doomed } });

      expect(await prisma.campaignDocument.count({ where: { campaignId: doomed } })).toBe(0);
      expect(await prisma.asset.findUnique({ where: { id: txtId } })).not.toBeNull();
    });

    it('deleting the document removes its links', async () => {
      const extra = await uploadAs(owner, 'temp.txt', TEXT, 'text/plain');
      await link(owner, campaignA, extra);
      expect(await prisma.campaignDocument.count({ where: { assetId: extra } })).toBe(1);

      await prisma.asset.delete({ where: { id: extra } });
      expect(await prisma.campaignDocument.count({ where: { assetId: extra } })).toBe(0);
    });
  });
});
