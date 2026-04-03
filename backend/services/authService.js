'use strict';

/**
 * authService.js
 *
 * Handles all authentication flows:
 *   - User registration with email OTP verification
 *   - Business registration with email OTP verification
 *   - Password + email OTP login
 *   - JWT access token (24 h) and refresh token (30 d) issuance
 */

require('dotenv').config();

const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const pool    = require('../db/pool');
const emailService = require('./emailService');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BCRYPT_ROUNDS     = 12;
const JWT_SECRET        = process.env.JWT_SECRET;
const REFRESH_SECRET    = process.env.JWT_SECRET + ':refresh';
const ACCESS_TOKEN_TTL  = '24h';
const REFRESH_TOKEN_TTL = '30d';
const TEMP_TOKEN_TTL    = '10m'; // issued during login while awaiting OTP
const APP_NAME          = process.env.PLATFORM_NAME || 'Dander';
const OTP_TTL_MINUTES   = 10;

// ---------------------------------------------------------------------------
// Ensure email_otps table exists
// ---------------------------------------------------------------------------

pool.query(`
  CREATE TABLE IF NOT EXISTS email_otps (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code       VARCHAR(6)   NOT NULL,
    purpose    VARCHAR(20)  NOT NULL,
    expires_at TIMESTAMPTZ  NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )
`).catch((err) =>
  console.error('[authService] Failed to create email_otps table:', err.message)
);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Sign a short-lived temp token used while the user completes OTP. */
function signTempToken(userId) {
  return jwt.sign(
    { sub: userId, purpose: 'otp_verify' },
    JWT_SECRET,
    { expiresIn: TEMP_TOKEN_TTL }
  );
}

/** Sign a full access JWT. */
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role ?? 'user' },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

/** Sign a refresh token (separate secret, longer TTL). */
function signRefreshToken(userId) {
  return jwt.sign(
    { sub: userId, purpose: 'refresh' },
    REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL }
  );
}

/** Generate a random 6-digit OTP code. */
function generateOtpCode() {
  return crypto.randomInt(100_000, 999_999).toString();
}

/**
 * Store an OTP code in email_otps and email it to the user.
 * Any previous unused OTPs for this user+purpose are deleted first.
 */
async function issueOtp(userId, email, purpose) {
  const code      = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  // Clear old OTPs for this user+purpose
  await pool.query(
    'DELETE FROM email_otps WHERE user_id = $1 AND purpose = $2',
    [userId, purpose]
  );

  await pool.query(
    'INSERT INTO email_otps (user_id, code, purpose, expires_at) VALUES ($1, $2, $3, $4)',
    [userId, code, purpose, expiresAt]
  );

  await emailService.sendOtpEmail({ to: email, code, purpose, appName: APP_NAME });
  return code; // returned for logging in dev; never expose in HTTP response
}

/**
 * Verify an OTP code for a user+purpose.
 * Throws on invalid / expired / already-used code.
 */
async function verifyOtp(userId, code, purpose) {
  const { rows } = await pool.query(
    `SELECT id, expires_at, used_at
     FROM email_otps
     WHERE user_id = $1 AND code = $2 AND purpose = $3
     ORDER BY created_at DESC LIMIT 1`,
    [userId, code, purpose]
  );

  if (rows.length === 0) {
    const err = new Error('Invalid verification code.');
    err.code   = 'INVALID_OTP';
    err.status = 401;
    throw err;
  }

  const row = rows[0];

  if (row.used_at) {
    const err = new Error('This code has already been used.');
    err.code   = 'INVALID_OTP';
    err.status = 401;
    throw err;
  }

  if (new Date() > new Date(row.expires_at)) {
    const err = new Error('This code has expired. Please request a new one.');
    err.code   = 'OTP_EXPIRED';
    err.status = 401;
    throw err;
  }

  // Mark used
  await pool.query(
    'UPDATE email_otps SET used_at = NOW() WHERE id = $1',
    [row.id]
  );
}

// ---------------------------------------------------------------------------
// 1. registerUser
// ---------------------------------------------------------------------------

/**
 * Registers a new end-user account and sends an email OTP for verification.
 *
 * @returns {{ userId: number }}
 */
