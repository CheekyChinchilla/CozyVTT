/**
 * A campaign's sessions move through one path: start, pause and resume as
 * often as needed, end. Each step checks the step before it, and holds the
 * campaign while it does, so two requests at once cannot both pass the
 * check: two Start clicks made two open sessions with the same number, and
 * a Pause landing beside an End left an ended session marked PAUSED.
 *
 * ACTIVE, PAUSED and INACTIVE describe the session, so they are set by these
 * routes alone; the settings route may still mark a campaign in preparation,
 * completed or archived between sessions.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';

// The session routes tell the table over the socket; there is none here.
jest.mock('../../websocket/utils', () => ({
  ...jest.requireActual('../../websocket/utils'),
  broadcastToCampaign: jest.fn(),
}));

// A route can be held inside one of these steps, to land a second request
// beside it: Pause inside its snapshot, Start while it numbers the session.
type Held = 'captureGameState' | 'getNextSessionNumber';
let holdNext: { step: Held; entered: () => void; release: Promise<void> } | null = null;
jest.mock('../../services/sessionState', () => {
  const actual = jest.requireActual('../../services/sessionState');
  const holding = <A extends unknown[], R>(step: Held, fn: (...args: A) => Promise<R>) =>
    jest.fn(async (...args: A) => {
      const hold = holdNext?.step === step ? holdNext : null;
      if (hold) {
        holdNext = null;
        hold.entered();
        await hold.release;
      }
      return fn(...args);
    });
  return {
    ...actual,
    captureGameState: holding('captureGameState', actual.captureGameState),
    getNextSessionNumber: holding('getNextSessionNumber', actual.getNextSessionNumber),
  };
});

import { createTestApp } from '../../__tests__/helpers/test-app';
import { MAX_SESSION_NOTES_LENGTH } from '../../validators/sessionNotes';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const app = createTestApp();

describe('session lifecycle', () => {
  let dmId: string;
  let campaignId: string;
  let dm: ReturnType<typeof request.agent>;

  const sessions = (path = '') => `/api/campaigns/${campaignId}/sessions${path}`;
  const campaignRow = () => prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const sessionRow = (id: string) => prisma.session.findUniqueOrThrow({ where: { id } });

  /** A fresh campaign state for each test: no sessions, in preparation. */
  const reset = async () => {
    await prisma.session.deleteMany({ where: { campaignId } });
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PREPARATION' } });
  };

  const start = async () => {
    const res = await dm.post(sessions()).send({});
    expect(res.status).toBe(201);
    return res.body.session.id as string;
  };

  /**
   * Send `first`, hold it at `step`, send `second`, and let `first` go once
   * `second` is waiting on a lock (2 s at most). `second` must still be
   * waiting then: the campaign is held while `first` runs.
   */
  const beside = async <A, B>(step: Held, first: () => Promise<A>, second: () => Promise<B>) => {
    let entered!: () => void;
    const inStep = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void;
    holdNext = { step, entered, release: new Promise<void>((resolve) => { release = resolve; }) };

    const firstDone = first();
    await inStep;
    let secondFinished = false;
    const secondDone = second().then((r) => { secondFinished = true; return r; });
    for (let waited = 0; waited < 2000 && !secondFinished; waited += 25) {
      const [{ waiting }] = await prisma.$queryRaw<{ waiting: bigint }[]>`SELECT count(*) AS waiting FROM pg_locks WHERE NOT granted`;
      if (waiting > 0n) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    // Held, `second` can only finish after `first` is let go.
    expect(secondFinished).toBe(false);
    release();
    return Promise.all([firstDone, secondDone]);
  };

  beforeAll(async () => {
    const dmUser = await createTestUser({ displayName: 'Lifecycle DM' });
    dmId = dmUser.id;
    campaignId = (await createTestCampaign(dmId, { name: 'Lifecycle' })).id;
    await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
    dm = request.agent(app);
    await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD });
  });

  beforeEach(reset);

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { campaignId } });
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId]);
    await prisma.$disconnect();
  });

  describe('ending a session', () => {
    it('ends it without saving the state, and keeps the snapshot taken at pause', async () => {
      const id = await start();
      expect((await dm.put(sessions(`/${id}/pause`))).status).toBe(200);
      const paused = (await sessionRow(id)).savedState;
      expect(paused).not.toBeNull();

      const res = await dm.put(sessions(`/${id}/end`)).send({ saveState: false });

      expect(res.status).toBe(200);
      expect(res.body.stateSaved).toBe(false);
      const row = await sessionRow(id);
      expect(row.endedAt).not.toBeNull();
      expect(row.savedState).toEqual(paused);
      expect((await campaignRow()).status).toBe('INACTIVE');
    });

    it('refuses a saveState that is not true or false', async () => {
      const id = await start();
      const res = await dm.put(sessions(`/${id}/end`)).send({ saveState: 'false' });
      expect(res.status).toBe(400);
      expect((await sessionRow(id)).endedAt).toBeNull();
    });

    it('refuses notes over the recap limit, as editing them afterwards does', async () => {
      const id = await start();
      const res = await dm.put(sessions(`/${id}/end`)).send({ notes: 'x'.repeat(MAX_SESSION_NOTES_LENGTH + 1) });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(String(MAX_SESSION_NOTES_LENGTH));
      expect((await sessionRow(id)).endedAt).toBeNull();
    });

    it('stores the notes trimmed, and refuses notes that are not text', async () => {
      const id = await start();
      expect((await dm.put(sessions(`/${id}/end`)).send({ notes: { recap: 'x' } })).status).toBe(400);
      expect((await dm.put(sessions(`/${id}/end`)).send({ notes: '  The vault opened.  ' })).status).toBe(200);
      expect((await sessionRow(id)).notes).toBe('The vault opened.');
    });
  });

  describe('starting a session', () => {
    it('is refused while one is paused, which is resumed or ended instead', async () => {
      const id = await start();
      expect((await dm.put(sessions(`/${id}/pause`))).status).toBe(200);

      const res = await dm.post(sessions()).send({});

      expect(res.status).toBe(400);
      expect(await prisma.session.count({ where: { campaignId } })).toBe(1);
      expect((await campaignRow()).status).toBe('PAUSED');
    });

    it('makes one session when two Starts arrive at once', async () => {
      const post = () => dm.post(sessions()).send({}).then((r) => r);
      const results = await beside('getNextSessionNumber', post, post);

      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      const rows = await prisma.session.findMany({ where: { campaignId } });
      expect(rows.map((s) => s.sessionNumber)).toEqual([1]);
    });

    it('starts one when the campaign says a session is running but none is open', async () => {
      // A campaign left PAUSED by an older version, its session already ended.
      const id = await start();
      expect((await dm.put(sessions(`/${id}/end`)).send({})).status).toBe(200);
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });

      const res = await dm.post(sessions()).send({});

      expect(res.status).toBe(201);
      expect(res.body.session.sessionNumber).toBe(2);
      expect((await campaignRow()).status).toBe('ACTIVE');
    });
  });

  describe('pausing a session', () => {
    it('is refused when it is already paused', async () => {
      const id = await start();
      expect((await dm.put(sessions(`/${id}/pause`))).status).toBe(200);
      expect((await dm.put(sessions(`/${id}/pause`))).status).toBe(400);
    });

    it('cannot leave an ended session marked PAUSED when an End lands beside it', async () => {
      const id = await start();

      const [paused, ended] = await beside(
        'captureGameState',
        () => dm.put(sessions(`/${id}/pause`)).then((r) => r),
        () => dm.put(sessions(`/${id}/end`)).send({ saveState: false }).then((r) => r),
      );

      expect(ended.status).toBe(200);
      expect([200, 400]).toContain(paused.status);
      expect((await sessionRow(id)).endedAt).not.toBeNull();
      expect((await campaignRow()).status).toBe('INACTIVE');
    });
  });

  describe('resuming a session', () => {
    it('reopens a paused session and gives its start time', async () => {
      const id = await start();
      const startedAt = (await sessionRow(id)).startedAt.toISOString();
      expect((await dm.put(sessions(`/${id}/pause`))).status).toBe(200);

      const res = await dm.put(`/api/campaigns/${campaignId}/resume`);

      expect(res.status).toBe(200);
      expect(res.body.session).toEqual({ id, sessionNumber: 1, startedAt });
      expect((await campaignRow()).status).toBe('ACTIVE');
    });

    it('does not reopen an ended session', async () => {
      const id = await start();
      expect((await dm.put(sessions(`/${id}/end`)).send({})).status).toBe(200);

      const res = await dm.put(`/api/campaigns/${campaignId}/resume`);

      expect(res.status).toBe(400);
      expect((await sessionRow(id)).endedAt).not.toBeNull();
      expect((await campaignRow()).status).toBe('INACTIVE');
    });

    it('is refused while the session is running', async () => {
      await start();
      expect((await dm.put(`/api/campaigns/${campaignId}/resume`)).status).toBe(400);
    });
  });

  describe('the campaign status in settings', () => {
    it.each(['ACTIVE', 'PAUSED', 'INACTIVE'])('refuses %s, which only a session sets', async (status) => {
      const res = await dm.put(`/api/campaigns/${campaignId}`).send({ status });
      expect(res.status).toBe(400);
      expect((await campaignRow()).status).toBe('PREPARATION');
    });

    it.each(['COMPLETED', 'ARCHIVED', 'PREPARATION'])('sets %s between sessions', async (status) => {
      const res = await dm.put(`/api/campaigns/${campaignId}`).send({ status });
      expect(res.status).toBe(200);
      expect((await campaignRow()).status).toBe(status);
    });

    it('refuses any status while a session is open', async () => {
      await start();
      const res = await dm.put(`/api/campaigns/${campaignId}`).send({ status: 'COMPLETED' });
      expect(res.status).toBe(400);
      expect((await campaignRow()).status).toBe('ACTIVE');
    });
  });
});
