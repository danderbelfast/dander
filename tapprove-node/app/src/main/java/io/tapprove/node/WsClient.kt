package io.tapprove.node

import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * WsClient — persistent WebSocket to /ws/node for real-time loyalty
 * greeting delivery. Replaces the 60-second piggy-back path for the
 * common case where the Node has a live network connection.
 *
 * The piggy-back path is NEVER turned off — if this client is
 * disconnected at the moment proximity is detected, the backend
 * queues the display command in node_display_commands and the next
 * webhook upload picks it up. Zero regression.
 *
 * Flow:
 *   1. start() opens a wss:// connection
 *   2. onOpen sends an `auth` message with device_id + business_id
 *   3. server responds with `auth_ok` (or `error` + close)
 *   4. server sends `display_command` frames whenever a user is
 *      detected nearby — we hand them to `onDisplay` on the IO thread
 *   5. we send a `ping` every 30s; if we don't see a `pong` within the
 *      grace window we tear down and reconnect with exponential
 *      backoff (5s, 10s, 20s, 40s, 60s capped)
 *
 * Lifecycle hooks live on a dedicated HandlerThread so this never
 * blocks the UI looper, and the OkHttp dispatcher handles its own
 * threading for socket I/O.
 */
class WsClient(
    private val prefs: Prefs,
    private val onDisplay: (JSONObject) -> Unit,
) {
    private companion object {
        const val TAG = "TapProveWs"
        val URL = "${BuildConfig.WS_BASE_URL}/ws/node"
        const val PING_INTERVAL_MS = 30_000L
        const val PONG_GRACE_MS    = 10_000L     // give pong 10s before reconnect
        const val INITIAL_BACKOFF  = 5_000L
        const val MAX_BACKOFF      = 60_000L
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)        // no read timeout — long-lived
        .pingInterval(0, TimeUnit.SECONDS)       // we manage pings ourselves
        .build()

    private val scheduler = HandlerThread("tapprove-node-ws")
        .also { it.start() }
        .let { Handler(it.looper) }

    @Volatile private var ws: WebSocket? = null
    @Volatile private var running = false
    @Volatile private var authed = false
    @Volatile private var lastPongMs = 0L
    @Volatile private var backoffMs = INITIAL_BACKOFF

    fun start() {
        if (running) return
        running = true
        scheduler.post { connect() }
        startPingLoop()
    }

    fun stop() {
        running = false
        scheduler.removeCallbacksAndMessages(null)
        try { ws?.close(1000, "client stop") } catch (_: Exception) {}
        ws = null
        authed = false
    }

    /** True if the socket is open AND we've received `auth_ok`. */
    fun isConnected(): Boolean = authed && ws != null

    // ─────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────

    private fun connect() {
        if (!running) return
        if (prefs.businessId <= 0) {
            // Not paired yet — nothing to authenticate as. Retry later in
            // case Setup is in flight.
            scheduleReconnect()
            return
        }
        try {
            val req = Request.Builder().url(URL).build()
            ws = client.newWebSocket(req, Listener())
        } catch (e: Exception) {
            Log.w(TAG, "connect failed: ${e.message}")
            scheduleReconnect()
        }
    }

    private fun startPingLoop() {
        scheduler.post(object : Runnable {
            override fun run() {
                if (!running) return
                if (authed) {
                    val now = System.currentTimeMillis()
                    // No pong inside (interval + grace) → assume the socket
                    // is half-open and force a reconnect.
                    if (lastPongMs > 0 && now - lastPongMs > PING_INTERVAL_MS + PONG_GRACE_MS) {
                        Log.w(TAG, "pong timeout — reconnecting")
                        try { ws?.close(4000, "ping timeout") } catch (_: Exception) {}
                        // onClosed will schedule a reconnect via the backoff loop.
                    } else {
                        try {
                            ws?.send(JSONObject().apply { put("type", "ping") }.toString())
                        } catch (_: Exception) { /* close handler will retry */ }
                    }
                }
                scheduler.postDelayed(this, PING_INTERVAL_MS)
            }
        })
    }

    private fun scheduleReconnect() {
        if (!running) return
        val delay = backoffMs
        backoffMs = (backoffMs * 2).coerceAtMost(MAX_BACKOFF)
        scheduler.postDelayed({ if (running) connect() }, delay)
    }

    private fun handleMessage(text: String) {
        val obj = try { JSONObject(text) } catch (_: Exception) { return }
        when (obj.optString("type")) {
            "auth_ok" -> {
                authed = true
                backoffMs = INITIAL_BACKOFF          // reset backoff on success
                lastPongMs = System.currentTimeMillis()
                Log.i(TAG, "WS connected — real-time display active")
            }
            "display_command" -> {
                val cmd = obj.optJSONObject("command") ?: return
                Log.i(TAG, "WS display command received — showing immediately")
                onDisplay(cmd)
            }
            "ping" -> {
                // Server-initiated ping. Echo a pong back.
                try { ws?.send(JSONObject().apply { put("type", "pong") }.toString()) } catch (_: Exception) {}
            }
            "pong" -> {
                lastPongMs = System.currentTimeMillis()
            }
            "error" -> {
                Log.w(TAG, "WS server error: ${obj.optString("message")}")
                // Server has or will close — reconnect via the close handler.
            }
        }
    }

    private inner class Listener : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            try {
                val auth = JSONObject().apply {
                    put("type", "auth")
                    put("device_id", prefs.resolveDeviceId())
                    put("business_id", prefs.businessId)
                }.toString()
                webSocket.send(auth)
            } catch (e: Exception) {
                Log.w(TAG, "auth send failed: ${e.message}")
                try { webSocket.close(4001, "auth send failed") } catch (_: Exception) {}
            }
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            handleMessage(text)
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            try { webSocket.close(code, reason) } catch (_: Exception) {}
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            authed = false
            ws = null
            if (running) scheduleReconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            authed = false
            ws = null
            Log.w(TAG, "WS failure: ${t.message}")
            if (running) scheduleReconnect()
        }
    }
}
