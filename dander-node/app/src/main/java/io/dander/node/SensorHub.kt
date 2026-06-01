package io.dander.node

import android.Manifest
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import androidx.core.content.ContextCompat
import java.util.Collections
import kotlin.math.log10
import kotlin.math.sqrt

/**
 * SensorHub — ambient sensors that sit alongside the camera counter.
 *
 * Power-aware operation:
 *   - WiFi is scanned at most every `wifiIntervalMin` minutes. Counts are
 *     served from cache between scans (no system call).
 *   - Bluetooth runs a 10-seconds-on / ~110-seconds-off duty cycle. The
 *     `btSeen` set is wiped at the start of each scan window so each cycle
 *     reports the genuinely-present devices, not stale ghosts.
 *   - `suspend()` parks every reader (mic loop exits, BLE scanner stops,
 *     light listener unregistered, WiFi scheduler paused). `resume()`
 *     starts them all again. Called by MainActivity around closed hours.
 *
 * Every reader is defensive: if a permission is missing or the hardware
 * isn't present, that reading reports null/0 ("unavailable") and the rest
 * keep working.
 */
class SensorHub(
    private val context: Context,
    private val prefs: Prefs,
) : SensorEventListener {

    @Volatile var lightLux: Float? = null;  private set
    @Volatile var noiseDb: Double? = null;  private set

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    private val lightSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_LIGHT)

    @Volatile private var recording = false
    private var audioThread: Thread? = null

    private val btSeen = Collections.synchronizedSet(HashSet<String>())
    private var leScanner: BluetoothLeScanner? = null
    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult?) {
            result?.device?.address?.let { btSeen.add(it) }
        }
    }

    // Schedulers run on their own thread so we never tie up the main looper.
    private val scheduler = HandlerThread("dander-node-scheduler")
        .also { it.start() }
        .let { Handler(it.looper) }

    @Volatile private var wifiCached: Int? = null
    @Volatile private var wifiLastScanMs: Long = 0L

    @Volatile private var running = false

    // ── lifecycle ────────────────────────────────────────────
    fun start() {
        if (running) return
        running = true
        startLight()
        startNoise()
        startWifiScheduler()
        startBluetoothScheduler()
    }

    /** Park every reader. Safe to call repeatedly. */
    fun suspend() {
        if (!running) return
        running = false
        recording = false
        audioThread = null
        sensorManager?.unregisterListener(this)
        stopBluetooth()
        scheduler.removeCallbacksAndMessages(null)
        noiseDb = null
        // lightLux retained — its last value is fine to keep on display.
    }

    fun resume() = start()

    /** Permanent stop (activity destroyed). */
    fun stop() {
        suspend()
        scheduler.looper.quitSafely()
    }

    private fun has(perm: String) =
        ContextCompat.checkSelfPermission(context, perm) == PackageManager.PERMISSION_GRANTED

    // ── light ────────────────────────────────────────────────
    private fun startLight() {
        if (lightSensor == null) { lightLux = null; return }
        sensorManager?.registerListener(this, lightSensor, SensorManager.SENSOR_DELAY_NORMAL)
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type == Sensor.TYPE_LIGHT) lightLux = event.values[0]
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // ── microphone / noise ───────────────────────────────────
    private fun startNoise() {
        if (!has(Manifest.permission.RECORD_AUDIO)) { noiseDb = null; return }
        recording = true
        audioThread = Thread { noiseLoop() }.also { it.isDaemon = true; it.start() }
    }

    private fun noiseLoop() {
        val sampleRate = 16_000
        val minBuf = AudioRecord.getMinBufferSize(
            sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        if (minBuf <= 0) { noiseDb = null; return }

        val record = try {
            @Suppress("MissingPermission")
            AudioRecord(
                MediaRecorder.AudioSource.MIC, sampleRate,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, minBuf
            )
        } catch (e: Exception) { noiseDb = null; return }

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            noiseDb = null; record.release(); return
        }

        val buf = ShortArray(minBuf)
        try {
            record.startRecording()
            while (recording) {
                val n = record.read(buf, 0, buf.size)
                if (n > 0) {
                    var sumSq = 0.0
                    for (i in 0 until n) { val s = buf[i].toDouble(); sumSq += s * s }
                    val rms = sqrt(sumSq / n)
                    val db = if (rms > 0) 20.0 * log10(rms) else 0.0
                    noiseDb = db.coerceIn(0.0, 120.0)
                }
            }
        } catch (e: Exception) {
            noiseDb = null
        } finally {
            try { record.stop() } catch (_: Exception) {}
            record.release()
        }
    }

    fun noiseLabel(): String {
        val db = noiseDb ?: return "unavailable"
        return when {
            db < 45 -> "quiet"
            db < 65 -> "moderate"
            else    -> "busy"
        }
    }

    // ── wifi ──────────────────────────────────────────────────
    private fun startWifiScheduler() {
        scheduler.post(object : Runnable {
            override fun run() {
                if (!running) return
                doWifiScan()
                val intervalMs = (prefs.wifiIntervalMin.coerceAtLeast(1) * 60_000L)
                scheduler.postDelayed(this, intervalMs)
            }
        })
    }

    private fun doWifiScan() {
        if (!has(Manifest.permission.ACCESS_FINE_LOCATION)) { wifiCached = null; return }
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        if (wifi == null) { wifiCached = null; return }
        try {
            @Suppress("DEPRECATION")
            wifi.startScan()
            wifiCached = wifi.scanResults?.size ?: 0
            wifiLastScanMs = System.currentTimeMillis()
        } catch (e: SecurityException) { wifiCached = null }
        catch (e: Exception)            { wifiCached = 0    }
    }

    fun wifiCount(): Int? = wifiCached

    // ── bluetooth ─────────────────────────────────────────────
    private fun bluetoothScanAllowed(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            has(Manifest.permission.BLUETOOTH_SCAN)
        else
            has(Manifest.permission.ACCESS_FINE_LOCATION)

    private fun startBluetoothScheduler() {
        if (!bluetoothScanAllowed()) return
        val mgr = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager ?: return
        val adapter = mgr.adapter ?: return
        if (!adapter.isEnabled) return
        leScanner = adapter.bluetoothLeScanner

        scheduler.post(object : Runnable {
            override fun run() {
                if (!running) return
                btSeen.clear()
                try { leScanner?.startScan(scanCallback) } catch (e: SecurityException) { return }
                // Stop scan after 10s; reschedule the next 10s window 2 minutes from now.
                scheduler.postDelayed({
                    try { leScanner?.stopScan(scanCallback) } catch (_: Exception) {}
                }, 10_000L)
                scheduler.postDelayed(this, 120_000L)
            }
        })
    }

    private fun stopBluetooth() {
        try { leScanner?.stopScan(scanCallback) } catch (_: Exception) {}
        leScanner = null
        btSeen.clear()
    }

    /** Distinct BLE devices seen during the current/last scan window. */
    fun drainBluetoothCount(): Int {
        if (!bluetoothScanAllowed()) return 0
        synchronized(btSeen) { return btSeen.size }
    }
}
