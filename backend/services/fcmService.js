'use strict';

/**
 * fcmService.js — Firebase Cloud Messaging via firebase-admin
 *
 * Reads credentials from backend/firebase-service-account.json.
 * Falls back silently if the file is missing (dev environment).
 */

const path = require('path');
const pool = require('../db/pool');

let _admin = null;
let _initFailed = false;

function getAdmin() {
  if (_admin) return _admin;
  if (_initFailed) return null;
  try {
    const admin = require('firebase-admin');
    const serviceAccountPath = path.resolve(__dirname, '..', 'firebase-service-account.json');
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    _admin = admin;
    console.info('[fcm] Firebase Admin initialized.');
    return _admin;
  } catch (err) {
    _initFailed = true;
    console.warn('[fcm] Firebase Admin not available:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// FCM token management
// ---------------------------------------------------------------------------

async function saveFcmToken(userId, token) {
  await pool.query(`
    UPDATE users SET fcm_token = $1 WHERE id = $2
  `, [token, userId]);
}

async function deleteFcmToken(userId) {
  await pool.query(`
    UPDATE users SET fcm_token = NULL WHERE id = $1
  `, [userId]);
}

// ---------------------------------------------------------------------------
// Send via FCM
// ---------------------------------------------------------------------------

async function sendFcmToUser(userId, { title, body, data = {} }) {
  const admin = getAdmin();
  if (!admin) return { sent: 0, reason: 'fcm_not_configured' };

  const { rows } = await pool.query('SELECT fcm_token FROM users WHERE id = $1', [userId]);
  const token = rows[0]?.fcm_token;
  if (!token) return { sent: 0, reason: 'no_token' };

  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      webpush: {
        notification: {
          title,
          body,
          icon: '/dander-app-logo.png',
          badge: '/dander-app-logo.png',
        },
        fcmOptions: {
          link: data.url || '/',
        },
      },
    });
    return { sent: 1 };
  } catch (err) {
    // Token expired or invalid — clean it up
    if (err.code === 'messaging/registration-token-not-registered' ||
        err.code === 'messaging/invalid-registration-token') {
      await deleteFcmToken(userId);
    }
    console.error('[fcm] Send failed:', err.code || err.message);
    return { sent: 0, error: err.code };
  }
}

module.exports = {
  saveFcmToken,
  deleteFcmToken,
  sendFcmToUser,
};
