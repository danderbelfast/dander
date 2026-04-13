'use strict';

const cron = require('node-cron');
const pool = require('../db/pool');
const { sendExpiringOffer, sendCouponReminder } = require('./pushService');

// ---------------------------------------------------------------------------
// Notification reminders — runs every 30 minutes
// Checks for:
//   1. Saved offers expiring within 2 hours → sendExpiringOffer
//   2. Claimed coupons expiring within 2 hours → sendCouponReminder
// ---------------------------------------------------------------------------

function scheduleNotificationReminders() {
  const task = cron.schedule('*/30 * * * *', async () => {
    const ts = new Date().toISOString();
    try {
      // 1. Expiring saved offers — notify users who saved offers that expire within 2h
      const { rows: expiringOffers } = await pool.query(`
        SELECT DISTINCT s.user_id, o.id AS offer_id, o.title, o.expires_at
        FROM saved_offers s
        JOIN offers o ON o.id = s.offer_id
        JOIN users  u ON u.id = s.user_id
        WHERE o.is_active = true
          AND o.expires_at IS NOT NULL
          AND o.expires_at > NOW()
          AND o.expires_at <= NOW() + INTERVAL '2 hours'
          AND u.notifications_enabled = true
      `);

      let sentOffers = 0;
      for (const row of expiringOffers) {
        try {
          const result = await sendExpiringOffer(row.user_id, { id: row.offer_id, title: row.title });
          if (result.sent > 0) sentOffers++;
        } catch { /* continue */ }
      }

      // 2. Expiring claimed coupons — notify users with active coupons expiring within 2h
      const { rows: expiringCoupons } = await pool.query(`
        SELECT c.user_id, c.id AS coupon_id, o.title AS offer_title, o.expires_at
        FROM coupons c
        JOIN offers o ON o.id = c.offer_id
        JOIN users  u ON u.id = c.user_id
        WHERE c.status = 'active'
          AND o.expires_at IS NOT NULL
          AND o.expires_at > NOW()
          AND o.expires_at <= NOW() + INTERVAL '2 hours'
          AND u.notifications_enabled = true
      `);

      let sentCoupons = 0;
      for (const row of expiringCoupons) {
        try {
          const result = await sendCouponReminder(row.user_id, { offer_title: row.offer_title });
          if (result.sent > 0) sentCoupons++;
        } catch { /* continue */ }
      }

      if (sentOffers > 0 || sentCoupons > 0) {
        console.info(`[notifReminders] ${ts} — sent ${sentOffers} expiring-offer + ${sentCoupons} coupon-reminder notifications`);
      }
    } catch (err) {
      console.error('[notifReminders] Job failed:', err.message);
    }
  });

  console.info('[notifReminders] Scheduler started — runs every 30 minutes.');
  return task;
}

module.exports = { scheduleNotificationReminders };
