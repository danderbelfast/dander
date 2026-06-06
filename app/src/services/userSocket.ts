// ============================================================
//  Singleton Socket.IO client for the user app.
//
//  Connects when the user logs in, joins the `user:<id>` room, and
//  exposes a tiny on/off API for screens to subscribe to server-side
//  pushes (currently: `points_awarded` from the till flow).
//
//  Reconnects automatically. Disconnect is called on logout — the
//  AuthContext hook owns the lifecycle.
// ============================================================

import { io as socketIo, Socket } from 'socket.io-client';
import { env } from '../env';

let socket: Socket | null = null;
let currentUserId: number | null = null;

export function connectUserSocket(userId: number): Socket | null {
  if (!Number.isFinite(userId) || userId <= 0) return null;
  if (socket && currentUserId === userId && socket.connected) return socket;
  if (socket && currentUserId !== userId) {
    try { socket.disconnect(); } catch { /* swallow */ }
    socket = null;
  }

  // Polling-first then upgrade. Cloudflare's WebSocket proxy mangles
  // permessage-deflate RSV bits during the WebSocket handshake; long-
  // polling establishes the Socket.IO session cleanly first, then the
  // client upgrades to WebSocket. Paired with `perMessageDeflate: false`
  // on the Socket.IO server (see backend/src/index.js).
  socket = socketIo(env.API_URL, {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  currentUserId = userId;

  socket.on('connect', () => {
    socket?.emit('join', userId);
  });

  return socket;
}

export function disconnectUserSocket(): void {
  if (socket) {
    try { socket.disconnect(); } catch { /* swallow */ }
    socket = null;
    currentUserId = null;
  }
}

export function onUserEvent<T = unknown>(event: string, handler: (payload: T) => void): () => void {
  if (!socket || typeof handler !== 'function') return () => {};
  socket.on(event, handler as (...args: unknown[]) => void);
  return () => {
    try { socket?.off(event, handler as (...args: unknown[]) => void); } catch { /* swallow */ }
  };
}
