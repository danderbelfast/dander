package io.tapprove.node

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
import java.security.MessageDigest
import java.time.LocalDate
import java.time.ZoneOffset
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

    private companion object {
        private val HEX = "0123456789abcdef".toCharArray()
    }

    @Volatile var lightLux: Float? = null;  private set
    @Volatile var noiseDb: Double? = null;  private set

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    private val lightSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_LIGHT)

    @Volatile private var recording = false
    private var audioThread: Thread? = null

    // MAC → latest RSSI seen in the current scan window. We keep the RSSI
    // (not just the address) so position logging downstream has a signal
    // strength per device. The map is rewritten on every scan callback for
    // a given MAC, so we get the freshest reading at drain time.
    private val btSeen: MutableMap<String, Int> = Collections.synchronizedMap(HashMap())
    private var leScanner: BluetoothLeScanner? = null
    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult?) {
            val r = result ?: return
            val addr = r.device?.address ?: return
            synchronized(btSeen) { btSeen[addr] = r.rssi }
        }
    }

    // Schedulers run on their own thread so we never tie up the main looper.
    private val scheduler = HandlerThread("tapprove-node-scheduler")
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

    // ── BT trilateration: anonymised (id, rssi) list ───────────
    //
    // We can't ship raw MACs off-device. Instead we hash each MAC with a
    // Per-business secret salt — provisioned by the backend on first
    // upload and stored in EncryptedSharedPreferences via Prefs.btSalt
    // (Android Keystore-backed). Same physical phone produces the same
    // anonymous_id across all of one business's nodes (preserves the
    // position heatmap's cross-node trilateration), but a different
    // hash at a different business (no cross-business correlation).
    //
    // Previously this was SHA256(UTC date) — a public salt that left
    // bt_position_log entries pseudonymous, not anonymous. Now the
    // salt is a real secret and re-identification requires either the
    // backend's businesses.bt_salt column or a compromised kiosk's
    // Keystore. The change crosses the GDPR pseudonymous/anonymous
    // boundary.

    data class BleDevice(val anonymousId: String, val rssi: Int)

    private fun sha256Hex(input: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        val sb = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            val v = b.toInt() and 0xff
            sb.append(HEX[v ushr 4]); sb.append(HEX[v and 0x0f])
        }
        return sb.toString()
    }

    private fun anonymousId(mac: String, saltHex: String): String =
        sha256Hex(mac + saltHex).substring(0, 8)

    /**
     * Anonymised BLE devices seen this scan window, sorted by signal
     * strength (strongest first) and capped at 20. The trilateration
     * solver wants the closest devices; weak/distant signals add noise.
     *
     * If the per-business salt hasn't been provisioned yet (first
     * upload after a fresh install, before the webhook response
     * delivers it), returns an empty list — better to skip one
     * 60s window of BT data than to emit hashes that could be tied
     * back to a known MAC.
     */
    fun drainBleDevices(): List<BleDevice> {
        if (!bluetoothScanAllowed()) return emptyList()
        val saltHex = prefs.btSalt
        if (saltHex.isEmpty()) return emptyList()
        val snapshot: List<Pair<String, Int>> =
            synchronized(btSeen) { btSeen.map { it.key to it.value } }
        return snapshot
            .sortedByDescending { it.second }
            .take(20)
            .map { (mac, rssi) -> BleDevice(anonymousId(mac, saltHex), rssi) }
    }

    // ── BT brand detection (OUI lookup) ─────────────────────────
    //
    // PoC caveat: iOS 14+ and Android 8+ randomise BLE advertising
    // addresses every ~15 min, so most phone scans will fall into the
    // "unknown" bucket. We short-circuit any locally-administered address
    // (bit 1 of the first octet set) to "unknown" so the per-brand counts
    // only reflect genuinely-resolvable hardware MACs. The OUI tables
    // below cover common prefixes from each vendor's IEEE allocations —
    // far from exhaustive but enough for a PoC to surface "this device
    // type is present at all".

    data class BrandCounts(
        val apple: Int,
        val samsung: Int,
        val google: Int,
        val huawei: Int,
        val otherAndroid: Int,
        val unknown: Int,
    ) {
        companion object { val ZERO = BrandCounts(0, 0, 0, 0, 0, 0) }
    }

    private enum class Brand { Apple, Samsung, Google, Huawei, OtherAndroid, Unknown }

    private val APPLE_OUI = setOf(
        "001B63", "00236C", "0023DF", "002500", "040CCE", "0C74C2",
        "109ADD", "1499E2", "1C9148", "28CDC1", "2CF0EE", "3C15C2",
        "406C8F", "4860BC", "4C7C5F", "54E43A", "58E28F", "60F81D",
        "680927", "70480F", "78CA39", "7C6D62", "843835", "8863DF",
        "8C8590", "9801A7", "9C04EB", "9CF387", "A45E60", "ACDE48",
        "B03495", "B853AC", "C09F42", "C81EE7", "D023DB", "D4909C",
        "D83062", "DC2B2A", "E0F847", "F01898", "F0DBE2", "FC253F",
    )
    private val SAMSUNG_OUI = setOf(
        "0007AB", "0012FB", "002119", "00265F", "286ABA", "380A94",
        "38AA3C", "5C0A5B", "78F882", "84B541", "8C7712", "8C71F8",
        "B45D50", "B85E7B", "BC72B1", "C8198F", "D0667B", "D8B12A",
        "E812A5", "EC1F72", "F408F1", "F853A1", "FCC734",
    )
    private val GOOGLE_OUI = setOf(
        "001A11", "3CB72A", "3C5AB4", "641666", "6CAD3F", "703ACB",
        "94EBCD", "A40CC3", "C8AA21", "DA66C0", "F4F5E8",
    )
    private val HUAWEI_OUI = setOf(
        "001882", "00259E", "047970", "0CD6BD", "1C1D67", "283152",
        "344BB6", "4C5499", "5469DB", "688FEE", "8038BC", "A08CFD",
        "A49947", "B83A7E", "C8D1D1", "D466A8", "E8BBA8", "F4A99C",
    )
    // Common Android-OEM OUIs that aren't Samsung / Google / Huawei.
    // (Xiaomi, OnePlus, OPPO, LG, Sony, Motorola, etc.)
    private val OTHER_ANDROID_OUI = setOf(
        "00159E", "001A80", "001E75", "0023FE", "0024E4", "0026E2",
        "1C77F6", "20DBAB", "286C07", "2C20B7", "3C5A37", "4060A4",
        "4868CA", "5085A2", "584873", "688567", "70BB1A", "743A65",
        "789F70", "807ABF", "94DBC9", "9C99A0", "A0466A", "A47733",
        "AC36C4", "B0E235", "C0EEFB", "D0EBA8", "D4570B", "F88179",
        "F8A45F",
    )

    private fun classify(address: String): Brand {
        // Strip colons and uppercase: "aa:bb:cc:..." -> "AABBCC..."
        val clean = address.replace(":", "").uppercase()
        if (clean.length < 6) return Brand.Unknown
        // Locally-administered bit (bit 1 of first octet) = random/private.
        val firstByte = clean.substring(0, 2).toIntOrNull(16) ?: return Brand.Unknown
        if ((firstByte and 0x02) != 0) return Brand.Unknown

        val oui = clean.substring(0, 6)
        return when (oui) {
            in APPLE_OUI         -> Brand.Apple
            in SAMSUNG_OUI       -> Brand.Samsung
            in GOOGLE_OUI        -> Brand.Google
            in HUAWEI_OUI        -> Brand.Huawei
            in OTHER_ANDROID_OUI -> Brand.OtherAndroid
            else                  -> Brand.Unknown
        }
    }

    /** Per-brand snapshot of devices in the current/last scan window. */
    fun drainBrandCounts(): BrandCounts {
        if (!bluetoothScanAllowed()) return BrandCounts.ZERO
        val seen: List<String> = synchronized(btSeen) { btSeen.keys.toList() }
        var apple = 0; var samsung = 0; var google = 0
        var huawei = 0; var other = 0; var unknown = 0
        for (addr in seen) {
            when (classify(addr)) {
                Brand.Apple         -> apple++
                Brand.Samsung       -> samsung++
                Brand.Google        -> google++
                Brand.Huawei        -> huawei++
                Brand.OtherAndroid  -> other++
                Brand.Unknown       -> unknown++
            }
        }
        return BrandCounts(apple, samsung, google, huawei, other, unknown)
    }
}
