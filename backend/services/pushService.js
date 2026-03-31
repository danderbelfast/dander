'use strict';

const pool = require('../db/pool');

let _webPush = null;

function getWebPush() {
  if (_webPush) return _webPush;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return null;
  _webPush = require('web-push');
  _webPush.setVapidDetails(VAPID_SUBJECT || 'mailto:support@dander.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return _webPush;
}

async function savePushSubscription(userId, { endpoint, p256dh, auth, userAgent }) {
  await pool.query(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_used_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT ON CONSTRAINT uq_push_endpoint
    DO UPDATE SET user_id = $1, last_used_at = NOW()
  `, [userId, endpoint, p256dh, auth, userAgent || null]);
}

async function deletePushSubscription(userId, endpoint) {
  await pool.query(
    'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
    [userId, endpoint]
  );
}

async function sendPushToUser(userId, payload) {
  const webPush = getWebPush();
  if (!webPush) return { sent: 0, failed: 0 };

  const { rows } = await pool.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );

  let sent = 0, failed = 0;

  for (const sub of rows) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      sent++;
    } catch (err) {
      // 410 Gone or 404 = subscription expired — clean it up
      if (err.statusCode === 410 || err.statusCode === 404) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {});
      }
      failed++;
    }
  }

  return { sent, failed };
}

async function sendProximityPush(userId, offer) {
  return sendPushToUser(userId, {
    type:  'proximity',
    title: offer.business_name || offer.businessName || 'New deal nearby',
    body:  offer.title,
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data:  { offerId: offer.id, url: `/offer/${offer.id}` },
  });
}

module.exports = { savePushSubscription, deletePushSubscription, sendPushToUser, sendProximityPush };
