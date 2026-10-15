/**
 * The campaign role guards, one at a time.
 *
 * Every campaign route runs loadCampaignMembership and then one of the role
 * checks. These pin what each answers on its own; campaignRoleGuards.e2e
 * checks which routes run which.
 */

import type { NextFunction, Response } from 'express';
import type { SessionData } from 'express-session';
import type { CampaignRole } from '@prisma/client';

const mockFindUnique = jest.fn();
jest.mock('../../config/database', () => ({
  prisma: { campaignMembership: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } },
}));
jest.mock('../../utils/logger', () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

import {
  loadCampaignMembership,
  requireDM,
  requireDMOrPlayer,
  requireCampaignRole,
  requireCampaignMember,
  type AuthenticatedRequest,
} from '../rbac';

interface Answer {
  status?: number;
  body?: { error?: string; message?: string };
  nexted: boolean;
}

/** Run one guard on a request shaped as it would arrive, and say what it did. */
async function run(
  guard: (req: AuthenticatedRequest, res: Response, next: NextFunction) => unknown,
  req: { session?: Partial<SessionData>; params?: Record<string, string>; body?: Record<string, unknown>; campaignMembership?: AuthenticatedRequest['campaignMembership'] }
): Promise<Answer & { req: AuthenticatedRequest }> {
  const answer: Answer = { nexted: false };
  const res = {
    status(code: number) {
      answer.status = code;
      return this;
    },
    json(body: Answer['body']) {
      answer.body = body;
      return this;
    },
  } as unknown as Response;
  const request = { session: {}, params: {}, body: {}, ...req } as unknown as AuthenticatedRequest;
  await guard(request, res, () => {
    answer.nexted = true;
  });
  return { ...answer, req: request };
}

const membership = (role: CampaignRole): AuthenticatedRequest['campaignMembership'] => ({ role, characterIds: [], campaignId: 'c1' });

beforeEach(() => mockFindUnique.mockReset());

describe('loadCampaignMembership', () => {
  it('needs a signed-in user', async () => {
    const answer = await run(loadCampaignMembership, { params: { campaignId: 'c1' } });
    expect(answer.status).toBe(401);
    expect(answer.nexted).toBe(false);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('needs a campaign', async () => {
    const answer = await run(loadCampaignMembership, { session: { userId: 'u1' } });
    expect(answer.status).toBe(400);
    expect(answer.nexted).toBe(false);
  });

  it('takes the campaign from the route only, so a body cannot choose one', async () => {
    const answer = await run(loadCampaignMembership, { session: { userId: 'u1' }, body: { campaignId: 'c1' } });
    expect(answer.status).toBe(400);
    expect(answer.body?.message).toBe('Campaign ID is required');
    expect(answer.nexted).toBe(false);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('checks the route\'s campaign when the body names another', async () => {
    mockFindUnique.mockResolvedValue({ role: 'DM', characterIds: [], campaignId: 'c1' });
    await run(loadCampaignMembership, { session: { userId: 'u1' }, params: { campaignId: 'c1' }, body: { campaignId: 'c2' } });
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { userId_campaignId: { userId: 'u1', campaignId: 'c1' } } });
  });

  it('answers 400 for a request with no body and no campaign', async () => {
    const answer = await run(loadCampaignMembership, { session: { userId: 'u1' }, body: undefined });
    expect(answer.status).toBe(400);
    expect(answer.body?.message).toBe('Campaign ID is required');
    expect(answer.nexted).toBe(false);
  });

  it('refuses someone who is not a member', async () => {
    mockFindUnique.mockResolvedValue(null);
    const answer = await run(loadCampaignMembership, { session: { userId: 'u1' }, params: { campaignId: 'c1' } });
    expect(answer.status).toBe(403);
    expect(answer.body?.message).toBe('You are not a member of this campaign');
    expect(answer.nexted).toBe(false);
  });

  it('looks the membership up for the session\'s user, never one the request names', async () => {
    mockFindUnique.mockResolvedValue({ role: 'PLAYER', characterIds: ['ch1'], campaignId: 'c1' });
    const answer = await run(loadCampaignMembership, {
      session: { userId: 'u1' },
      params: { campaignId: 'c1' },
      body: { userId: 'someone-else', role: 'DM' },
    });
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { userId_campaignId: { userId: 'u1', campaignId: 'c1' } } });
    expect(answer.nexted).toBe(true);
    expect(answer.req.campaignMembership).toEqual({ role: 'PLAYER', characterIds: ['ch1'], campaignId: 'c1' });
  });

  it('answers 500, and lets nothing through, when the lookup fails', async () => {
    mockFindUnique.mockRejectedValue(new Error('database down'));
    const answer = await run(loadCampaignMembership, { session: { userId: 'u1' }, params: { campaignId: 'c1' } });
    expect(answer.status).toBe(500);
    expect(answer.nexted).toBe(false);
  });
});

describe('the role checks', () => {
  it.each([
    ['requireDM', requireDM, { DM: true, PLAYER: false, SPECTATOR: false }],
    ['requireDMOrPlayer', requireDMOrPlayer, { DM: true, PLAYER: true, SPECTATOR: false }],
    ['requireCampaignMember', requireCampaignMember, { DM: true, PLAYER: true, SPECTATOR: true }],
    ['requireCampaignRole(PLAYER)', requireCampaignRole('PLAYER'), { DM: false, PLAYER: true, SPECTATOR: false }],
  ] as const)('%s lets through exactly the roles it names', async (_name, guard, allowed) => {
    for (const role of ['DM', 'PLAYER', 'SPECTATOR'] as const) {
      const answer = await run(guard, { campaignMembership: membership(role) });
      expect({ role, nexted: answer.nexted, status: answer.status }).toEqual(
        allowed[role] ? { role, nexted: true, status: undefined } : { role, nexted: false, status: 403 }
      );
    }
  });

  it.each([
    ['requireDM', requireDM],
    ['requireDMOrPlayer', requireDMOrPlayer],
    ['requireCampaignMember', requireCampaignMember],
    ['requireCampaignRole(DM)', requireCampaignRole('DM')],
  ] as const)('%s refuses, and never lets through, a request whose membership was not loaded', async (_name, guard) => {
    const answer = await run(guard, {});
    expect(answer.status).toBe(500);
    expect(answer.nexted).toBe(false);
  });
});
