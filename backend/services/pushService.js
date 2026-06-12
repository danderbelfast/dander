'use strict';

const pool = require('../db/pool');
const fcmService = require('./fcmService');

// ---------------------------------------------------------------------------
// NOTIFICATION CHANNELS & SOUNDS
// ---------------------------------------------------------------------------
// 
// For push notifications with custom sounds and channels:
//
// ANDROID NOTIFICATION CHANNELS:
// When Capacitor is added to the native Android app, create these channels:
//
//   dander_deals channel:
//   - Name: "Nearby deals"
//   - Description: "Alerts when deals appear near you"
//   - Importance: HIGH
//   - Sound: deal_nearby.mp3
//   - Vibration: true
//   - Lights: true, colour #E85D26 (Dander orange)
//
//   dander_coupons channel:
//   - Name: "Coupon updates"
//   - Description: "Reminders about your claimed coupons"
//   - Importance: DEFAULT
//   - Sound: deal_expiring.mp3
//   - Vibration: true
//
//   dander_offers channel:
//   - Name: "New offers"
//   - Description: "New deals posted near you"
//   - Importance: DEFAULT
//   - Sound: new_offer.mp3
//   - Vibration: false
//
// TODO (Capacitor integration): Copy sound files from frontend-user/public/sounds/
// to: android/app/src/main/res/raw/
//     - deal_nearby.mp3
//     - deal_expiring.mp3
//     - new_offer.mp3
//
// iOS APNS PAYLOAD:
// Sound files require bundle in the native app. Custom sounds must be:
//   - Less than 30 seconds
//   - Linear PCM or IMA4
//   - Placed in Xcode project
//
// TODO (Capacitor integration): Add sound files to iOS app via Xcode:
//         ios/App/App/
//         - deal_nearby.mp3
//         - deal_expiring.mp3
//         - new_offer.mp3
//
// ---------------------------------------------------------------------------
// Web Push (VAPID)
// ---------------------------------------------------------------------------

let _webPush = null;

