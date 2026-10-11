/**
 * Campaign invitation email opt-in — End-to-End Tests
 *
 * Covers `POST /api/campaigns/:campaignId/invite`, which previously emailed the
 * invitee on every invitation with no way to decline. Emailing is now opt-in per
 * invitation and defaults to off.
 *
 * The contract worth pinning: **the invitation is created either way**. It is
 * what the player actually acts on — it appears on their dashboard — so an
 * instance with no mail server, or a DM who would rather tell their player in
 * person, must still be able to invite. That is what separates this route from
 * the admin invite endpoints, which refuse outright when SMTP is missing.
 *
 * This route had no test coverage at all before this file.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';
import { sendCampaignInvitationEmail } from '../../services/email';

// isSmtpConfigured reads process.env directly, so the real implementation is
// kept and the environment is toggled per test instead.
jest.mock('../../services/email', () => {
  const actual = jest.requireActual('../../services/email');
  return { ...actual, sendCampaignInvitationEmail: jest.fn().mockResolvedValue(undefined) };
});

const mockSendEmail = sendCampaignInvitationEmail as jest.MockedFunction<
  typeof sendCampaignInvitationEmail
>;

const app = createTestApp();

describe('POST /api/campaigns/:campaignId/invite', () => {
  let dmId: string;
  let inviteeId: string;
  let campaignId: string;
  let dmAgent: ReturnType<typeof request.agent>;

  const savedEnv = {
    host: process.env.SMTP_HOST,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  };

  function withSmtp(configured: boolean) {
    if (configured) {
      process.env.SMTP_HOST = 'smtp.test.invalid';
      process.env.SMTP_USER = 'test';
      process.env.SMTP_PASS = 'test';
    } else {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
    }
  }

  beforeAll(async () => {
    const stamp = Date.now();
    const dm = await createTestUser({ email: `inv_dm_${stamp}@test.invalid`, isApproved: true });
    const invitee = await createTestUser({ email: `inv_to_${stamp}@test.invalid`, isApproved: true });
    dmId = dm.id;
    inviteeId = invitee.id;

    const campaign = await createTestCampaign(dmId, { name: `Invite Opt-In ${stamp}` });
    campaignId = campaign.id;
    await prisma.campaignMembership.create({
      data: { campaignId, userId: dmId, role: 'DM', characterIds: [] },
    });

    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/login')
      .send({ email: `inv_dm_${stamp}@test.invalid`, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    dmAgent = agent;
  });

  afterEach(async () => {
    mockSendEmail.mockClear();
    await prisma.campaignInvitation.deleteMany({ where: { campaignId } });
  });

  afterAll(async () => {
    process.env.SMTP_HOST = savedEnv.host;
    process.env.SMTP_USER = savedEnv.user;
    process.env.SMTP_PASS = savedEnv.pass;
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, inviteeId]);
    await prisma.$disconnect();
  });

  it('creates the invitation and sends no email by default', async () => {
    withSmtp(true);

    const res = await dmAgent.post(`/api/campaigns/${campaignId}/invite`).send({ userId: inviteeId });

    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();

    const invitation = await prisma.campaignInvitation.findFirst({ where: { campaignId, userId: inviteeId } });
    expect(invitation?.status).toBe('PENDING');
  });

  it('sends the email when the DM asks for it', async () => {
    withSmtp(true);

    const res = await dmAgent
      .post(`/api/campaigns/${campaignId}/invite`)
      .send({ userId: inviteeId, sendEmail: true });

    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('still creates the invitation when email is requested but SMTP is unconfigured', async () => {
    withSmtp(false);

    const res = await dmAgent
      .post(`/api/campaigns/${campaignId}/invite`)
      .send({ userId: inviteeId, sendEmail: true });

    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();

    const invitation = await prisma.campaignInvitation.findFirst({ where: { campaignId, userId: inviteeId } });
    expect(invitation).not.toBeNull();
  });

  it('still creates the invitation when the send throws', async () => {
    withSmtp(true);
    mockSendEmail.mockRejectedValueOnce(new Error('smtp exploded'));

    const res = await dmAgent
      .post(`/api/campaigns/${campaignId}/invite`)
      .send({ userId: inviteeId, sendEmail: true });

    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(false);

    const invitation = await prisma.campaignInvitation.findFirst({ where: { campaignId, userId: inviteeId } });
    expect(invitation).not.toBeNull();
  });

  it('treats a non-true sendEmail as no email', async () => {
    withSmtp(true);

    const res = await dmAgent
      .post(`/api/campaigns/${campaignId}/invite`)
      .send({ userId: inviteeId, sendEmail: 'yes' });

    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

/**
 * Each invitation email goes out from the instance's own mail account, with a
 * campaign name and description the DM wrote, and any user can be a DM of a
 * campaign of their own. So one DM may have the instance send at most 20 of
 * them an hour; invitations without an email are not counted.
 */
describe('emailed invitations per DM', () => {
  const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  let dmId: string;
  let campaignId: string;
  let dmAgent: ReturnType<typeof request.agent>;
  const invitees: string[] = [];
  const saved = { host: process.env.SMTP_HOST, user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };

  beforeAll(async () => {
    process.env.SMTP_HOST = 'smtp.test.invalid';
    process.env.SMTP_USER = 'test';
    process.env.SMTP_PASS = 'test';
    const dm = await createTestUser({ email: `inv_limit_dm_${stamp}@test.invalid` });
    dmId = dm.id;
    campaignId = (await createTestCampaign(dmId, { name: `Invite Limit ${stamp}` })).id;
    await prisma.campaignMembership.create({ data: { campaignId, userId: dmId, role: 'DM', characterIds: [] } });
    for (let i = 0; i < 23; i += 1) {
      const user = await prisma.user.create({
        data: { email: `inv_limit_to_${i}_${stamp}@test.invalid`, passwordHash: 'not-used', displayName: `Invitee ${i}` },
      });
      invitees.push(user.id);
    }
    dmAgent = request.agent(app);
    const res = await dmAgent.post('/api/auth/login').send({ email: dm.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    process.env.SMTP_HOST = saved.host;
    process.env.SMTP_USER = saved.user;
    process.env.SMTP_PASS = saved.pass;
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, ...invitees]);
  });

  it('refuses the 21st emailed invitation in an hour, and still sends invitations without email', async () => {
    const invite = (userId: string, sendEmail: boolean) =>
      dmAgent.post(`/api/campaigns/${campaignId}/invite`).send({ userId, sendEmail });

    // A refused invitation (already invited) sends nothing and is not counted.
    expect((await invite(invitees[0], true)).status).toBe(201);
    expect((await invite(invitees[0], true)).status).toBe(400);

    for (let i = 1; i < 20; i += 1) {
      expect((await invite(invitees[i], true)).status).toBe(201);
    }

    const refused = await invite(invitees[20], true);
    expect(refused.status).toBe(429);
    expect(refused.body.message).toMatch(/20 invitation emails in the last hour/);
    expect(refused.body.message).toMatch(/without the email/);
    expect(await prisma.campaignInvitation.count({ where: { campaignId, userId: invitees[20] } })).toBe(0);

    const plain = await invite(invitees[21], false);
    expect(plain.status).toBe(201);
    expect(plain.body.emailSent).toBe(false);
  });
});
