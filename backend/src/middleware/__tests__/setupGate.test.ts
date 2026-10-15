/**
 * The setup gate, which holds every route closed until the setup wizard has
 * run, apart from the wizard's own routes and the health check.
 *
 * It sits ahead of the general rate limiter, so whatever it costs, a request
 * the limiter is about to refuse costs too. Once setup has run it never goes
 * back, so the gate asks the database until it hears that setup is complete
 * and then stops asking; a restore, which replaces the database, makes it ask
 * again.
 *
 * The wizard's routes are /api/setup and what lies under it, and nothing else
 * whose path merely starts with those letters.
 */

jest.mock('../../services/systemSettings', () => ({
  setupState: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import { setupState } from '../../services/systemSettings';
import { requireSetupComplete, forgetSetupComplete } from '../setup';

const setupStateMock = setupState as jest.MockedFunction<typeof setupState>;

function app(): express.Express {
  const a = express();
  a.use(requireSetupComplete);
  a.use((_req, res) => {
    res.status(200).json({ reached: true });
  });
  return a;
}

beforeEach(() => {
  setupStateMock.mockReset();
  forgetSetupComplete();
});

describe('before setup', () => {
  beforeEach(() => {
    setupStateMock.mockResolvedValue({ setupCompleted: false, hasUsers: false });
  });

  it.each(['/api/setup', '/api/setup/', '/api/setup/status', '/api/setup/init', '/health'])('lets %s through', async (url) => {
    const res = await request(app()).get(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reached: true });
  });

  it.each(['/api/setup-x', '/api/setupwizard', '/api/settings', '/api/campaigns', '/healthz'])('holds %s closed', async (url) => {
    const res = await request(app()).get(url);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Setup Required');
  });

  it('asks the database each time, since setup can finish at any moment', async () => {
    const a = app();
    await request(a).get('/api/campaigns');
    await request(a).get('/api/campaigns');
    expect(setupStateMock).toHaveBeenCalledTimes(2);
  });
});

describe('after setup', () => {
  it('stops asking the database once it has heard setup is complete', async () => {
    setupStateMock.mockResolvedValue({ setupCompleted: true, hasUsers: true });
    const a = app();
    for (let i = 0; i < 5; i++) {
      expect((await request(a).get('/api/campaigns')).status).toBe(200);
    }
    expect(setupStateMock).toHaveBeenCalledTimes(1);
  });

  it('asks again after a restore has replaced the database', async () => {
    setupStateMock.mockResolvedValueOnce({ setupCompleted: true, hasUsers: true });
    const a = app();
    expect((await request(a).get('/api/campaigns')).status).toBe(200);

    forgetSetupComplete();
    setupStateMock.mockResolvedValueOnce({ setupCompleted: false, hasUsers: false });
    expect((await request(a).get('/api/campaigns')).status).toBe(403);
    expect(setupStateMock).toHaveBeenCalledTimes(2);
  });

  it('answers 500 and remembers nothing when the database cannot be read', async () => {
    setupStateMock.mockRejectedValueOnce(new Error('connection refused'));
    const a = app();
    expect((await request(a).get('/api/campaigns')).status).toBe(500);
    setupStateMock.mockResolvedValueOnce({ setupCompleted: false, hasUsers: false });
    expect((await request(a).get('/api/campaigns')).status).toBe(403);
  });
});
