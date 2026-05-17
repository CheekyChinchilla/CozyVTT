import nodemailer from 'nodemailer';
import logger from '../utils/logger';

/**
 * Email Service
 * Per SOW Section 19.2: SMTP-based email notifications
 * Gracefully degrades when SMTP is not configured
 */

/**
 * Check if SMTP environment variables are configured
 */
export function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Create nodemailer transporter from environment variables
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Resolved application URL used in email links
 */
function getAppUrl(): string {
  return (process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * Instance display name shown in emails
 */
function getInstanceName(): string {
  return process.env.INSTANCE_NAME || 'CozyVTT';
}

// ============================================
// Shared HTML email layout
// ============================================

/**
 * Wrap content in a styled CozyVTT email shell.
 * All styles are inlined for broad email client compatibility.
 */
function emailLayout(content: string, previewText?: string): string {
  const instanceName = getInstanceName();
  const preview = previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#FDFAF4;">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${instanceName}</title>
</head>
<body style="margin:0;padding:0;background-color:#F5EDD8;font-family:Georgia,'Times New Roman',serif;-webkit-font-smoothing:antialiased;">
${preview}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5EDD8;padding:40px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background-color:#3D6B4F;border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
            <div style="font-size:26px;font-weight:bold;color:#FDFAF4;letter-spacing:1px;">&#x2665; CozyVTT</div>
            ${instanceName !== 'CozyVTT' ? `<div style="font-size:11px;color:#A8C8B0;margin-top:6px;letter-spacing:2px;text-transform:uppercase;">${instanceName}</div>` : ''}
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background-color:#FDFAF4;border-left:1px solid #D4C5A9;border-right:1px solid #D4C5A9;padding:36px 40px;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#EDE5D5;border:1px solid #D4C5A9;border-top:none;border-radius:0 0 12px 12px;padding:20px 40px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;color:#8B7355;font-family:Georgia,'Times New Roman',serif;">
              ${instanceName} &mdash; Self-hosted Virtual Tabletop
            </p>
            <p style="margin:0;font-size:11px;color:#A09070;">
              If you did not expect this email, you can safely ignore it or contact your administrator.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Render a primary CTA button */
function ctaButton(text: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td style="border-radius:8px;background-color:#B45309;">
        <a href="${href}" target="_blank" rel="noopener noreferrer"
           style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:bold;color:#FDFAF4;text-decoration:none;border-radius:8px;font-family:Georgia,'Times New Roman',serif;letter-spacing:0.3px;">
          ${text}
        </a>
      </td>
    </tr>
  </table>`;
}

/** A highlighted info box (green accent) */
function infoBox(content: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
      <td style="background-color:#F0EAD8;border:1px solid #C9B99A;border-left:4px solid #3D6B4F;border-radius:6px;padding:16px 20px;font-size:14px;color:#5C4A2A;font-family:Georgia,'Times New Roman',serif;line-height:1.6;">
        ${content}
      </td>
    </tr>
  </table>`;
}

/** A warning/caution box (amber accent) */
function warningBox(content: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
      <td style="background-color:#FFF8EB;border:1px solid #F5C76E;border-left:4px solid #D97706;border-radius:6px;padding:16px 20px;font-size:13px;color:#7C5A1A;font-family:Georgia,'Times New Roman',serif;line-height:1.6;">
        ${content}
      </td>
    </tr>
  </table>`;
}

const divider =
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">` +
  `<tr><td style="border-top:1px solid #D4C5A9;font-size:0;line-height:0;">&nbsp;</td></tr></table>`;

const p = (text: string) =>
  `<p style="margin:0 0 16px;font-size:15px;color:#3C3028;line-height:1.7;font-family:Georgia,'Times New Roman',serif;">${text}</p>`;

const h2 = (text: string) =>
  `<h2 style="margin:0 0 20px;font-size:22px;font-weight:bold;color:#3D6B4F;font-family:Georgia,'Times New Roman',serif;">${text}</h2>`;

// ============================================
// Email senders
// ============================================

/**
 * Send a test email to verify SMTP configuration
 */
export async function sendTestEmail(toEmail: string, toName: string): Promise<void> {
  const transporter = createTransporter();
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;

  const content =
    h2('SMTP Test Successful') +
    p(`Hello <strong>${toName}</strong>,`) +
    p('This is a test email from your CozyVTT instance. If you received this, your SMTP configuration is working correctly.') +
    divider +
    p('<em style="color:#8B7355;font-size:13px;">No action is required. This email was triggered from the Admin Dashboard.</em>');

  await transporter.sendMail({
    from: fromAddress,
    to: toEmail,
    subject: 'CozyVTT — SMTP Test',
    html: emailLayout(content, 'Your SMTP configuration is working correctly.'),
  });
  logger.info('Email sent', { type: 'smtp_test', to: toEmail });
}

/**
 * Send a welcome email when an admin creates a new user account
 */
export async function sendWelcomeEmail(
  toEmail: string,
  displayName: string,
  temporaryPassword: string
): Promise<void> {
  const transporter = createTransporter();
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const appUrl = getAppUrl();
  const instanceName = getInstanceName();

  const content =
    h2(`Welcome to ${instanceName}!`) +
    p(`Hello <strong>${displayName}</strong>,`) +
    p('An administrator has created an account for you on CozyVTT. You can sign in using the credentials below.') +
    infoBox(
      `<strong>Your login details</strong><br>` +
      `<span style="display:block;margin-top:8px;">Email: <code style="font-family:monospace;background:#E8DFCE;padding:1px 6px;border-radius:3px;">${toEmail}</code></span>` +
      `<span style="display:block;margin-top:4px;">Temporary password: <code style="font-family:monospace;background:#E8DFCE;padding:1px 6px;border-radius:3px;">${temporaryPassword}</code></span>`
    ) +
    warningBox('You will be required to choose a new password the first time you sign in. Do not share this temporary password with anyone.') +
    ctaButton('Sign In Now', `${appUrl}/auth/login`) +
    divider +
    p('<em style="color:#8B7355;font-size:13px;">If you did not expect this account, please contact your administrator immediately.</em>');

  await transporter.sendMail({
    from: fromAddress,
    to: toEmail,
    subject: `Welcome to ${instanceName} — Your account is ready`,
    html: emailLayout(content, `Your ${instanceName} account has been created.`),
  });
  logger.info('Email sent', { type: 'welcome', to: toEmail });
}

/**
 * Send a password reset email with a token link.
 * Used by both the self-service forgot-password flow and admin-initiated resets.
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  displayName: string
): Promise<void> {
  const transporter = createTransporter();
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const appUrl = getAppUrl();
  const resetLink = `${appUrl}/reset-password?token=${token}`;

  const content =
    h2('Password Reset Request') +
    p(`Hello <strong>${displayName}</strong>,`) +
    p('We received a request to reset the password for your CozyVTT account. Click the button below to set a new password.') +
    ctaButton('Reset My Password', resetLink) +
    infoBox(
      `Or copy and paste this link into your browser:<br>` +
      `<span style="word-break:break-all;font-family:monospace;font-size:12px;color:#5C4A2A;">${resetLink}</span>`
    ) +
    warningBox('<strong>This link expires in 1 hour.</strong> If you did not request a password reset, you can safely ignore this email — your password will not change.');

  await transporter.sendMail({
    from: fromAddress,
    to: email,
    subject: 'CozyVTT — Password Reset Request',
    html: emailLayout(content, 'Reset your CozyVTT password.'),
  });
  logger.info('Email sent', { type: 'password_reset', to: email });
}

/**
 * Send a campaign invitation email when a DM invites a player
 */
export async function sendCampaignInvitationEmail(
  toEmail: string,
  displayName: string,
  campaignName: string,
  dmName: string,
  campaignDescription: string | null
): Promise<void> {
  const transporter = createTransporter();
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const appUrl = getAppUrl();
  const instanceName = getInstanceName();

  const descriptionBlock = campaignDescription
    ? infoBox(`<strong>About this campaign:</strong><br><em style="color:#6B5035;">${campaignDescription}</em>`)
    : '';

  const content =
    h2("You've Been Invited!") +
    p(`Hello <strong>${displayName}</strong>,`) +
    p(`<strong>${dmName}</strong> has invited you to join their campaign on ${instanceName}:`) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
      <tr>
        <td style="background-color:#F0EAD8;border:1px solid #C9B99A;border-radius:8px;padding:20px 24px;text-align:center;">
          <div style="font-size:20px;font-weight:bold;color:#3D6B4F;font-family:Georgia,'Times New Roman',serif;">${campaignName}</div>
          <div style="font-size:13px;color:#8B7355;margin-top:4px;font-family:Georgia,'Times New Roman',serif;">Dungeon Master: ${dmName}</div>
        </td>
      </tr>
    </table>` +
    descriptionBlock +
    p('Log in to your account to view and respond to this invitation from your Dashboard.') +
    ctaButton('View Invitation', `${appUrl}/dashboard`) +
    divider +
    p('<em style="color:#8B7355;font-size:13px;">You can accept or decline this invitation from your Dashboard. Invitations may expire if not responded to.</em>');

  await transporter.sendMail({
    from: fromAddress,
    to: toEmail,
    subject: `${instanceName} — ${dmName} invited you to "${campaignName}"`,
    html: emailLayout(content, `You've been invited to join "${campaignName}" on ${instanceName}.`),
  });
  logger.info('Email sent', { type: 'campaign_invitation', to: toEmail, campaign: campaignName });
}
