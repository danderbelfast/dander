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

// ---------------------------------------------------------------------------
// Smart Specials reminder — runs every day at 8am Europe/London
// Finds businesses with perishable inventory items and an FCM token,
// sends a push reminder to take a stock photo.
// ---------------------------------------------------------------------------

function scheduleSmartSpecialsReminder() {
  const task = cron.schedule('0 8 * * *', async () => {
    try {
      const { rows: businesses } = await pool.query(
        `SELECT DISTINCT b.id, b.name, b.business_fcm_token
         FROM businesses b
         JOIN inventory_items i ON i.business_id = b.id AND i.is_active = true AND i.is_perishable = true
         WHERE b.business_fcm_token IS NOT NULL AND b.status = 'active'`
      );

      let sent = 0;
      for (const biz of businesses) {
        try {
          const admin = require('firebase-admin');
          if (admin.apps.length > 0) {
            await admin.messaging().send({
              token: biz.business_fcm_token,
              notification: {
                title: 'Time to check your stock',
                body: `${biz.name} — take a quick photo of your perishables to get Smart Specials suggestions.`,
              },
              data: { type: 'smart_specials_reminder' },
            });
            sent++;
          }
        } catch {}
      }

      if (sent > 0) console.info(`[smartSpecials] Sent ${sent} daily reminder(s).`);
    } catch (err) {
      console.error('[smartSpecials] Reminder failed:', err.message);
    }
  });

  console.info('[smartSpecials] Reminder scheduled — runs daily at 8am.');
  return task;
}

// ---------------------------------------------------------------------------
// Weekly report cron — runs Monday 8am
// Generates a notification for businesses with active sensors.
// ---------------------------------------------------------------------------

function scheduleWeeklyReport() {
  const task = cron.schedule('0 8 * * 1', async () => {
    try {
      const { rows: businesses } = await pool.query(
        `SELECT DISTINCT b.id, b.name, b.business_fcm_token
         FROM businesses b
         JOIN kilo_devices d ON d.business_id = b.id AND d.status = 'active'
         WHERE b.status = 'active'`
      );

      let sent = 0;
      for (const biz of businesses) {
        if (!biz.business_fcm_token) continue;
        try {
          const admin = require('firebase-admin');
          if (admin.apps.length > 0) {
            await admin.messaging().send({
              token: biz.business_fcm_token,
              notification: {
                title: 'Your weekly report is ready',
                body: `${biz.name} — see how your business performed last week including footfall, offers, and weather impact.`,
              },
              data: { type: 'weekly_report' },
            });
            sent++;
          }
        } catch {}
      }

      if (sent > 0) console.info(`[weeklyReport] Notified ${sent} business(es).`);
    } catch (err) {
      console.error('[weeklyReport] Job failed:', err.message);
    }
  });

  console.info('[weeklyReport] Scheduler started — runs Monday 8am.');
  return task;
}

module.exports = { scheduleNotificationReminders, scheduleSmartSpecialsReminder, scheduleWeeklyReport };
