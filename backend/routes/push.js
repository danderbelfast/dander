'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { savePushSubscription, deletePushSubscription, sendPushToUser } = require('../services/pushService');

const router = Router();

// GET /api/push/vapid-public-key — public, no auth
router.get('/vapid-public-key', (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ success: false, message: 'Push not configured.' });
  return res.json({ success: true, publicKey: key });
});

// POST /api/push/subscribe
router.post('/subscribe', requireAuth, async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ success: false, message: 'Invalid subscription object.' });
  }
  try {
    await savePushSubscription(req.user.id, {
      endpoint,
      p256dh:    keys.p256dh,
      auth:      keys.auth,
      userAgent: req.headers['user-agent'],
    });
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('[push/subscribe]', err);
    return res.status(500).json({ success: false, message: 'Failed to save subscription.' });
  }
});

// DELETE /api/push/subscribe
router.delete('/subscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ success: false, message: 'endpoint is required.' });
  try {
    await deletePushSubscription(req.user.id, endpoint);
    return res.json({ success: true });
  } catch (err) {
    console.error('[push/unsubscribe]', err);
    return res.status(500).json({ success: false, message: 'Failed to remove subscription.' });
  }
});

// POST /api/push/test — sends a test notification to the logged-in user
router.post('/test', requireAuth, async (req, res) => {
  try {
    const result = await sendPushToUser(req.user.id, {
      type:  'test',
      title: 'Dander test notification',
      body:  'Push notifications are working!',
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data:  { url: '/' },
    });
    if (result.sent === 0) {
      return res.status(400).json({ success: false, message: 'No active subscriptions found. Enable notifications in Settings first.', ...result });
    }
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[push/test]', err);
    return res.status(500).json({ success: false, message: 'Failed to send test notification.' });
  }
});

// POST /api/push/fcm-token — save FCM token for the authenticated user
router.post('/fcm-token', requireAuth, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: 'token is required.' });
  try {
    await savePushSubscription(req.user.id, {
      endpoint: `fcm:${token}`,
      p256dh: 'fcm',
      auth: 'fcm',
      userAgent: req.headers['user-agent'],
    });
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('[push/fcm-token]', err);
    return res.status(500).json({ success: false, message: 'Failed to save FCM token.' });
  }
});

module.exports = router;
