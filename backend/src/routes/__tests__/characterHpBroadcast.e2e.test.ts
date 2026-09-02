/**
 * Live HP after a character sheet save — End-to-End Tests
 *
 * Reported from a live game: changing hit points on the sheet did not reach the
 * campaign screen until the page was refreshed.
 *
 * The campaign screen keeps an HP cache keyed by character id, which feeds both
 * the roster cards and the HP bars drawn on map tokens. Exactly one event fills
 * it — `character.hp.updated` — and until now only the roster's own +/- control
 * emitted it, from a WebSocket handler.
 *
 * Saving the sheet takes a different path: `PUT /api/characters/:id`, which
 * broadcast `character.updated` instead. The campaign page does listen for that,
 * but reads only its `tokensChanged` flag and discards the rest, so HP typed on
 * the sheet reached the database and the broadcast without ever reaching the
 * cache. A refresh re-seeded it from the roster fetch, which is why refreshing
 * "fixed" it.
 *
 * So the sheet save has to emit the same narrow event the cache already
 * understands. These pin that, and pin that it stays quiet when HP did not
 * actually change — the roster and every token bar re-render on it.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';

// Broadcasts are captured rather than delivered: these route tests run with no
// Socket.io server attached, and what is under test is which event the route
// emits, not whether it arrives. Must be named `mock*` — Jest hoists the factory
// above the imports and forbids it referencing anything else out of scope.
const mockBroadcasts: Array<{ campaignId: string; event: string; data: unknown }> = [];

jest.mock('../../websocket/utils', () => ({
  ...jest.requireActual('../../websocket/utils'),
  broadcastToCampaign: jest.fn((campaignId: string, event: string, data: unknown) => {
    mockBroadcasts.push({ campaignId, event, data });
  }),
}));

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

/** A minimal but schema-valid 5e sheet. */
const sheet = (hp: { maximum: number; current: number; temporary: number }) => ({
  characterName: 'Aldra Fenn',
  playerName: 'Test Player',
  class: 'Fighter',
  level: 3,
  race: 'Human',
  proficiencyBonus: 2,
  stats: {
    strength: { score: 16, modifier: 3 },
    dexterity: { score: 12, modifier: 1 },
    constitution: { score: 14, modifier: 2 },
    intelligence: { score: 10, modifier: 0 },
    wisdom: { score: 12, modifier: 1 },
    charisma: { score: 8, modifier: -1 },
  },
  hp,
});

const STARTING_HP = { maximum: 27, current: 27, temporary: 0 };

type HpBroadcast = { characterId: string; hp: { current: number; max: number; temp: number } };

const hpBroadcasts = () =>
  mockBroadcasts
    .filter((b) => b.event === 'character.hp.updated')
    .map((b) => b.data as HpBroadcast);

describe('character HP broadcast on sheet save', () => {
  let dmId: string;
  let playerId: string;
  let campaignId: string;
  let characterId: string;
  let looseCharacterId: string;
  let playerAgent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const stamp = Date.now();
    const dmEmail = `hp_dm_${stamp}@test.invalid`;
    const playerEmail = `hp_pl_${stamp}@test.invalid`;

    const dm = await createTestUser({ email: dmEmail, isApproved: true });
    const player = await createTestUser({ email: playerEmail, isApproved: true });
    dmId = dm.id;
    playerId = player.id;

    const campaign = await createTestCampaign(dmId, { name: `HP Broadcast ${stamp}` });
    campaignId = campaign.id;

    const character = await prisma.character.create({
      data: {
        userId: playerId,
        campaignId,
        name: 'Aldra Fenn',
        gameSystem: 'DND_5E',
        data: sheet(STARTING_HP),
      },
    });
    characterId = character.id;

    // A character belonging to nobody's campaign, to prove the route stays quiet.
    const loose = await prisma.character.create({
      data: {
        userId: playerId,
        name: 'Unassigned',
        gameSystem: 'DND_5E',
        data: sheet(STARTING_HP),
      },
    });
    looseCharacterId = loose.id;

    await prisma.campaignMembership.createMany({
      data: [
        { campaignId, userId: dmId, role: 'DM', characterIds: [] },
        { campaignId, userId: playerId, role: 'PLAYER', characterIds: [characterId] },
      ],
    });

    playerAgent = request.agent(app);
    const login = await playerAgent
      .post('/api/auth/login')
      .send({ email: playerEmail, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
  });

  beforeEach(async () => {
    mockBroadcasts.length = 0;
    await prisma.character.update({
      where: { id: characterId },
      data: { name: 'Aldra Fenn', data: sheet(STARTING_HP) },
    });
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: { in: [characterId, looseCharacterId] } } });
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, playerId]);
    await prisma.$disconnect();
  });

  const save = (id: string, body: Record<string, unknown>) =>
    playerAgent.put(`/api/characters/${id}`).send(body);

  it('broadcasts the new hit points when the sheet lowers them', async () => {
    const res = await save(characterId, {
      data: sheet({ maximum: 27, current: 11, temporary: 0 }),
    });
    expect(res.status).toBe(200);

    expect(hpBroadcasts()).toEqual([
      { characterId, hp: { current: 11, max: 27, temp: 0 } },
    ]);
  });

  // The reported case: it was the *total* that was edited, not damage taken.
  it('broadcasts when the maximum changes', async () => {
    const res = await save(characterId, {
      data: sheet({ maximum: 34, current: 27, temporary: 0 }),
    });
    expect(res.status).toBe(200);

    expect(hpBroadcasts()).toEqual([
      { characterId, hp: { current: 27, max: 34, temp: 0 } },
    ]);
  });

  it('broadcasts when only temporary hit points change', async () => {
    const res = await save(characterId, {
      data: sheet({ maximum: 27, current: 27, temporary: 5 }),
    });
    expect(res.status).toBe(200);

    expect(hpBroadcasts()).toEqual([
      { characterId, hp: { current: 27, max: 27, temp: 5 } },
    ]);
  });

  it('stays quiet when the sheet is saved with the same hit points', async () => {
    const res = await save(characterId, { data: sheet(STARTING_HP) });
    expect(res.status).toBe(200);

    expect(hpBroadcasts()).toEqual([]);
  });

  it('stays quiet when only the name changes', async () => {
    const res = await save(characterId, { name: 'Aldra the Bold' });
    expect(res.status).toBe(200);

    expect(hpBroadcasts()).toEqual([]);
  });

  it('stays quiet for a character that is in no campaign', async () => {
    const res = await save(looseCharacterId, {
      data: sheet({ maximum: 27, current: 3, temporary: 0 }),
    });
    expect(res.status).toBe(200);

    expect(hpBroadcasts()).toEqual([]);
  });

  // The token-image sync rides on `character.updated`; emitting the HP event
  // must not have replaced it.
  it('still broadcasts character.updated alongside', async () => {
    await save(characterId, { data: sheet({ maximum: 27, current: 11, temporary: 0 }) });

    expect(mockBroadcasts.map((b) => b.event)).toContain('character.updated');
  });
});
