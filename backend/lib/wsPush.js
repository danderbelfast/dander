// ============================================================
//  Tiny wrapper around Socket.IO room broadcasts.
//
//  All Dander real-time pushes use two rooms:
//    user:<id>       — joined by the user app on socket connect
//    business:<id>   — joined by the business dashboard on connect
//
//  Pushes are best-effort — if no client is in the room (offline,
//  app killed, dashboard tab closed) the emit silently drops, which
//  is the right behaviour for the till flow (a missed greeting is
//  worse than a duplicate when the next event arrives).
// ============================================================

function pushToUser(io, userId, event, payload) {
  if (!io || !Number.isFinite(Number(userId))) return false;
  io.to(`user:${userId}`).emit(event, payload || {});
  return true;
}

function pushToBusiness(io, businessId, event, payload) {
  if (!io || !Number.isFinite(Number(businessId))) return false;
  io.to(`business:${businessId}`).emit(event, payload || {});
  return true;
}

module.exports = { pushToUser, pushToBusiness };
