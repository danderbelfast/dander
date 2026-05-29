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
import androidx.core.content.ContextCompat
import java.util.Collections
import kotlin.math.log10
import kotlin.math.sqrt

/**
 * SensorHub — ambient sensors that sit alongside the camera counter.
 * Every reader is defensive: if a permission is missing or the hardware
 * isn't present, that reading is reported as null/0 ("unavailable") and the
 * rest keep working.
 *
 *   noiseDb / noiseLabel — microphone RMS, an *uncalibrated relative* dB.
 *   wifiCount            — visible WiFi networks (last scan).
 *   bluetoothCount       — distinct BLE devices seen since the last drain
 *                          (addresses held transiently, never persisted).
 *   lightLux             — ambient light sensor.
 */
class SensorHub(private val context: Context) : SensorEventListener {

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

    // ── lifecycle ────────────────────────────────────────────
    fun start() {
        startLight()
        startNoise()
        startBluetooth()
    }

    fun stop() {
        recording = false
        audioThread = null
        sensorManager?.unregisterListener(this)
        stopBluetooth()
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
                    // Uncalibrated relative dB. ~40 (quiet) … ~85 (busy).
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
    fun wifiCount(): Int? {
        if (!has(Manifest.permission.ACCESS_FINE_LOCATION)) return null
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            ?: return null
        return try {
            @Suppress("DEPRECATION")
            wifi.startScan() // throttled on API 28+, but cached results still update
            wifi.scanResults?.size ?: 0
        } catch (e: SecurityException) { null } catch (e: Exception) { 0 }
    }

    // ── bluetooth ─────────────────────────────────────────────
    private fun bluetoothScanAllowed(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            has(Manifest.permission.BLUETOOTH_SCAN)
        else
            has(Manifest.permission.ACCESS_FINE_LOCATION)

    private fun startBluetooth() {
        if (!bluetoothScanAllowed()) return
        val mgr = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager ?: return
        val adapter = mgr.adapter ?: return
        if (!adapter.isEnabled) return
        leScanner = adapter.bluetoothLeScanner
        try {
            leScanner?.startScan(scanCallback)
        } catch (e: SecurityException) { /* unavailable */ }
    }

    private fun stopBluetooth() {
        try { leScanner?.stopScan(scanCallback) } catch (_: Exception) {}
        leScanner = null
        btSeen.clear()
    }

    /** Distinct BLE devices seen since the last drain; clears the window. */
    fun drainBluetoothCount(): Int {
        if (!bluetoothScanAllowed()) return 0
        synchronized(btSeen) {
            val n = btSeen.size
            btSeen.clear()
            return n
        }
    }
}
