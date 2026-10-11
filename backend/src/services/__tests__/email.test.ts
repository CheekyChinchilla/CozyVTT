/**
 * Every value a person can type ends up escaped in the email HTML.
 *
 * The senders build HTML by concatenation. Before this test, a display name
 * of `<img src=x onerror=…>` went into the invitation email as markup, so
 * whoever could set a name or a campaign description could put their own
 * HTML in front of the recipient. Subjects are plain-text headers, so they
 * are left as typed; the campaign invitation's carries no text its sender chose.
 */

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

import nodemailer from 'nodemailer';
import {
  sendTestEmail,
  sendWelcomeEmail,
  sendInvitationEmail,
  sendPasswordResetEmail,
  sendCampaignInvitationEmail,
  sendEmailChangedNotice,
} from '../email';

interface MailArgs { to: string; subject: string; html: string }
const sendMail = jest.fn<Promise<void>, [MailArgs]>().mockResolvedValue(undefined);

beforeEach(() => {
  sendMail.mockClear();
  jest.mocked(nodemailer.createTransport).mockReturnValue(
    { sendMail } as unknown as ReturnType<typeof nodemailer.createTransport>,
  );
});

const sent = (): MailArgs => sendMail.mock.calls[0][0];

const IMG = '<img src=x onerror=alert(1)>';
const SCRIPT = '<script>alert(1)</script>';

describe('email HTML escaping', () => {
  it('campaign invitation: name, DM, campaign and description are escaped', async () => {
    await sendCampaignInvitationEmail('p@x.test', IMG, '<i>Tilted</i> "Campaign"', `Bob & <DM>`, SCRIPT);
    const { html } = sent();
    expect(html).not.toContain(IMG);
    expect(html).not.toContain(SCRIPT);
    expect(html).not.toContain('<i>Tilted</i>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;i&gt;Tilted&lt;/i&gt; &quot;Campaign&quot;');
    expect(html).toContain('Bob &amp; &lt;DM&gt;');
  });

  it('campaign invitation: the subject and inbox preview carry no text the DM chose', async () => {
    await sendCampaignInvitationEmail('p@x.test', 'Player', 'Verify your account at evil.example', 'Support Team', null);
    const { html, subject } = sent();
    expect(subject).not.toMatch(/evil\.example|Support Team/);
    expect(subject).toMatch(/campaign invitation/i);
    // The hidden preview line is what an inbox shows beside the subject.
    const preview = /<div style="display:none[^>]*>([^<]*)</.exec(html)?.[1] ?? '';
    expect(preview).not.toMatch(/evil\.example|Support Team/);
  });

  it('account invitation: the inviter and the recipient names are escaped', async () => {
    await sendInvitationEmail('p@x.test', 'tok', IMG, '<b>Inviter</b>', 7);
    const { html } = sent();
    expect(html).not.toContain(IMG);
    expect(html).not.toContain('<b>Inviter</b>');
    expect(html).toContain('&lt;b&gt;Inviter&lt;/b&gt;');
  });

  it('welcome: name, address and temporary password are escaped', async () => {
    await sendWelcomeEmail('a<b@x.test', IMG, 'p<w>"d');
    const { html } = sent();
    expect(html).not.toContain(IMG);
    expect(html).toContain('a&lt;b@x.test');
    expect(html).toContain('p&lt;w&gt;&quot;d');
  });

  it('password reset: the name is escaped', async () => {
    await sendPasswordResetEmail('p@x.test', 'tok', IMG);
    expect(sent().html).not.toContain(IMG);
    expect(sent().html).toContain('&lt;img');
  });

  it('email changed: goes to the old address, with both addresses and the name escaped', async () => {
    await sendEmailChangedNotice('old<a>@x.test', 'new"b"@x.test', IMG);
    const { to, html } = sent();
    expect(to).toBe('old<a>@x.test');
    expect(html).not.toContain(IMG);
    expect(html).toContain('old&lt;a&gt;@x.test');
    expect(html).toContain('new&quot;b&quot;@x.test');
  });

  it('SMTP test: the name is escaped', async () => {
    await sendTestEmail('p@x.test', IMG);
    expect(sent().html).not.toContain(IMG);
  });
});
