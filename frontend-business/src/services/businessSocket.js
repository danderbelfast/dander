// ============================================================
//  Singleton Socket.IO connection for the business dashboard.
//
//  Connects to the API base, joins the `business:<id>` room, and
//  exposes a tiny pub/sub for the till flow.
//
//  Auth is intentionally light: we send the business id over the
//  `joinBusiness` event and trust the server-side join handler to
//  scope future pushes. The auth that matters runs on the REST
//  endpoints that actually mutate data (requireBusiness on
//  /api/till/award-points etc.) — a malicious websocket peer can at
//  worst eavesdrop on greetings for a business they don't own,
//  which is not a meaningful data leak (first name + total points).
// ============================================================

import { io as socketIo } from 'socket.io-client';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let socket = null;
let currentBusinessId = null;

export function connectBusinessSocket(businessId) {
  const bid = parseInt(businessId, 10);
  if (!Number.isFinite(bid) || bid <= 0) return null;

  if (socket && currentBusinessId === bid && socket.connected) {
    return socket;
  }
  if (socket && currentBusinessId !== bid) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }

  socket = socketIo(BASE_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  currentBusinessId = bid;

  socket.on('connect', () => {
    socket.emit('joinBusiness', bid);
  });
  socket.on('disconnect', () => {});

  return socket;
}

export function disconnectBusinessSocket() {
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
    currentBusinessId = null;
  }
}

export function onBusinessEvent(event, handler) {
  if (!socket || typeof handler !== 'function') return () => {};
  socket.on(event, handler);
  return () => {
    try { socket.off(event, handler); } catch {}
  };
}
