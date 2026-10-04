/**
 * The API and the live connection refuse a browser request from another
 * site, whatever cookie it carries. See middleware/originCheck.ts.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { io as ioc } from 'socket.io-client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

const app = createTestApp();
let userId: string;
let email: string;
let server: WsTestServer;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Cross-site target' });
  userId = user.id;
  email = user.email;
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

const fromElsewhere = { 'Sec-Fetch-Site': 'same-site', Origin: 'http://localhost:8666' };

it('refuses a state-changing request a browser sent from another site', async () => {
  const res = await request(app).post('/api/auth/login').set(fromElsewhere).send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(403);
  expect(res.headers['set-cookie']).toBeUndefined();
});

it('takes the same request from the page itself, and from a client that is not a browser', async () => {
  expect((await request(app).post('/api/auth/login').set({ 'Sec-Fetch-Site': 'same-origin' }).send({ email, password: TEST_PASSWORD })).status).toBe(200);
  expect((await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
});

it('does not read a plain HTML form body', async () => {
  const res = await request(app).post('/api/auth/login').type('form').send({ email, password: TEST_PASSWORD });
  expect(res.status).not.toBe(200);
});

it('refuses a live connection a browser opened from another site', async () => {
  const cookie = await server.loginAs(userId);
  const client = ioc(server.url, {
    transports: ['websocket'],
    extraHeaders: { cookie, 'sec-fetch-site': 'same-site', origin: 'http://localhost:8666' },
    forceNew: true,
    reconnection: false,
    timeout: 3000,
  });
  const outcome = await new Promise<string>((resolve) => {
    client.on('connected', () => resolve('connected'));
    client.on('connect_error', () => resolve('refused'));
  });
  client.disconnect();
  expect(outcome).toBe('refused');
});
