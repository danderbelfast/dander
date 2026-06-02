'use strict';

/**
 * ws/nodes.js — WebSocket push channel for Dander Node display commands.
 *
 * The Node phones open a wss:// connection to /ws/node and send an
 * `auth` message ({ device_id, business_id }) as their first frame.
 * After auth we keep a Map<device_id, ws> so the proximity endpoint
 * can push display commands to the right phone the instant a user
 * walks in — no more waiting for the next 60-second webhook upload.
 *
 * Auth is intentionally lightweight: we verify the device has posted a
 * phone-counter reading for that business within the last 7 days, which
 * matches the bar we use everywhere else (`/api/nodes/known`). Beats
 * issuing a separate device JWT for what is a kiosk-only channel.
 *
 * Falls back gracefully — if the Node isn't connected (no network, app
 * killed, server restarted), `pushDisplayCommand` returns false and the
 * caller falls back to the existing piggy-back path.
 */

const { WebSocketServer } = require('ws');
const pool = require('../db/pool');

const AUTH_TIMEOUT_MS  = 10_000;
const PONG_GRACE_MS    = 45_000;          // 30s client ping + 15s headroom

// device_id -> { ws, businessId, lastSeen }
const connectedNodes = new Map();
let wss = null;

function setup() {
  if (wss) return wss;
  wss = new WebSocketServer({ noServer: true });
  wss.on('connection', onConnection);
  return wss;
}

function onConnection(ws, request) {
  const ip = request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown';
  let deviceId = null;
  let authed = false;

  const authTimer = setTimeout(() => {
    if (!authed) {
      try { ws.send(JSON.stringify({ type: 'error', message: 'auth timeout' })); } catch {}
      try { ws.close(); } catch {}
    }
  }, AUTH_TIMEOUT_MS);

  ws.on('message', async (data) => {
    let msg;
    try {
      const text = typeof data === 'string' ? data : data.toString();
      msg = JSON.parse(text);
    } catch { return; }

    if (msg && msg.type === 'auth' && !authed) {
      const did = typeof msg.device_id === 'string' ? msg.device_id.slice(0, 100) : '';
      const bid = parseInt(msg.business_id, 10);
      if (!did || !Number.isFinite(bid) || bid <= 0) {
        try { ws.send(JSON.stringify({ type: 'error', message: 'invalid auth' })); } catch {}
        try { ws.close(); } catch {}
        return;
      }
      try {
        const { rows } = await pool.query(
          `SELECT 1 FROM phone_counter_readings
            WHERE device_id = $1 AND business_id = $2
              AND timestamp > NOW() - INTERVAL '7 days'
            LIMIT 1`,
          [did, bid]
        );
        if (rows.length === 0) {
          try { ws.send(JSON.stringify({ type: 'error', message: 'unknown device' })); } catch {}
          try { ws.close(); } catch {}
          return;
        }
      } catch (err) {
        console.warn('[ws/node] auth db error:', err.message);
        try { ws.close(); } catch {}
        return;
      }

      // Replace any previous connection from the same device — protects
      // against a stale socket left behind by a hung restart.
      const prev = connectedNodes.get(did);
      if (prev && prev.ws !== ws) {
        try { prev.ws.close(); } catch {}
      }

      authed = true;
      deviceId = did;
      clearTimeout(authTimer);
      connectedNodes.set(did, { ws, businessId: bid, lastSeen: Date.now() });

      try { ws.send(JSON.stringify({ type: 'auth_ok' })); } catch {}
      console.log(`[ws/node] auth: ${did} (business ${bid}, from ${ip})`);
      return;
    }

    if (!authed) return;

    if (msg && msg.type === 'ping') {
      try { ws.send(JSON.stringify({ type: 'pong' })); } catch {}
      const entry = connectedNodes.get(deviceId);
      if (entry) entry.lastSeen = Date.now();
      return;
    }

    if (msg && msg.type === 'pong') {
      const entry = connectedNodes.get(deviceId);
      if (entry) entry.lastSeen = Date.now();
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (deviceId) {
      const entry = connectedNodes.get(deviceId);
      if (entry && entry.ws === ws) {
        connectedNodes.delete(deviceId);
        console.log(`[ws/node] disconnected: ${deviceId}`);
      }
    }
  });

  ws.on('error', () => { /* swallow — close handler will tidy up */ });
}

function handleUpgrade(request, socket, head) {
  if (!wss) return false;
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
  return true;
}

/**
 * Push a display command to a connected Node. Returns true if the WS
 * was alive and `send` did not throw; false otherwise. Doesn't wait for
 * client ack — assumed delivered once the send completes.
 */
function pushDisplayCommand(deviceId, command) {
  if (!deviceId) return false;
  const entry = connectedNodes.get(deviceId);
  if (!entry) return false;
  // Periodically clean up sockets that haven't sent anything in too long
  // — protects against half-open sockets where the OS hasn't FIN'd yet.
  if (Date.now() - entry.lastSeen > PONG_GRACE_MS) {
    try { entry.ws.close(); } catch {}
    connectedNodes.delete(deviceId);
    return false;
  }
  try {
    entry.ws.send(JSON.stringify({ type: 'display_command', command }));
    return true;
  } catch (err) {
    console.warn(`[ws/node] push failed for ${deviceId}:`, err.message);
    return false;
  }
}

function isConnected(deviceId) {
  return connectedNodes.has(deviceId);
}

module.exports = {
  setup,
  handleUpgrade,
  pushDisplayCommand,
  isConnected,
  connectedNodes,
};