async function registerUser(email, phone, password, firstName, lastName) {
  const existing = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );
  if (existing.rowCount > 0) {
    const err = new Error('An account with this email already exists.');
    err.code   = 'EMAIL_TAKEN';
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const { rows } = await pool.query(
    `INSERT INTO users
       (email, phone, password_hash, first_name, last_name, is_verified, is_active)
     VALUES ($1, $2, $3, $4, $5, false, true)
     RETURNING id`,
    [
      email.toLowerCase().trim(),
      phone     ?? null,
      passwordHash,
      firstName ?? null,
      lastName  ?? null,
    ]
  );
  const userId = rows[0].id;

  await issueOtp(userId, email, 'register');

  return { userId };
}

// ---------------------------------------------------------------------------
// 2. verifyRegistrationOtp
// ---------------------------------------------------------------------------

/**
 * Verifies the email OTP submitted after registration.
 * Marks the account as verified on success.
 *
 * @returns {{ verified: boolean }}
 */
async function verifyRegistrationOtp(userId, code) {
  const { rows } = await pool.query(
    'SELECT id, is_active, email FROM users WHERE id = $1',
    [userId]
  );
  if (rows.length === 0 || !rows[0].is_active) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }

  await verifyOtp(userId, code, 'register');

  await pool.query(
    'UPDATE users SET is_verified = true, updated_at = NOW() WHERE id = $1',
    [userId]
  );

  return { verified: true };
}

// ---------------------------------------------------------------------------
// 3. loginUser
// ---------------------------------------------------------------------------

/**
 * First step of login: validates credentials and sends an email OTP.
 *
 * @returns {{ requires2FA: true, tempToken: string }}
 */
async function loginUser(email, password) {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, is_verified, is_active, role
     FROM users
     WHERE email = $1`,
    [email.toLowerCase().trim()]
  );

  if (rows.length === 0) {
    const err = new Error('No account found with that email address.');
    err.status = 401;
    err.code   = 'EMAIL_NOT_FOUND';
    throw err;
  }

  const user = rows[0];

  if (!user.is_active) {
    const err = new Error('This account has been deactivated.');
    err.status = 403;
    throw err;
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    const err = new Error('Incorrect password. Please try again.');
    err.status = 401;
    err.code   = 'WRONG_PASSWORD';
    throw err;
  }

  if (!user.is_verified) {
    // Account exists but not verified — resend OTP
    await issueOtp(user.id, user.email, 'register');
    const err = new Error('Your account is not yet verified. We\'ve sent a new verification code to your email.');
    err.status = 403;
    err.code   = 'NOT_VERIFIED';
    throw err;
  }

  // Send login OTP
  await issueOtp(user.id, user.email, 'login');
  const tempToken = signTempToken(user.id);

  return { requires2FA: true, tempToken };
}

// ---------------------------------------------------------------------------
// 4. verifyLoginOtp
// ---------------------------------------------------------------------------

/**
 * Second step of login: verifies email OTP and issues full tokens.
 *
 * @returns {{
 *   accessToken:  string,
 *   refreshToken: string,
 *   expiresIn:    string,
 *   user:         { id, email, firstName, lastName, role }
 * }}
 */
async function verifyLoginOtp(tempToken, otpCode) {
  let payload;
  try {
    payload = jwt.verify(tempToken, JWT_SECRET);
  } catch {
    const err = new Error('Invalid or expired session. Please log in again.');
    err.status = 401;
    throw err;
  }

  if (payload.purpose !== 'otp_verify') {
    const err = new Error('Invalid token purpose.');
    err.status = 401;
    throw err;
  }

  const userId = payload.sub;

  const { rows } = await pool.query(
    `SELECT id, email, first_name, last_name, avatar_url, is_active, role
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (rows.length === 0 || !rows[0].is_active) {
    const err = new Error('User not found or inactive.');
    err.status = 401;
    throw err;
  }

  const user = rows[0];

  await verifyOtp(userId, otpCode, 'login');

  const accessToken  = signAccessToken(user);
  const refreshToken = signRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL,
    user: {
      id:        user.id,
      email:     user.email,
      firstName: user.first_name,
      lastName:  user.last_name,
      avatarUrl: user.avatar_url ?? null,
      role:      user.role ?? 'user',
    },
  };
}

// ---------------------------------------------------------------------------
// 5. resendOtp
// ---------------------------------------------------------------------------

/**
 * Resends an OTP for registration or login.
 */
