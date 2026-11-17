/**
 * Personal API keys — End-to-End Tests
 *
 * Managing keys (/api/api-keys) and calling the API with one (X-API-Key):
 * who may hold keys, what a key reaches, that it never rides or leaves a
 * session, and what only a signed-in person may change.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, testEmail, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { hashApiKey } from '../../services/apiKeys';
import { KEY_ROUTE_REFUSED, SESSION_ONLY_MESSAGE } from '../../middleware/apiKeys';

const app = createTestApp();

const created: string[] = [];

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function account(opts: { role?: 'ADMIN' | 'USER'; apiKeysEnabled?: boolean } = {}) {
  const email = testEmail('apikey');
  const user = await createTestUser({ email, role: opts.role ?? 'USER' });
  created.push(user.id);
  if (opts.apiKeysEnabled) await prisma.user.update({ where: { id: user.id }, data: { apiKeysEnabled: true } });
  return { user, email, agent: await login(email) };
}

type Agent = Awaited<ReturnType<typeof login>>;

async function makeKey(agent: Agent, permissions: Record<string, string>, extra: Record<string, unknown> = {}) {
  const res = await agent.post('/api/api-keys').send({ name: 'Integration', permissions, ...extra });
  expect(res.status).toBe(201);
  return { key: res.body.key as string, id: res.body.apiKey.id as string };
}

const withKey = (key: string) => ({ 'X-API-Key': key });

afterAll(async () => {
  await cleanupUsers(created);
});

// Turning keys off for the instance is apiKeysInstanceSwitch.e2e.test.ts, on a
// schema of its own: the switch would refuse the keys of the suites running
// beside it.

describe('who may hold keys', () => {
  it('refuses an account an administrator has not given keys, and lets an administrator', async () => {
    const plain = await account();
    expect((await plain.agent.get('/api/api-keys')).status).toBe(403);
    expect((await plain.agent.post('/api/api-keys').send({ name: 'x' })).status).toBe(403);
    expect((await plain.agent.get('/api/auth/me')).body.user.apiKeysAllowed).toBe(false);

    const admin = await account({ role: 'ADMIN' });
    expect((await admin.agent.get('/api/api-keys')).status).toBe(200);
    expect((await admin.agent.get('/api/auth/me')).body.user.apiKeysAllowed).toBe(true);
  });

  it('lets an administrator give and take away keys, which stops them working at once', async () => {
    const admin = await account({ role: 'ADMIN' });
    const user = await account();
    const grant = await admin.agent.put(`/api/users/${user.user.id}`).send({ apiKeysEnabled: true });
    expect(grant.status).toBe(200);
    expect(grant.body.user.apiKeysEnabled).toBe(true);

    const { key } = await makeKey(user.agent, { campaigns: 'read' });
    expect((await request(app).get('/api/campaigns').set(withKey(key))).status).toBe(200);

    expect((await admin.agent.put(`/api/users/${user.user.id}`).send({ apiKeysEnabled: false })).status).toBe(200);
    const refused = await request(app).get('/api/campaigns').set(withKey(key));
    expect(refused.status).toBe(403);
    expect(refused.body.message).toBe('API keys are not enabled for your account');
    // The owner cannot revoke it either now; an administrator can.
    const [row] = await prisma.apiKey.findMany({ where: { userId: user.user.id } });
    expect((await user.agent.delete(`/api/api-keys/${row.id}`)).status).toBe(403);
    expect((await admin.agent.delete(`/api/api-keys/${row.id}`)).status).toBe(204);
  });

  it('does not let a user give themselves keys', async () => {
    const user = await account();
    expect((await user.agent.put(`/api/users/${user.user.id}`).send({ apiKeysEnabled: true })).status).toBe(403);
  });
});

describe('making and managing keys', () => {
  it('answers the key once, keeps only its hash, and never lists it', async () => {
    const { agent, user } = await account({ apiKeysEnabled: true });
    const res = await agent.post('/api/api-keys').send({ name: '  Foundry bridge  ', permissions: { maps: 'read' } });
    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^cozy_/);
    expect(res.body.apiKey).toMatchObject({ name: 'Foundry bridge', prefix: res.body.key.slice(0, 12), permissions: { maps: 'read' } });

    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: res.body.apiKey.id } });
    expect(row.keyHash).toBe(hashApiKey(res.body.key));
    expect(row.userId).toBe(user.id);

    const listed = await agent.get('/api/api-keys');
    expect(listed.status).toBe(200);
    const text = JSON.stringify(listed.body);
    expect(text).not.toContain(res.body.key);
    expect(text).not.toContain(row.keyHash);
    expect(listed.body.apiKeys[0]).not.toHaveProperty('key');
    expect(listed.body.apiKeys[0]).not.toHaveProperty('keyHash');
  });

  it('refuses a blank or long name, and permissions or levels the account is not offered', async () => {
    const { agent } = await account({ apiKeysEnabled: true });
    expect((await agent.post('/api/api-keys').send({ name: '   ' })).status).toBe(400);
    expect((await agent.post('/api/api-keys').send({ name: 'x'.repeat(101) })).status).toBe(400);
    for (const permissions of [{ wizardry: 'read' }, { 'admin-overview': 'read' }, { maps: 'admin' }, { '*': 'owner' }, ['maps']]) {
      const res = await agent.post('/api/api-keys').send({ name: 'x', permissions });
      expect([JSON.stringify(permissions), res.status]).toEqual([JSON.stringify(permissions), 400]);
    }
    expect((await agent.post('/api/api-keys').send({ name: 'x', permissions: { '*': 'write' } })).status).toBe(201);
  });

  it('offers the administration permissions to administrators only, and Read alone where nothing writes', async () => {
    const user = await account({ apiKeysEnabled: true });
    const admin = await account({ role: 'ADMIN' });
    const ids = (body: { permissions: Array<{ id: string }> }) => body.permissions.map((p) => p.id);
    const userOffer = (await user.agent.get('/api/api-keys/permissions')).body;
    const adminOffer = (await admin.agent.get('/api/api-keys/permissions')).body;
    expect(ids(userOffer)).toContain('maps');
    expect(ids(userOffer).filter((id: string) => id.startsWith('admin-'))).toEqual([]);
    expect(ids(adminOffer)).toEqual(expect.arrayContaining(['admin-overview', 'admin-backups']));
    expect(adminOffer.permissions.find((p: { id: string }) => p.id === 'admin-overview').levels).toEqual(['none', 'read']);
  });

  it('refuses an expiry in the past, keeps one left out of a change, and clears it with null', async () => {
    const { agent } = await account({ apiKeysEnabled: true });
    expect((await agent.post('/api/api-keys').send({ name: 'x', expiresAt: '2001-01-01T00:00:00Z' })).status).toBe(400);
    expect((await agent.post('/api/api-keys').send({ name: 'x', expiresAt: 'tomorrow' })).status).toBe(400);
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    const { id } = await makeKey(agent, {}, { expiresAt });

    const renamed = await agent.patch(`/api/api-keys/${id}`).send({ name: 'Renamed' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.apiKey).toMatchObject({ name: 'Renamed', expiresAt });
    expect((await agent.patch(`/api/api-keys/${id}`).send({ expiresAt: '2001-01-01T00:00:00Z' })).status).toBe(400);
    const cleared = await agent.patch(`/api/api-keys/${id}`).send({ expiresAt: null });
    expect(cleared.body.apiKey.expiresAt).toBeNull();
  });

  it('will not regenerate an expired key, whose new secret could not work', async () => {
    const { agent } = await account({ apiKeysEnabled: true });
    const { id } = await makeKey(agent, {});
    await prisma.apiKey.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await agent.post(`/api/api-keys/${id}/regenerate`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/);
  });

  it('replaces a key\'s secret on regenerate, so the old one stops working at once', async () => {
    const { agent } = await account({ apiKeysEnabled: true });
    const { key, id } = await makeKey(agent, { campaigns: 'read' });
    const res = await agent.post(`/api/api-keys/${id}/regenerate`);
    expect(res.status).toBe(200);
    expect(res.body.key).not.toBe(key);
    expect(res.body.apiKey.permissions).toEqual({ campaigns: 'read' });
    expect((await request(app).get('/api/campaigns').set(withKey(key))).status).toBe(401);
    expect((await request(app).get('/api/campaigns').set(withKey(res.body.key))).status).toBe(200);
  });

  it('answers someone else\'s key as not found, and lets an administrator only revoke it', async () => {
    const owner = await account({ apiKeysEnabled: true });
    const other = await account({ apiKeysEnabled: true });
    const admin = await account({ role: 'ADMIN' });
    const { id } = await makeKey(owner.agent, {});
    expect((await other.agent.patch(`/api/api-keys/${id}`).send({ name: 'Mine now' })).status).toBe(404);
    expect((await other.agent.post(`/api/api-keys/${id}/regenerate`)).status).toBe(404);
    expect((await other.agent.delete(`/api/api-keys/${id}`)).status).toBe(404);
    expect((await admin.agent.patch(`/api/api-keys/${id}`).send({ name: 'Mine now' })).status).toBe(404);
    expect((await admin.agent.post(`/api/api-keys/${id}/regenerate`)).status).toBe(404);

    expect((await other.agent.get('/api/api-keys?all=true')).status).toBe(403);
    const all = await admin.agent.get('/api/api-keys?all=true');
    expect(all.body.apiKeys.find((k: { id: string }) => k.id === id)).toMatchObject({ owner: { email: owner.email } });
    expect((await admin.agent.get('/api/api-keys')).body.apiKeys.find((k: { id: string }) => k.id === id)).toBeUndefined();

    expect((await admin.agent.delete(`/api/api-keys/${id}`)).status).toBe(204);
    const logged = await prisma.systemLog.findFirst({ where: { userId: admin.user.id }, orderBy: { createdAt: 'desc' } });
    expect(logged?.message).toContain(owner.email);
  });

  it('never lets a key manage keys, whatever it holds', async () => {
    const { agent } = await account({ role: 'ADMIN' });
    const { key, id } = await makeKey(agent, { '*': 'write' });
    for (const [method, path] of [
      ['get', '/api/api-keys'],
      ['get', '/api/api-keys/permissions'],
      ['post', '/api/api-keys'],
      ['patch', `/api/api-keys/${id}`],
      ['post', `/api/api-keys/${id}/regenerate`],
      ['delete', `/api/api-keys/${id}`],
    ] as const) {
      const res = await request(app)[method](path).set(withKey(key)).send({ name: 'x' });
      // The router's own lock answers before the route gate would; either refuses.
      expect([method, path, res.status]).toEqual([method, path, 403]);
      expect([KEY_ROUTE_REFUSED, 'API keys cannot manage API keys']).toContain(res.body.message);
    }
    expect(await prisma.apiKey.count({ where: { id } })).toBe(1);
  });

  it('deletes an account\'s keys with the account', async () => {
    const { agent, user } = await account({ apiKeysEnabled: true });
    await makeKey(agent, {});
    await cleanupUsers([user.id]);
    expect(await prisma.apiKey.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe('calling the API with a key', () => {
  it('acts as the owner within the key\'s permissions, and names what is missing', async () => {
    const { agent, user } = await account({ apiKeysEnabled: true });
    const { key } = await makeKey(agent, { campaigns: 'read' });
    const read = await request(app).get('/api/campaigns').set(withKey(key));
    expect(read.status).toBe(200);
    const write = await request(app).post('/api/campaigns').set(withKey(key)).send({ name: 'Nope', gameSystem: 'GENERIC' });
    expect(write.status).toBe(403);
    expect(write.body.message).toBe('This API key needs write access to campaigns (it has read)');
    const other = await request(app).get('/api/characters').set(withKey(key));
    expect(other.body.message).toBe('This API key needs read access to characters (it has none)');

    const self = await request(app).get(`/api/users/${user.id}`).set(withKey(key));
    expect(self.status).toBe(403);
  });

  it('writes as the owner', async () => {
    const { agent, user } = await account({ apiKeysEnabled: true });
    const profile = await makeKey(agent, { profile: 'write' });
    const renamed = await request(app).put(`/api/users/${user.id}`).set(withKey(profile.key)).send({ displayName: 'Renamed by key' });
    expect(renamed.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).displayName).toBe('Renamed by key');
  });

  it('never loads, keeps or sets a session', async () => {
    const { agent } = await account({ apiKeysEnabled: true });
    const { key } = await makeKey(agent, { campaigns: 'read' });
    const res = await request(app).get('/api/campaigns').set(withKey(key));
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('is held to its own permissions even alongside the owner\'s signed-in cookie', async () => {
    const { agent } = await account({ role: 'ADMIN' });
    const { key } = await makeKey(agent, { characters: 'read' });
    expect((await agent.get('/api/campaigns')).status).toBe(200);
    expect((await agent.get('/api/campaigns').set(withKey(key))).status).toBe(403);
    // A wrong key does not fall back to the cookie.
    expect((await agent.get('/api/campaigns').set(withKey('cozy_wrong'))).status).toBe(401);
    expect((await agent.get('/api/campaigns').set(withKey(''))).status).toBe(401);
  });

  it('refuses a key that does not exist or has expired with 401', async () => {
    const { agent } = await account({ apiKeysEnabled: true });
    const { key, id } = await makeKey(agent, { campaigns: 'read' });
    await prisma.apiKey.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(app).get('/api/campaigns').set(withKey(key));
    expect(expired.status).toBe(401);
    expect(expired.body.message).toBe('API key has expired');
    expect((await request(app).get('/api/campaigns').set(withKey('x'.repeat(500)))).status).toBe(401);
  });

  it('uses the owner\'s role as it is now, not as it was when the key was made', async () => {
    const owner = await account({ role: 'ADMIN' });
    const admin = await account({ role: 'ADMIN' });
    const { key } = await makeKey(owner.agent, { 'admin-overview': 'read' });
    expect((await request(app).get('/api/admin/stats').set(withKey(key))).status).toBe(200);
    expect((await admin.agent.put(`/api/users/${owner.user.id}`).send({ platformRole: 'USER' })).status).toBe(200);
    // No longer an administrator, and never given keys: refused outright.
    expect((await request(app).get('/api/admin/stats').set(withKey(key))).status).toBe(403);
    await prisma.user.update({ where: { id: owner.user.id }, data: { apiKeysEnabled: true } });
    const asUser = await request(app).get('/api/admin/stats').set(withKey(key));
    expect(asUser.status).toBe(403);
    expect(asUser.body.message).toBe('You do not have permission to access this resource');
  });

  it('holds the owner to an administrator-issued password as their sign-in is', async () => {
    const { agent, user } = await account({ apiKeysEnabled: true });
    const { key } = await makeKey(agent, { campaigns: 'read' });
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    const res = await request(app).get('/api/campaigns').set(withKey(key));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('records when a key was last used, at most once a minute', async () => {
    const { agent } = await account({ apiKeysEnabled: true });
    const { key, id } = await makeKey(agent, { campaigns: 'read' });
    expect((await prisma.apiKey.findUniqueOrThrow({ where: { id } })).lastUsedAt).toBeNull();
    await request(app).get('/api/campaigns').set(withKey(key));
    const first = (await prisma.apiKey.findUniqueOrThrow({ where: { id } })).lastUsedAt;
    expect(first).not.toBeNull();
    await request(app).get('/api/campaigns').set(withKey(key));
    expect((await prisma.apiKey.findUniqueOrThrow({ where: { id } })).lastUsedAt).toEqual(first);
  });

  it('gives "Everything" no administration, which is granted one by one', async () => {
    const { agent } = await account({ role: 'ADMIN' });
    const { key } = await makeKey(agent, { '*': 'write' });
    const res = await request(app).get('/api/admin/stats').set(withKey(key));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('This API key needs read access to admin-overview (it has none)');
    expect((await request(app).get('/api/campaigns').set(withKey(key))).status).toBe(200);
  });

  it('never downloads a backup, which holds every password hash', async () => {
    const { agent } = await account({ role: 'ADMIN' });
    const { key } = await makeKey(agent, { 'admin-backups': 'write' });
    expect((await request(app).get('/api/admin/backups').set(withKey(key))).status).toBe(200);
    const res = await request(app).get('/api/admin/backups/any.zip/download').set(withKey(key));
    expect([res.status, res.body.message]).toEqual([403, KEY_ROUTE_REFUSED]);
  });

  it('refuses sign-in and account routes, and routes outside /api', async () => {
    const { agent } = await account({ role: 'ADMIN' });
    const { key } = await makeKey(agent, { '*': 'write' });
    for (const [method, path] of [
      ['get', '/api/auth/me'],
      ['post', '/api/auth/change-password'],
      ['delete', '/api/auth/account'],
      ['post', '/api/auth/mfa/setup'],
      ['post', '/api/admin/users'],
      ['post', '/api/admin/backups/restore'],
      ['get', '/health'],
    ] as const) {
      const res = await request(app)[method](path).set(withKey(key)).send({});
      expect([method, path, res.status, res.body.message]).toEqual([method, path, 403, KEY_ROUTE_REFUSED]);
    }
  });
});

describe('what only a signed-in person may change', () => {
  it('refuses a key changing an email address, a role or a permission, and allows sending them unchanged', async () => {
    const admin = await account({ role: 'ADMIN' });
    const target = await account();
    const own = await makeKey(admin.agent, { profile: 'write' });
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
    for (const change of [
      { email: testEmail('moved') },
      { platformRole: 'ADMIN' },
      { globalAssetManager: true },
      { templateEditor: true },
      { apiKeysEnabled: true },
    ]) {
      const res = await request(app).put(`/api/users/${target.user.id}`).set(withKey(own.key)).send(change);
      expect([Object.keys(change)[0], res.status, res.body.message]).toEqual([Object.keys(change)[0], 403, SESSION_ONLY_MESSAGE]);
    }
    const same = await request(app)
      .put(`/api/users/${target.user.id}`)
      .set(withKey(own.key))
      .send({ email: stored.email.toUpperCase(), platformRole: 'USER', templateEditor: false, apiKeysEnabled: false, displayName: 'Still fine' });
    expect(same.status).toBe(200);
  });
});

describe('wrong keys from one address', () => {
  it('are refused with 429 past the limit, while a correct key from there still works', async () => {
    const { agent } = await account({ apiKeysEnabled: true });
    const { key } = await makeKey(agent, { campaigns: 'read' });
    const from = { 'X-Forwarded-For': '203.0.113.77' };
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      statuses.push((await request(app).get('/api/campaigns').set({ ...from, ...withKey(`cozy_wrong_${i}`) })).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses[20]).toBe(429);
    expect((await request(app).get('/api/campaigns').set({ ...from, ...withKey(key) })).status).toBe(200);
    // Another address is not held to this one's count.
    expect((await request(app).get('/api/campaigns').set({ 'X-Forwarded-For': '203.0.113.78', ...withKey('cozy_wrong') })).status).toBe(401);
  });
});
