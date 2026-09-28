/**
 * The tracker's Remove button.
 *
 * Removing the last combatant left an active fight with nobody in it, which
 * the tracker can neither advance nor end: its controls sit beside a
 * combatant, and the server refuses Next and Start on an empty order.
 * Removing the combatant whose turn it was moved the turn to the top of the
 * order, not to the one after them.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { setState, getState, clearState, type CombatantEntry } from '../initiativeState';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
let server: WsTestServer;
let dmId: string;
let campaignId: string;
let mapId: string;
let dm: ClientSocket;

const entry = (tokenId: string, initiative: number): CombatantEntry => ({
  tokenId, mapId, name: tokenId, imageUrl: '', initiative, hp: null, type: 'npc', disposition: null,
});
type Sent = { active: boolean; currentTokenId: string | null; combatants: Array<{ tokenId: string }> };

beforeAll(async () => {
  dmId = (await prisma.user.create({ data: { email: `initremove-${runId}@test.cozyvtt.local`, passwordHash: 'x', displayName: 'DM' } })).id;
  campaignId = (await prisma.campaign.create({ data: { name: `Remove ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  mapId = (await prisma.map.create({
    data: { campaignId, name: 'Remove', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x', width: 10, height: 10, gridSize: 50, annotations: [], tokens: [] },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
});

beforeEach(async () => {
  clearState(campaignId);
  dm = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
});
afterEach(() => dm.disconnect());

afterAll(async () => {
  await server.close();
  clearState(campaignId);
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: dmId } });
  await prisma.$disconnect();
});

it('ends the fight when the last combatant is removed', async () => {
  setState(campaignId, { active: true, round: 3, currentTokenId: 'a', combatants: [entry('a', 12)] });
  const sent = waitForEvent<Sent>(dm, 'initiative.state');
  dm.emit('initiative.remove', { tokenId: 'a' });
  const state = await sent;
  expect(state.active).toBe(false);
  expect(state.combatants).toEqual([]);
  expect(getState(campaignId).active).toBe(false);
});

it("passes the turn to the next combatant when the one whose turn it was is removed", async () => {
  setState(campaignId, { active: true, round: 1, currentTokenId: 'b', combatants: [entry('a', 18), entry('b', 12), entry('c', 6)] });
  const sent = waitForEvent<Sent>(dm, 'initiative.state');
  dm.emit('initiative.remove', { tokenId: 'b' });
  expect((await sent).currentTokenId).toBe('c');
});

it('wraps to the top of the order when the last in line was acting, starting a new round as Next does', async () => {
  setState(campaignId, { active: true, round: 1, currentTokenId: 'c', combatants: [entry('a', 18), entry('b', 12), entry('c', 6)] });
  const sent = waitForEvent<Sent & { round: number }>(dm, 'initiative.state');
  dm.emit('initiative.remove', { tokenId: 'c' });
  const state = await sent;
  expect(state.currentTokenId).toBe('a');
  expect(state.round).toBe(2);
});
