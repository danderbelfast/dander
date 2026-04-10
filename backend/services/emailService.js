'use strict';

/**
 * emailService.js — Transactional email via Resend.
 *
 * All functions are non-fatal: they log errors but never throw,
 * so a failed email never breaks the request that triggered it.
 *
 * Config:
 *   RESEND_API_KEY  — API key from resend.com (required in production)
 *   SMTP_FROM       — sender address (must be verified in Resend)
 *
 * If RESEND_API_KEY is not set, emails are silently skipped (dev mode).
 */

const { Resend } = require('resend');
const pool       = require('../db/pool');

let _resend = null;

function getResend() {
  if (_resend) return _resend;
  if (!process.env.RESEND_API_KEY) return null;
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// ── Fetch a setting from the DB ──────────────────────────────
async function getSetting(key, fallback = '') {
  try {
    const { rows } = await pool.query(
      'SELECT value FROM platform_settings WHERE key = $1',
      [key]
    );
    if (!rows.length) return fallback;
    try { return JSON.parse(rows[0].value); } catch { return rows[0].value; }
  } catch { return fallback; }
}

// ── Core send ────────────────────────────────────────────────
async function sendMail({ to, subject, html, text }) {
  const resend = getResend();
  if (!resend) {
    console.log(`[email] Resend not configured — skipping email to ${to}: "${subject}"`);
    return;
  }
  const from = process.env.SMTP_FROM || 'noreply@dander.app';
  try {
    await resend.emails.send({ from, to, subject, html, text });
    console.log(`[email] Sent "${subject}" to ${to}`);
  } catch (err) {
    console.error(`[email] Failed to send "${subject}" to ${to}:`, err.message);
  }
}

// ── Admin alert: new business registered ────────────────────
async function sendNewBusinessAlert({ businessName, ownerName, ownerEmail }) {
  const adminEmail = await getSetting('admin_notification_email', '');
  if (!adminEmail) return;

  const platformName = await getSetting('platform_name', 'Dander');

  await sendMail({
    to:      adminEmail,
    subject: `[${platformName}] New business application — ${businessName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <h2 style="color:#E85D26">New business application</h2>
        <p>A new business has registered and is awaiting your approval.</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0">
          <tr><td style="padding:8px 0;color:#666;width:140px">Business name</td><td style="font-weight:600">${businessName}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Owner name</td><td>${ownerName}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Owner email</td><td>${ownerEmail}</td></tr>
        </table>
        <p>Log in to the <strong>${platformName} admin panel</strong> to review and approve or reject this application.</p>
      </div>
    `,
    text: `New business application on ${platformName}.\n\nBusiness: ${businessName}\nOwner: ${ownerName} (${ownerEmail})\n\nLog in to the admin panel to approve.`,
  });
}

// ── Welcome email: business approved ────────────────────────
async function sendBusinessApprovedEmail({ ownerEmail, ownerName, businessName }) {
  const platformName   = await getSetting('platform_name',        'Dander');
  const subject        = await getSetting('welcome_email_subject', `Welcome to ${platformName}! Your business is approved 🎉`);
  const customBody     = await getSetting('welcome_email_body',    '');

  const defaultBody = `
    <p>Hi ${ownerName},</p>
    <p>
      Great news — <strong>${businessName}</strong> has been approved and your account is now live on ${platformName}!
    </p>
    <p>You can now log in to your business panel and:</p>
    <ul>
      <li>Complete your business profile</li>
      <li>Upload your logo and cover photo</li>
      <li>Create your first offer and start attracting customers nearby</li>
    </ul>
    <p>
      We're really excited to have you on board. If you have any questions at all,
      just reply to this email and we'll be happy to help.
    </p>
    <p>Welcome to the ${platformName} family! 🎉</p>
  `;

  // Allow admin to override just the body paragraphs
  const bodyHtml = customBody
    ? customBody.split('\n').map((l) => l.trim() ? `<p>${l}</p>` : '').join('')
    : defaultBody;

  await sendMail({
    to:      ownerEmail,
    subject: subject.replace(/\{businessName\}/g, businessName).replace(/\{ownerName\}/g, ownerName),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <div style="background:#E85D26;padding:24px 32px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:1.5rem">${platformName} for Business</h1>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #eee;border-radius:0 0 8px 8px">
          ${bodyHtml}
          <div style="margin-top:24px">
            <a href="http://localhost:3001/login"
               style="background:#E85D26;color:#fff;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">
              Sign in to your dashboard →
            </a>
          </div>
          <p style="margin-top:24px;font-size:0.8rem;color:#999">
            This email was sent by ${platformName}. If you did not register for a business account, please ignore this email.
          </p>
        </div>
      </div>
    `,
    text: `Hi ${ownerName},\n\n${businessName} has been approved on ${platformName}!\n\nSign in at http://localhost:3001/login to get started.\n\nWelcome aboard!`,
  });
}

// ── OTP email ────────────────────────────────────────────────
async function sendOtpEmail({ to, code, purpose, appName = 'Dander' }) {
  // In dev (no Resend key), print the code so login is still possible locally
  if (!process.env.RESEND_API_KEY) {
    console.log(`\n[email:dev] OTP for ${to} (${purpose}): ${code}\n`);
  }
  const isLogin = purpose === 'login';
  const isReset = purpose === 'reset_password';

  const subject = isReset
    ? `${appName} — reset your password`
    : isLogin
    ? `${appName} — your sign-in code`
    : `${appName} — verify your email`;

  const heading = isReset
    ? 'Reset your password'
    : isLogin
    ? 'Your sign-in code'
    : 'Verify your email address';

  const body = isReset
    ? `Use the code below to reset your ${appName} password. If you didn't request this, you can safely ignore this email.`
    : isLogin
    ? `Use the code below to complete signing in to your ${appName} account.`
    : `Use the code below to verify your email address and activate your ${appName} account.`;

  await sendMail({
    to,
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
        <div style="background:#E85D26;padding:20px 32px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0;font-size:1.2rem">${appName}</h2>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #eee;border-radius:0 0 8px 8px">
          <h3 style="margin:0 0 8px">${heading}</h3>
          <p style="color:#555;margin:0 0 24px">${body}</p>
          <div style="background:#f5f5f5;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px">
            <span style="font-size:2.4rem;font-weight:700;letter-spacing:0.2em;font-family:monospace">${code}</span>
          </div>
          <p style="font-size:0.82rem;color:#999;margin:0">
            This code expires in 10 minutes. If you did not request this, please ignore this email.
          </p>
        </div>
      </div>
    `,
    text: `${heading}\n\n${body}\n\nYour code: ${code}\n\nThis code expires in 10 minutes.`,
  });
}

module.exports = { sendNewBusinessAlert, sendBusinessApprovedEmail, sendOtpEmail };
