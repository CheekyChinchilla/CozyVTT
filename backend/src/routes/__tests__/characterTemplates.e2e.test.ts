/**
 * Character Template Routes — End-to-End Tests
 *
 * The permission boundary is the substance of this feature: templates are
 * visible to everyone but editable only by their author, an admin, or a user
 * holding the templateEditor flag. Most of what follows tests exactly that.
 *
 * Requires PostgreSQL at DATABASE_URL (same as the other route e2e tests).
 */

import request from 'supertest';
import { GameSystem, AssetType, AssetScope } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { getBlankCharacterTemplate } from '../../validators/game-systems';
// The app's own GameSystem enum. Same string values as Prisma's, but a
// distinct nominal type, and this is the one the validators are typed against.
import { GameSystem as AppGameSystem } from '../../game-systems';
import {
  prisma,
  createTestUser,
  cleanupUsers,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const app = createTestApp();

/**
 * A valid D&D 5e sheet.
 *
 * Built from the canonical blank the validators already ship rather than
 * hand-written, so this fixture cannot drift out of step with the schema it is
 * checked against — which it did on the first attempt.
 */
const dnd5eSheet = {
  ...(getBlankCharacterTemplate(AppGameSystem.DND_5E) as Record<string, unknown>),
  characterName: 'Template Hero',
};

describe('Character template routes', () => {
  let authorId: string;
  let otherId: string;
  let editorId: string;
  let adminId: string;
  let globalAssetId: string;
  let personalAssetId: string;

  let authorAgent: ReturnType<typeof request.agent>;
  let otherAgent: ReturnType<typeof request.agent>;
  let editorAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;

  async function login(email: string) {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  }

  /** Create a template owned by `agent`, returning the created row. */
  async function createTemplate(
    agent: ReturnType<typeof request.agent>,
    overrides: Record<string, unknown> = {}
  ) {
    const res = await agent.post('/api/character-templates').send({
      name: 'Novice Fighter',
      description: 'A starting point',
      gameSystem: GameSystem.DND_5E,
      data: dnd5eSheet,
      ...overrides,
    });
    return res;
  }

  beforeAll(async () => {
    const stamp = Date.now();
    const author = await createTestUser({ email: `tpl_author_${stamp}@test.invalid`, isApproved: true });
    const other = await createTestUser({ email: `tpl_other_${stamp}@test.invalid`, isApproved: true });
    const editor = await createTestUser({ email: `tpl_editor_${stamp}@test.invalid`, isApproved: true });
    const admin = await createTestUser({
      email: `tpl_admin_${stamp}@test.invalid`,
      isApproved: true,
      role: 'ADMIN',
    });

    authorId = author.id;
    otherId = other.id;
    editorId = editor.id;
    adminId = admin.id;

    await prisma.user.update({ where: { id: editorId }, data: { templateEditor: true } });

    // Two assets to exercise the global-image rule.
    const global = await prisma.asset.create({
      data: {
        name: 'Global Token',
        filename: 'global-token.png',
        originalName: 'global-token.png',
        mimeType: 'image/png',
        fileSize: 1024,
        filePath: 'tokens/global-token.png',
        type: AssetType.TOKEN,
        scope: AssetScope.GLOBAL,
        uploadedById: authorId,
      },
    });
    const personal = await prisma.asset.create({
      data: {
        name: 'Personal Token',
        filename: 'personal-token.png',
        originalName: 'personal-token.png',
        mimeType: 'image/png',
        fileSize: 1024,
        filePath: 'tokens/personal-token.png',
        type: AssetType.TOKEN,
        scope: AssetScope.USER,
        uploadedById: authorId,
      },
    });
    globalAssetId = global.id;
    personalAssetId = personal.id;

    authorAgent = await login(`tpl_author_${stamp}@test.invalid`);
    otherAgent = await login(`tpl_other_${stamp}@test.invalid`);
    editorAgent = await login(`tpl_editor_${stamp}@test.invalid`);
    adminAgent = await login(`tpl_admin_${stamp}@test.invalid`);
  });

  // Only this file's templates: other suites share the database.
  const ownTemplates = () => ({ createdById: { in: [authorId, otherId, editorId, adminId] } });

  afterEach(async () => {
    await prisma.characterTemplate.deleteMany({ where: ownTemplates() });
  });

  afterAll(async () => {
    await prisma.characterTemplate.deleteMany({ where: ownTemplates() });
    await prisma.asset.deleteMany({ where: { id: { in: [globalAssetId, personalAssetId] } } });
    await cleanupUsers([authorId, otherId, editorId, adminId]);
    await prisma.$disconnect();
  });

  describe('creating', () => {
    it('lets any authenticated user publish a template', async () => {
      const res = await createTemplate(authorAgent);

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Novice Fighter');
      expect(res.body.createdById).toBe(authorId);
      expect(res.body.createdBy.displayName).toBeDefined();
    });

    it('does not leak the author\'s email', async () => {
      const res = await createTemplate(authorAgent);
      expect(res.body.createdBy.email).toBeUndefined();
    });

    it('requires a name', async () => {
      const res = await createTemplate(authorAgent, { name: '   ' });
      expect(res.status).toBe(400);
    });

    it('rejects sheet data its own game system would reject', async () => {
      const res = await createTemplate(authorAgent, { data: { characterName: '' } });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/game system schema/i);
    });

    it('accepts free-form data for a flexible template', async () => {
      const res = await createTemplate(authorAgent, {
        gameSystem: null,
        data: { anything: ['at', 'all'] },
      });
      expect(res.status).toBe(201);
    });

    it('refuses an unauthenticated request', async () => {
      const res = await request(app).post('/api/character-templates').send({ name: 'Anon' });
      expect([401, 403]).toContain(res.status);
    });
  });

  // A template is stored as its game system's schema returns it, as a
  // character is: a key the sheet does not declare is dropped on the way in.
  describe('what is stored', () => {
    it('drops a key the schema does not declare when a template is published', async () => {
      const res = await createTemplate(authorAgent, { data: { ...dnd5eSheet, injected: 'nope' } });
      expect(res.status).toBe(201);
      expect(res.body.data).not.toHaveProperty('injected');

      const stored = await prisma.characterTemplate.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.data).not.toHaveProperty('injected');
      expect(stored.data).toMatchObject({ characterName: 'Template Hero', class: 'Fighter' });
    });

    it('drops a key the schema does not declare when a template is saved', async () => {
      const created = await createTemplate(authorAgent);
      expect(created.status).toBe(201);

      const res = await authorAgent
        .put(`/api/character-templates/${created.body.id}`)
        .send({ data: { ...dnd5eSheet, injected: 'nope', nested: { deeper: 1 } } });
      expect(res.status).toBe(200);

      const stored = await prisma.characterTemplate.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(stored.data).not.toHaveProperty('injected');
      expect(stored.data).not.toHaveProperty('nested');
      expect(stored.data).toMatchObject({ characterName: 'Template Hero' });
    });
  });

  // A template is visible to everyone, so its image has to be too. A personal
  // asset would 403 for every reader but its owner.
  describe('the global-image rule', () => {
    it('accepts a global asset', async () => {
      const res = await createTemplate(authorAgent, {
        tokenImageUrl: `/api/assets/tokens/${globalAssetId}`,
      });
      expect(res.status).toBe(201);
      expect(res.body.tokenImageUrl).toBe(`/api/assets/tokens/${globalAssetId}`);
    });

    it('rejects a personal asset, explaining why', async () => {
      const res = await createTemplate(authorAgent, {
        tokenImageUrl: `/api/assets/tokens/${personalAssetId}`,
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/global asset/i);
    });

    it('rejects an asset that does not exist', async () => {
      const res = await createTemplate(authorAgent, {
        tokenImageUrl: '/api/assets/tokens/2f1c8e5a-0000-4000-8000-000000000000',
      });
      expect(res.status).toBe(400);
    });

    it('accepts no image at all', async () => {
      const res = await createTemplate(authorAgent, { tokenImageUrl: null });
      expect(res.status).toBe(201);
      expect(res.body.tokenImageUrl).toBeNull();
    });

    // Every viewer's browser requests the stored address, so anything more
    // than an asset's own address (dot segments, a query) could point it at
    // another page of the app, requested with the viewer's own session.
    it.each([
      ['dot segments', (id: string) => `/api/assets/tokens/${id}/../../../campaigns/x/export`],
      ['a query', (id: string) => `/api/assets/tokens/${id}?v=2`],
      ['another host', (id: string) => `https://elsewhere.example/api/assets/tokens/${id}`],
    ])('rejects an address with %s, on create and on update', async (_label, address) => {
      const created = await createTemplate(authorAgent, { tokenImageUrl: address(globalAssetId) });
      expect(created.status).toBe(400);
      const plain = await createTemplate(authorAgent, {});
      expect(plain.status).toBe(201);
      const updated = await authorAgent
        .put(`/api/character-templates/${plain.body.id}`)
        .send({ tokenImageUrl: address(globalAssetId) });
      expect(updated.status).toBe(400);
    });

    it('accepts a bare asset id, stored as the asset\'s address', async () => {
      const res = await createTemplate(authorAgent, { tokenImageUrl: globalAssetId });
      expect(res.status).toBe(201);
      expect(res.body.tokenImageUrl).toBe(`/api/assets/tokens/${globalAssetId}`);
    });

    it('applies the same rule on update', async () => {
      const created = await createTemplate(authorAgent);
      const res = await authorAgent
        .put(`/api/character-templates/${created.body.id}`)
        .send({ tokenImageUrl: `/api/assets/tokens/${personalAssetId}` });

      expect(res.status).toBe(400);
    });
  });

  describe('visibility', () => {
    it('shows one user\'s template to another', async () => {
      await createTemplate(authorAgent, { name: 'Shared Template' });

      const res = await otherAgent.get('/api/character-templates?limit=100');
      expect(res.status).toBe(200);
      expect(res.body.templates.map((t: { name: string }) => t.name)).toContain('Shared Template');
    });

    it('filters by game system', async () => {
      await createTemplate(authorAgent, { name: 'Fivee' });
      await createTemplate(authorAgent, { name: 'Freeform', gameSystem: null, data: {} });

      const dnd = await otherAgent.get('/api/character-templates?gameSystem=DND_5E&limit=100');
      const names = dnd.body.templates.map((t: { name: string }) => t.name);

      expect(names).toContain('Fivee');
      expect(names).not.toContain('Freeform');
    });

    it('filters flexible templates', async () => {
      await createTemplate(authorAgent, { name: 'Fivee' });
      await createTemplate(authorAgent, { name: 'Freeform', gameSystem: null, data: {} });

      const res = await otherAgent.get('/api/character-templates?gameSystem=flexible&limit=100');
      const names = res.body.templates.map((t: { name: string }) => t.name);

      expect(names).toContain('Freeform');
      expect(names).not.toContain('Fivee');
    });

    it('filters to only your own with mine=true', async () => {
      await createTemplate(authorAgent, { name: 'Mine' });

      const res = await otherAgent.get('/api/character-templates?mine=true&limit=100');
      expect(res.body.templates.map((t: { name: string }) => t.name)).not.toContain('Mine');
    });

    it('searches by name', async () => {
      await createTemplate(authorAgent, { name: 'Grizzled Veteran' });

      const res = await otherAgent.get('/api/character-templates?search=grizzled&limit=100');
      expect(res.body.templates).toHaveLength(1);
    });

    // A page of 100 used to carry 100 full sheets, each up to the body limit.
    it('lists templates without their sheets, and serves the sheet by id', async () => {
      const created = await createTemplate(authorAgent, { name: 'Summary Only' });

      const list = await otherAgent.get('/api/character-templates?search=summary only&limit=100');
      expect(list.status).toBe(200);
      expect(list.body.templates).toHaveLength(1);
      expect(list.body.templates[0]).not.toHaveProperty('data');
      expect(list.body.templates[0]).toMatchObject({
        id: created.body.id,
        name: 'Summary Only',
        gameSystem: GameSystem.DND_5E,
        createdBy: { id: authorId },
      });

      const one = await otherAgent.get(`/api/character-templates/${created.body.id}`);
      expect(one.status).toBe(200);
      expect(one.body.data.characterName).toBe('Template Hero');
    });
  });

  describe('how many one account may publish', () => {
    it('refuses a template past 500, and takes one again after a delete', async () => {
      await prisma.characterTemplate.createMany({
        data: Array.from({ length: 500 }, (_, i) => ({
          id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          name: `Bulk ${i}`,
          gameSystem: null,
          data: {},
          createdById: otherId,
        })),
      });

      const refused = await createTemplate(otherAgent, { name: 'One Too Many' });
      expect(refused.status).toBe(400);
      expect(refused.body.message).toBe(
        'You have already published 500 character templates, the most one account can. Delete one you no longer need to make room.'
      );

      await prisma.characterTemplate.delete({ where: { id: '00000000-0000-4000-8000-000000000000' } });
      expect((await createTemplate(otherAgent, { name: 'Room Again' })).status).toBe(201);
    });
  });

  // The heart of the feature.
  describe('who may edit and delete', () => {
    it('lets the author edit their own', async () => {
      const created = await createTemplate(authorAgent);
      const res = await authorAgent
        .put(`/api/character-templates/${created.body.id}`)
        .send({ name: 'Renamed By Author' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Renamed By Author');
    });

    it('lets the author delete their own', async () => {
      const created = await createTemplate(authorAgent);
      const res = await authorAgent.delete(`/api/character-templates/${created.body.id}`);
      expect(res.status).toBe(200);
    });

    it('refuses an unrelated user editing', async () => {
      const created = await createTemplate(authorAgent);
      const res = await otherAgent
        .put(`/api/character-templates/${created.body.id}`)
        .send({ name: 'Hijacked' });

      expect(res.status).toBe(403);
    });

    it('refuses an unrelated user deleting', async () => {
      const created = await createTemplate(authorAgent);
      const res = await otherAgent.delete(`/api/character-templates/${created.body.id}`);
      expect(res.status).toBe(403);
    });

    it('lets a template editor edit someone else\'s', async () => {
      const created = await createTemplate(authorAgent);
      const res = await editorAgent
        .put(`/api/character-templates/${created.body.id}`)
        .send({ name: 'Curated' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Curated');
    });

    it('lets a template editor delete someone else\'s', async () => {
      const created = await createTemplate(authorAgent);
      const res = await editorAgent.delete(`/api/character-templates/${created.body.id}`);
      expect(res.status).toBe(200);
    });

    it('lets an admin edit someone else\'s', async () => {
      const created = await createTemplate(authorAgent);
      const res = await adminAgent
        .put(`/api/character-templates/${created.body.id}`)
        .send({ name: 'Admin Edit' });

      expect(res.status).toBe(200);
    });

    // Revoking has to actually take effect — the flag is read per request
    // rather than cached in the session, and this proves it.
    it('stops a former template editor once the flag is revoked', async () => {
      const created = await createTemplate(authorAgent);

      await prisma.user.update({ where: { id: editorId }, data: { templateEditor: false } });
      const denied = await editorAgent
        .put(`/api/character-templates/${created.body.id}`)
        .send({ name: 'Should Fail' });
      expect(denied.status).toBe(403);

      await prisma.user.update({ where: { id: editorId }, data: { templateEditor: true } });
      const allowed = await editorAgent
        .put(`/api/character-templates/${created.body.id}`)
        .send({ name: 'Should Work' });
      expect(allowed.status).toBe(200);
    });

    it('rejects an empty update body', async () => {
      const created = await createTemplate(authorAgent);
      const res = await authorAgent.put(`/api/character-templates/${created.body.id}`).send({});
      expect(res.status).toBe(400);
    });

    it('404s for a template that does not exist', async () => {
      const res = await authorAgent
        .put('/api/character-templates/2f1c8e5a-0000-4000-8000-000000000000')
        .send({ name: 'Ghost' });
      expect(res.status).toBe(404);
    });
  });

  describe('a save made from an older version', () => {
    const CHANGED = {
      error: 'Conflict',
      code: 'TEMPLATE_CHANGED',
      message: 'This template was changed after you loaded it. Load it again and make your change on the new version.',
    };

    it('is refused with 409 once someone else has saved, and changes nothing', async () => {
      const created = await createTemplate(authorAgent);
      const loadedAt = created.body.updatedAt as string;

      const first = await editorAgent
        .put(`/api/character-templates/${created.body.id}`)
        .send({ name: 'Saved First', updatedAt: loadedAt });
      expect(first.status).toBe(200);
      expect(first.body.updatedAt).not.toBe(loadedAt);

      const late = await authorAgent
        .put(`/api/character-templates/${created.body.id}`)
        .send({ name: 'Saved Late', data: { ...dnd5eSheet, characterName: 'Late Hero' }, updatedAt: loadedAt });
      expect(late.status).toBe(409);
      expect(late.body).toEqual(CHANGED);

      const stored = await prisma.characterTemplate.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(stored.name).toBe('Saved First');
      expect(stored.data).toMatchObject({ characterName: 'Template Hero' });

      const fresh = await authorAgent
        .put(`/api/character-templates/${created.body.id}`)
        .send({ name: 'Saved Late', updatedAt: first.body.updatedAt });
      expect(fresh.status).toBe(200);
    });

    it('lets only one of two saves made from the same version through', async () => {
      const created = await createTemplate(authorAgent);
      const loadedAt = created.body.updatedAt as string;

      const answers = await Promise.all(
        ['One', 'Two'].map((name) =>
          authorAgent.put(`/api/character-templates/${created.body.id}`).send({ name, updatedAt: loadedAt })
        )
      );
      expect(answers.map((a) => a.status).sort()).toEqual([200, 409]);
    });

    it('goes ahead without updatedAt, and refuses one that is not a timestamp or comes alone', async () => {
      const created = await createTemplate(authorAgent);
      await authorAgent.put(`/api/character-templates/${created.body.id}`).send({ name: 'Moved On' }).expect(200);
      expect((await authorAgent.put(`/api/character-templates/${created.body.id}`).send({ name: 'Again' })).status).toBe(200);

      const notATime = await authorAgent
        .put(`/api/character-templates/${created.body.id}`)
        .send({ name: 'Again', updatedAt: 'yesterday' });
      expect(notATime.status).toBe(400);
      expect(notATime.body.message).toBe('updatedAt must be the ISO timestamp the template was loaded with');

      const alone = await authorAgent
        .put(`/api/character-templates/${created.body.id}`)
        .send({ updatedAt: created.body.updatedAt });
      expect(alone.status).toBe(400);
      expect(alone.body.message).toBe('At least one field must be provided');
    });
  });

  describe('when the author is deleted', () => {
    it('leaves the template standing with no author', async () => {
      const doomed = await createTestUser({
        email: `tpl_doomed_${Date.now()}@test.invalid`,
        isApproved: true,
      });
      const doomedAgent = await login(doomed.email);
      const created = await createTemplate(doomedAgent, { name: 'Outlives Its Author' });

      await cleanupUsers([doomed.id]);

      // Other people may already have copied from it, so it must survive.
      const still = await prisma.characterTemplate.findUnique({ where: { id: created.body.id } });
      expect(still).not.toBeNull();
      expect(still?.createdById).toBeNull();

      await prisma.characterTemplate.delete({ where: { id: created.body.id } });
    });
  });

  describe('copying a template into a character', () => {
    it('produces a character owned by the copier, not the author', async () => {
      const created = await createTemplate(authorAgent, {
        tokenImageUrl: `/api/assets/tokens/${globalAssetId}`,
      });

      // The client copies by POSTing the template's data to the existing
      // character endpoint — there is no separate "use template" route.
      const res = await otherAgent.post('/api/characters').send({
        name: 'Copied Hero',
        gameSystem: created.body.gameSystem,
        data: created.body.data,
        tokenImageUrl: created.body.tokenImageUrl,
      });

      expect(res.status).toBe(201);
      expect(res.body.character.userId).toBe(otherId);
      expect(res.body.character.userId).not.toBe(authorId);
      expect(res.body.character.tokenImageUrl).toBe(`/api/assets/tokens/${globalAssetId}`);

      await prisma.character.delete({ where: { id: res.body.character.id } });
    });
  });
});
