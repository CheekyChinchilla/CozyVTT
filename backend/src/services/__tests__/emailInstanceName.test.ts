/**
 * Emails carry the instance's name as the admin set it.
 *
 * The setup wizard and Admin → Settings store an instance name, and the
 * guides said emails use it, but the emails read only the INSTANCE_NAME
 * environment variable, which nothing documented, so every email from a
 * renamed instance still said CozyVTT. They now use the stored name; when
 * it is empty or still CozyVTT, INSTANCE_NAME if it is set, so an instance
 * that used the variable keeps its name.
 */

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
const getSystemSettings = jest.fn();
jest.mock('../systemSettings', () => ({ getSystemSettings: () => getSystemSettings() }));

import nodemailer from 'nodemailer';
import { sendWelcomeEmail, sendPasswordResetEmail, sendTestEmail, sendInvitationEmail } from '../email';

interface MailArgs { to: string; subject: string; html: string }
const sendMail = jest.fn<Promise<void>, [MailArgs]>().mockResolvedValue(undefined);
const sent = (): MailArgs => sendMail.mock.calls[0][0];

const savedEnv = process.env.INSTANCE_NAME;

beforeEach(() => {
  sendMail.mockClear();
  getSystemSettings.mockReset();
  delete process.env.INSTANCE_NAME;
  jest.mocked(nodemailer.createTransport).mockReturnValue(
    { sendMail } as unknown as ReturnType<typeof nodemailer.createTransport>,
  );
});

afterAll(() => {
  if (savedEnv === undefined) delete process.env.INSTANCE_NAME;
  else process.env.INSTANCE_NAME = savedEnv;
});

describe('the instance name in emails', () => {
  it('is the name set in the Admin Panel', async () => {
    getSystemSettings.mockResolvedValue({ instanceName: 'Friday Night Table' });

    await sendWelcomeEmail('p@x.test', 'Pat', 'TEMP-PASS-WORD-0000');

    expect(sent().subject).toContain('Welcome to Friday Night Table');
    expect(sent().html).toContain('Friday Night Table');
    expect(sent().html).not.toContain('account for you on CozyVTT');
  });

  it('is used by the password reset, invitation and test emails too', async () => {
    getSystemSettings.mockResolvedValue({ instanceName: 'Friday Night Table' });

    await sendPasswordResetEmail('p@x.test', 'token', 'Pat');
    await sendInvitationEmail('p@x.test', 'token', 'Pat', 'Admin', 7);
    await sendTestEmail('p@x.test', 'Pat');

    for (const [mail] of sendMail.mock.calls) {
      expect(mail.subject).toContain('Friday Night Table');
      expect(mail.html).not.toMatch(/your CozyVTT (account|instance)/);
    }
  });

  it('falls back to INSTANCE_NAME while the stored name is still CozyVTT', async () => {
    getSystemSettings.mockResolvedValue({ instanceName: 'CozyVTT' });
    process.env.INSTANCE_NAME = 'Env Tavern';

    await sendWelcomeEmail('p@x.test', 'Pat', 'TEMP-PASS-WORD-0000');

    expect(sent().subject).toContain('Welcome to Env Tavern');
  });

  it('still sends, as CozyVTT, when the settings cannot be read', async () => {
    getSystemSettings.mockRejectedValue(new Error('database down'));

    await sendWelcomeEmail('p@x.test', 'Pat', 'TEMP-PASS-WORD-0000');

    expect(sent().subject).toContain('Welcome to CozyVTT');
  });
});
