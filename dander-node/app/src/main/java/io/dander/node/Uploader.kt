package io.dander.node

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

/**
 * Uploader — periodic JSON POST to the phone-counter webhook.
 *
 * Two cadences:
 *   - 60 seconds while the store is open (full summary).
 *   - 10 minutes while closed (heartbeat: same payload shape, but counts
 *     are zero / sensors are null because everything else has been
 *     suspended). The `heartbeat: true` flag tells the backend what it is.
 *
 * The loop reads `intervalMs` on every tick, so changing the mode takes
 * effect on the next cycle. Failures are swallowed and retried; a dead
 * network never crashes the app.
 */
class Uploader(
    private val endpoint: String,
    private val buildSummary: () -> Summary,
) {
    data class Summary(
        val deviceId: String,
        val countIn: Int,
        val countOut: Int,
        val noiseDb: Double?,
        val noiseLabel: String,
        val wifiCount: Int?,
        val bluetoothCount: Int,
        val lightLux: Float?,
        val zoneName: String,
        val zoneType: String,
        val heartbeat: Boolean = false,
    )

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var job: Job? = null

    @Volatile var intervalMs: Long = 60_000L
    @Volatile var lastUploadOk: Boolean = false; private set
    @Volatile var lastUploadAt: Long = 0L;       private set

    fun start() {
        if (job != null) return
        job = scope.launch {
            while (isActive) {
                delay(intervalMs)
                try {
                    val ok = post(buildSummary())
                    lastUploadOk = ok
                    lastUploadAt = System.currentTimeMillis()
                } catch (_: Exception) {
                    lastUploadOk = false
                    lastUploadAt = System.currentTimeMillis()
                }
            }
        }
    }

    fun stop() { job?.cancel(); job = null }

    private fun post(s: Summary): Boolean {
        val body = JSONObject().apply {
            put("device_id", s.deviceId)
            put("timestamp", Instant.now().toString())
            put("count_in", s.countIn)
            put("count_out", s.countOut)
            put("noise_db", s.noiseDb ?: JSONObject.NULL)
            put("noise_label", s.noiseLabel)
            put("wifi_count", s.wifiCount ?: JSONObject.NULL)
            put("bluetooth_count", s.bluetoothCount)
            put("light_lux", s.lightLux ?: JSONObject.NULL)
            put("zone_name", s.zoneName)
            put("zone_type", s.zoneType)
            put("heartbeat", s.heartbeat)
        }.toString()

        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 10_000
                readTimeout = 10_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
            OutputStreamWriter(conn.outputStream).use { it.write(body); it.flush() }
            val code = conn.responseCode
            code in 200..299
        } catch (e: Exception) {
            false
        } finally {
            conn?.disconnect()
        }
    }
}
