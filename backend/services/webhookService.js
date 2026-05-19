'use strict';

const crypto = require('crypto');
const axios  = require('axios');
const pool   = require('../db/pool');
const { logWebhookDelivery } = require('../middleware/apiAuth');

const MAX_RETRIES    = parseInt(process.env.WEBHOOK_MAX_RETRIES, 10) || 10;
const TIMEOUT_MS     = parseInt(process.env.WEBHOOK_TIMEOUT_MS, 10) || 5000;

const VALID_EVENTS = [
  'offer.created',
  'offer.updated',
  'offer.deactivated',
  'offer.shared',
  'coupon.redeemed',
  'story.posted',
  'device.first_reading',
  // 'footfall.alert' — reserved for Kilo IoT polling phase
];

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function dispatchEvent(businessId, eventType, payload) {
  try {
    const { rows: hooks } = await pool.query(
      `SELECT id, url, secret_hash
       FROM webhooks
       WHERE business_id = $1 AND is_active = true
         AND ($2 = ANY(events) OR 'all' = ANY(events))`,
      [businessId, eventType]
    );

    if (hooks.length === 0) return;

    const body = JSON.stringify({
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    for (const hook of hooks) {
      deliver(hook, eventType, body).catch(() => {});
    }
  } catch (err) {
    console.error('[webhook] dispatchEvent error:', err.message);
  }
}

async function deliver(hook, eventType, body, attempt = 1) {
  const signature = sign(body, hook.secret_hash);
  let status = null;
  let responseBody = null;

  try {
    const resp = await axios.post(hook.url, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Dander-Signature': signature,
        'X-Dander-Event': eventType,
      },
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
    });
    status = resp.status;
    responseBody = typeof resp.data === 'string' ? resp.data.slice(0, 500) : JSON.stringify(resp.data).slice(0, 500);
  } catch (err) {
    status = 0;
    responseBody = err.message;
  }

  await logWebhookDelivery({
    webhookId: String(hook.id),
    eventType,
    payload: JSON.parse(body),
    responseStatus: status,
    responseBody,
    attemptNumber: attempt,
  });

  if (status !== 200 && attempt < MAX_RETRIES) {
    const delay = attempt * 5000;
    setTimeout(() => deliver(hook, eventType, body, attempt + 1), delay);
  }
}

async function testUrl(url) {
  try {
    const resp = await axios.post(url, JSON.stringify({ test: true }), {
      headers: { 'Content-Type': 'application/json' },
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
    });
    return resp.status >= 200 && resp.status < 300;
  } catch {
    return false;
  }
}

module.exports = { dispatchEvent, testUrl, VALID_EVENTS };
