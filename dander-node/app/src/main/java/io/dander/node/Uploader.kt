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
 * Uploader — POSTs a summary to the phone-counter webhook once per minute.
 *
 * Failures are swallowed (logged-ish via return) and simply retried on the
 * next cycle; a dead network or missing endpoint never crashes the app.
 * Only counts + sensor readings are sent — never images.
 *
 * Null numeric fields mean "sensor unavailable" (permission denied / no
 * hardware); they're serialised as JSON null.
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
    )

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var job: Job? = null

    /** Result of the most recent POST attempt, for the LIVE indicator. */
    @Volatile var lastUploadOk: Boolean = false
        private set
    @Volatile var lastUploadAt: Long = 0L
        private set

    fun start() {
        if (job != null) return
        job = scope.launch {
            while (isActive) {
                delay(60_000)
                try {
                    val ok = post(buildSummary())
                    lastUploadOk = ok
                    lastUploadAt = System.currentTimeMillis()
                } catch (_: Exception) {
                    lastUploadOk = false
                    lastUploadAt = System.currentTimeMillis()
                    // swallow — retry next cycle
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