async function resendOtp(userId, purpose) {
  const { rows } = await pool.query(
    'SELECT id, email, is_active FROM users WHERE id = $1',
    [userId]
  );
  if (rows.length === 0 || !rows[0].is_active) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }
  await issueOtp(userId, rows[0].email, purpose);
  return { sent: true };
}

// ---------------------------------------------------------------------------
// 6. refreshToken
// ---------------------------------------------------------------------------

async function refreshToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, REFRESH_SECRET);
  } catch {
    const err = new Error('Invalid or expired refresh token.');
    err.status = 401;
    throw err;
  }

  if (payload.purpose !== 'refresh') {
    const err = new Error('Invalid token purpose.');
    err.status = 401;
    throw err;
  }

  const { rows } = await pool.query(
    'SELECT id, email, is_active, role, first_name, last_name, avatar_url FROM users WHERE id = $1',
    [payload.sub]
  );

  if (rows.length === 0 || !rows[0].is_active) {
    const err = new Error('User not found or inactive.');
    err.status = 401;
    throw err;
  }

  const user        = rows[0];
  const accessToken = signAccessToken(user);

  return {
    accessToken,
    expiresIn: ACCESS_TOKEN_TTL,
    user: {
      id:        user.id,
      email:     user.email,
      firstName: user.first_name,
      lastName:  user.last_name,
      avatarUrl: user.avatar_url ?? null,
      role:      user.role ?? 'user',
    },
  };
}

// ---------------------------------------------------------------------------
// 7. registerBusiness
// ---------------------------------------------------------------------------

async function registerBusiness(ownerDetails, businessDetails) {
  const { email, phone, password, firstName, lastName } = ownerDetails;
  const {
    name, description, category,
    address, city, lat, lng,
    website, phone: bizPhone,
  } = businessDetails;

  const existing = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );
  if (existing.rowCount > 0) {
    const err = new Error('An account with this email already exists.');
    err.code   = 'EMAIL_TAKEN';
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const client = await pool.connect();
  let userId, businessId;

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users
         (email, phone, password_hash, first_name, last_name, is_verified, is_active)
       VALUES ($1, $2, $3, $4, $5, false, true)
       RETURNING id`,
      [
        email.toLowerCase().trim(),
        phone     ?? null,
        passwordHash,
        firstName ?? null,
        lastName  ?? null,
      ]
    );
    userId = userResult.rows[0].id;

    const bizResult = await client.query(
      `INSERT INTO businesses
         (owner_id, name, description, category,
          address, city, lat, lng,
          website, phone, status, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', false)
       RETURNING id`,
      [
        userId,
        name,
        description ?? null,
        category    ?? null,
        address     ?? null,
        city        ?? null,
        lat         ?? null,
        lng         ?? null,
        website     ?? null,
        bizPhone    ?? null,
      ]
    );
    businessId = bizResult.rows[0].id;

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await issueOtp(userId, email, 'register');

  return { userId, businessId };
}

// ---------------------------------------------------------------------------
// 8. requestPasswordReset
// ---------------------------------------------------------------------------

/**
 * Looks up a user by email and issues a password-reset OTP.
 *
 * @returns {{ userId: number }}
 */
async function requestPasswordReset(email) {
  const { rows } = await pool.query(
    'SELECT id, email, is_active FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );

  if (rows.length === 0) {
    const err = new Error('No account found with that email address.');
    err.code   = 'EMAIL_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const user = rows[0];
  if (!user.is_active) {
    const err = new Error('This account has been deactivated.');
    err.status = 403;
    throw err;
  }

  await issueOtp(user.id, user.email, 'reset_password');
  return { userId: user.id };
}

// ---------------------------------------------------------------------------
// 9. resetPassword
// ---------------------------------------------------------------------------

/**
 * Verifies the reset OTP and updates the user's password.
 *
 * @returns {{ reset: boolean }}
 */
async function resetPassword(userId, code, newPassword) {
  const { rows } = await pool.query(
    'SELECT id, is_active FROM users WHERE id = $1',
    [userId]
  );

  if (rows.length === 0 || !rows[0].is_active) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }

  await verifyOtp(userId, code, 'reset_password');

  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await pool.query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [hash, userId]
  );

  return { reset: true };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  registerUser,
  verifyRegistrationOtp,
  loginUser,
  verifyLoginOtp,
  resendOtp,
  refreshToken,
  registerBusiness,
  requestPasswordReset,
  resetPassword,
};