function getWebPush() {
  if (_webPush) return _webPush;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return null;
  _webPush = require('web-push');
  _webPush.setVapidDetails(VAPID_SUBJECT || 'mailto:support@dander.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return _webPush;
}

// ---------------------------------------------------------------------------
// Push subscription management
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// FCM token management
// ---------------------------------------------------------------------------

async function saveFcmToken(userId, token) {
  await pool.query(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_used_at)
    VALUES ($1, $2, 'fcm', 'fcm', 'fcm', NOW())
    ON CONFLICT ON CONSTRAINT uq_push_endpoint
    DO UPDATE SET user_id = $1, last_used_at = NOW()
  `, [userId, `fcm:${token}`]);
}

async function deleteFcmToken(userId, token) {
  await pool.query(
    'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
    [userId, `fcm:${token}`]
  );
}

// ---------------------------------------------------------------------------
// Quiet hours check
// ---------------------------------------------------------------------------

async function isInQuietHours(userId) {
  const { rows } = await pool.query('SELECT quiet_hours FROM users WHERE id = $1', [userId]);
  const qh = rows[0]?.quiet_hours;
  if (!qh?.enabled) return false;

  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // Handle overnight ranges (e.g. 22:00 → 08:00)
  if (qh.from <= qh.until) {
    return hhmm >= qh.from && hhmm < qh.until;
  }
  return hhmm >= qh.from || hhmm < qh.until;
}

// ---------------------------------------------------------------------------
// Notification type check
// ---------------------------------------------------------------------------

async function isNotifTypeEnabled(userId, type) {
  const { rows } = await pool.query('SELECT notification_types FROM users WHERE id = $1', [userId]);
  const types = rows[0]?.notification_types;
  if (!types) return true; // default on
  return types[type] !== false;
}

// ---------------------------------------------------------------------------
// Core send functions
// ---------------------------------------------------------------------------

async function sendPushToUser(userId, payload) {
  // Check quiet hours
  if (await isInQuietHours(userId)) return { sent: 0, failed: 0, reason: 'quiet_hours' };

  const webPush = getWebPush();
  if (!webPush) return { sent: 0, failed: 0 };

  const { rows } = await pool.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );

  let sent = 0, failed = 0;

  for (const sub of rows) {
    try {
      // FCM tokens are stored as fcm:<token> — skip them for VAPID push
      if (sub.endpoint.startsWith('fcm:')) continue;

      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {});
      }
      failed++;
    }
  }

  // Also try FCM
  const fcmResult = await fcmService.sendFcmToUser(userId, {
    title: payload.title || 'TapProve',
    body:  payload.body || '',
    data:  payload.data || {},
    sound: payload.sound,
    channelId: payload.channelId,
  });
  sent += fcmResult.sent || 0;

  return { sent, failed };
}

// ---------------------------------------------------------------------------
// Typed notification senders
// ---------------------------------------------------------------------------

async function sendProximityAlert(userId, offer, distanceM) {
  if (!(await isNotifTypeEnabled(userId, 'nearby_deals'))) return { sent: 0 };
  const dist = distanceM < 1000 ? `${Math.round(distanceM)}m` : `${(distanceM / 1000).toFixed(1)}km`;
  return sendPushToUser(userId, {
    type:  'proximity',
    title: offer.business_name || offer.businessName || 'Deal nearby',
    body:  `${offer.title} — ${dist} away`,
    icon:  '/tapprove-app-logo.png',
    badge: '/tapprove-app-logo.png',
    sound: 'deal_nearby',
    channelId: 'tapprove_deals',
    data:  { offerId: offer.id, url: `/offer/${offer.id}` },
  });
}

async function sendNewOfferNearby(userId, offer) {
  if (!(await isNotifTypeEnabled(userId, 'new_offers'))) return { sent: 0 };
  return sendPushToUser(userId, {
    type:  'new_offer',
    title: `New offer from ${offer.business_name || offer.businessName || 'a business nearby'}`,
    body:  offer.title,
    icon:  '/tapprove-app-logo.png',
    badge: '/tapprove-app-logo.png',
    sound: 'new_offer',
    channelId: 'tapprove_offers',
    data:  { offerId: offer.id, url: `/offer/${offer.id}` },
  });
}

async function sendExpiringOffer(userId, offer) {
  if (!(await isNotifTypeEnabled(userId, 'expiring_offers'))) return { sent: 0 };
  return sendPushToUser(userId, {
    type:  'expiring_offer',
    title: 'Offer expiring soon',
    body:  `${offer.title} expires in less than 2 hours`,
    icon:  '/tapprove-app-logo.png',
    badge: '/tapprove-app-logo.png',
    sound: 'deal_expiring',
    channelId: 'tapprove_deals',
    data:  { offerId: offer.id, url: `/offer/${offer.id}` },
  });
}

async function sendCouponReminder(userId, coupon) {
  if (!(await isNotifTypeEnabled(userId, 'coupon_reminders'))) return { sent: 0 };
  return sendPushToUser(userId, {
    type:  'coupon_reminder',
    title: 'Use your coupon soon',
    body:  `Your coupon for "${coupon.offer_title || coupon.offerTitle}" expires in less than 2 hours`,
    icon:  '/tapprove-app-logo.png',
    badge: '/tapprove-app-logo.png',
    sound: 'deal_expiring',
    channelId: 'tapprove_coupons',
    data:  { url: '/coupons' },
  });
}

// ---------------------------------------------------------------------------
// Legacy compatibility alias
// ---------------------------------------------------------------------------

const sendProximityPush = sendProximityAlert;

module.exports = {
  savePushSubscription,
  deletePushSubscription,
  saveFcmToken,
  deleteFcmToken,
  sendPushToUser,
  sendProximityAlert,
  sendProximityPush,
  sendNewOfferNearby,
  sendExpiringOffer,
  sendCouponReminder,
  isInQuietHours,
  isNotifTypeEnabled,
};
