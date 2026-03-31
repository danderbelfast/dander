'use strict';

/**
 * notificationService.js
 *
 * Centralises all outbound SMS messages via Twilio.
 * Failures are always non-fatal — logged but never thrown to callers,
 * so a missing phone number or Twilio misconfiguration never breaks
 * registration / approval flows.
 *
 * Environment variables required:
 *   TWILIO_ACCOUNT_SID   — from the Twilio Console
 *   TWILIO_AUTH_TOKEN    — from the Twilio Console
 *   TWILIO_FROM_NUMBER   — your purchased Twilio phone number (+44…)
 */

// ---------------------------------------------------------------------------
// Lazy Twilio client
// ---------------------------------------------------------------------------

let _client = null;

function getTwilio() {
  if (_client) return _client;
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).');
  }
  _client = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return _client;
}

function fromNumber() {
  const n = process.env.TWILIO_FROM_NUMBER;
  if (!n) throw new Error('TWILIO_FROM_NUMBER is not set.');
  return n;
}

// ---------------------------------------------------------------------------
// Core send function — all public helpers route through here
// ---------------------------------------------------------------------------

/**
 * Send an SMS message.  Never throws; logs failures and resolves to null.
 *
 * @param {string} to      — E.164 phone number, e.g. +447911123456
 * @param {string} message — Plain text body (max 160 chars per segment)
 * @returns {Promise<string|null>} Twilio message SID, or null on failure
 */
async function sendSms(to, message) {
  if (!to) {
    console.warn('[notificationService] sendSms called without a phone number — skipped.');
    return null;
  }

  // Normalise: strip spaces, ensure + prefix
  const phone = to.replace(/\s+/g, '');

  try {
    const twilio = getTwilio();
    const result = await twilio.messages.create({
      body: message,
      from: fromNumber(),
      to:   phone,
    });
    console.log(`[notificationService] SMS sent to ${phone} — SID: ${result.sid}`);
    return result.sid;
  } catch (err) {
    // Non-fatal: Twilio errors should never crash the caller
    console.error(`[notificationService] SMS failed to ${phone}:`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2FA / verification SMS
// ---------------------------------------------------------------------------

/**
 * Send a TOTP setup SMS code during registration.
 * (Backup for users without an authenticator app.)
 *
 * @param {string} phone
 * @param {string} code   — 6-digit TOTP code
 */
async function sendTotpSetupSms(phone, code) {
  return sendSms(
    phone,
    `Dander verification code: ${code}\n\nEnter this in the app to complete 2FA setup. Valid for 30 seconds.`
  );
}

/**
 * Send a login 2FA code.
 *
 * @param {string} phone
 * @param {string} code   — 6-digit TOTP code
 */
async function sendLoginCodeSms(phone, code) {
  return sendSms(
    phone,
    `Your Dander sign-in code is: ${code}\n\nThis code expires in 30 seconds. Don't share it with anyone.`
  );
}

// ---------------------------------------------------------------------------
// Account lifecycle SMS
// ---------------------------------------------------------------------------

/**
 * Welcome SMS sent immediately after a user completes registration.
 *
 * @param {string} phone
 * @param {string} firstName
 */
async function sendWelcomeSms(phone, firstName) {
  return sendSms(
    phone,
    `Hi ${firstName}! Welcome to Dander 🔥 Discover exclusive local deals near you. Open the app to get started.`
  );
}

/**
 * SMS sent to the business owner when their account is approved by an admin.
 *
 * @param {string} phone
 * @param {string} businessName
 */
async function sendBusinessApprovedSms(phone, businessName) {
  return sendSms(
    phone,
    `Great news! "${businessName}" has been approved on Dander. Sign in to your dashboard to create your first offer: https://biz.dander.io`
  );
}

/**
 * SMS sent to a business owner when their account is suspended.
 *
 * @param {string} phone
 * @param {string} businessName
 */
async function sendBusinessSuspendedSms(phone, businessName) {
  return sendSms(
    phone,
    `Your Dander business account "${businessName}" has been suspended. Please contact support@dander.io for details.`
  );
}

/**
 * SMS alert for important account actions (password change, etc.).
 *
 * @param {string} phone
 * @param {string} action — short description, e.g. "password changed"
 */
async function sendSecurityAlertSms(phone, action) {
  return sendSms(
    phone,
    `Dander security alert: your ${action}. If this wasn't you, contact support@dander.io immediately.`
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  sendSms,
  sendTotpSetupSms,
  sendLoginCodeSms,
  sendWelcomeSms,
  sendBusinessApprovedSms,
  sendBusinessSuspendedSms,
  sendSecurityAlertSms,
};
