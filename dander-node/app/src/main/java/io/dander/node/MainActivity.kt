package io.dander.node

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Size
import android.view.View
import android.view.WindowManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import io.dander.node.databinding.ActivityMainBinding
import java.text.SimpleDateFormat
import java.time.LocalDateTime
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private companion object {
        const val ENDPOINT = "https://api.dander.io/api/webhooks/phone-counter"
        const val OPEN_INTERVAL_MS      = 60_000L
        const val HEARTBEAT_INTERVAL_MS = 10 * 60_000L
        const val HOURS_CHECK_MS        = 60_000L
        val TARGET_RES: Size = Size(1280, 720) // 720p analysis
    }

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: Prefs
    private lateinit var deviceId: String
    private lateinit var sensorHub: SensorHub
    private lateinit var uploader: Uploader

    private val cameraExecutor = Executors.newSingleThreadExecutor()
    private val ui = Handler(Looper.getMainLooper())

    @Volatile private var isOpen: Boolean = true
    @Volatile private var pausedRemotely: Boolean = false
    private var cameraBound = false
    private var pendingCameraStart = false

    private val analyzer = PeopleAnalyzer(
        onResult = { inCount, outCount ->
            runOnUiThread {
                binding.txtIn.text = "IN $inCount"
                binding.txtOut.text = "OUT $outCount"
            }
        },
        // Privacy compositing is off for hardware testing — see PeopleAnalyzer.
        // Detections feed the OverlayView drawn on top of the PreviewView.
        onDetections = { norms ->
            binding.overlayView.setDetections(norms)
        },
        // Face boxes drive the privacy masks layered on top of the preview.
        // Display-only — never stored or uploaded.
        onFaces = { faces ->
            binding.overlayView.setFaces(faces)
        },
    )

    private val timeFmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            onPermissionsSettled()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Setup gate — if the phone hasn't been paired with a business yet,
        // bounce to SetupActivity. We only reach the camera UI once Setup
        // has stored a business_code + business_id in Prefs.
        prefs = Prefs(this)
        if (!prefs.isConfigured) {
            startActivity(Intent(this, SetupActivity::class.java))
            finish()
            return
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        applyBrightness()
        deviceId = prefs.resolveDeviceId()
        sensorHub = SensorHub(applicationContext, prefs)
        analyzer.frameInterval = prefs.frameInterval

        uploader = Uploader(
            endpoint = ENDPOINT,
            buildSummary = { buildSummary() },
            onCommands  = { cmd -> applyRemoteCommands(cmd) },
        )

        binding.btnSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        permissionLauncher.launch(requiredPermissions())
    }

    /** Re-pick up Settings changes whenever we return to the foreground. */
    override fun onResume() {
        super.onResume()
        // Re-check the setup gate — if Settings's "Re-pair business" wiped
        // the pairing, bounce to SetupActivity rather than running with a
        // stale business_id on the upload payload.
        if (!prefs.isConfigured) {
            startActivity(Intent(this, SetupActivity::class.java))
            finish()
            return
        }
        applyBrightness()
        analyzer.frameInterval = prefs.frameInterval
    }

    private fun onPermissionsSettled() {
        sensorHub.start()
        uploader.start()
        scheduleHudRefresh()
        scheduleHoursCheck()
        // Initial transition decides whether camera/sensors run right now.
        isOpen = BusinessHours.isOpen(prefs)
        applyRunningState()
    }

    // ─────────────────────────────────────────────────────────
    // Business-hours state machine
    // ─────────────────────────────────────────────────────────

    private fun scheduleHoursCheck() {
        ui.post(object : Runnable {
            override fun run() {
                val nowOpen = BusinessHours.isOpen(prefs)
                if (nowOpen != isOpen) {
                    isOpen = nowOpen
                    applyRunningState()
                }
                ui.postDelayed(this, HOURS_CHECK_MS)
            }
        })
    }

    /**
     * Single source of truth for "are we running right now". Inputs are
     * `isOpen` (business hours) and `pausedRemotely` (dashboard toggle).
     * Closed-hours overlay wins precedence over the pause overlay so the
     * operator sees the more fundamental state first.
     */
    private fun applyRunningState() {
        val open    = isOpen
        val paused  = pausedRemotely
        val running = open && !paused

        binding.closedOverlay.visibility = if (!open)          View.VISIBLE else View.GONE
        binding.pausedOverlay.visibility = if (open && paused) View.VISIBLE else View.GONE
        if (!open) binding.txtNextOpen.text = BusinessHours.formatNextOpen(prefs)

        if (running) {
            applyBrightness()
            if (!cameraBound && granted(Manifest.permission.CAMERA)) startCamera()
            sensorHub.resume()
            uploader.intervalMs = OPEN_INTERVAL_MS
        } else {
            // Closed hours: dim hard to save power. Remote-pause keeps
            // normal brightness so the staff member can see the overlay.
            if (!open) {
                window.attributes = window.attributes.apply { screenBrightness = 0.02f }
            } else {
                applyBrightness()
            }
            unbindCamera()
            sensorHub.suspend()
            // Stay at the 60s upload cadence while remote-paused so the
            // resume command is picked up fast. Closed hours can drop to
            // the slow heartbeat.
            uploader.intervalMs = if (paused) OPEN_INTERVAL_MS else HEARTBEAT_INTERVAL_MS
        }
    }

    // ─────────────────────────────────────────────────────────
    // Remote command applier (called from Uploader's response handler)
    // ─────────────────────────────────────────────────────────

    private fun applyRemoteCommands(cmd: Uploader.Commands) {
        // Uploader runs the callback on its IO coroutine — all UI/state
        // mutations bounce to the main looper.
        ui.post {
            when (cmd.countingEnabled) {
                true  -> if (pausedRemotely)  { pausedRemotely = false; applyRunningState() }
                false -> if (!pausedRemotely) { pausedRemotely = true;  applyRunningState() }
                null  -> {}
            }
            cmd.zoneName?.let { if (it != prefs.zoneName) prefs.zoneName = it }
            cmd.zoneType?.let { if (it != prefs.zoneType) prefs.zoneType = it }
        }
    }

    /** Public hooks — spec-mandated entry points; internally delegate to applyRunningState. */
    fun pauseCounting()  { ui.post { if (!pausedRemotely) { pausedRemotely = true;  applyRunningState() } } }
    fun resumeCounting() { ui.post { if (pausedRemotely)  { pausedRemotely = false; applyRunningState() } } }

    private fun buildSummary(): Uploader.Summary {
        val open = isOpen
        val (din, dout) = if (open) analyzer.drainCounts() else Pair(0, 0)
        // Dwell stats only meaningful while we're actually counting; during
        // closed hours `clearTracking()` already wiped the in-flight IDs.
        val dwell = if (open) analyzer.drainDwell()
                    else PeopleAnalyzer.DwellWindow(0.0, 0.0, 0, 0, 0, 0)
        // BLE brand breakdown is per-current-scan-window; zero during closed.
        val brands = if (open) sensorHub.drainBrandCounts()
                     else SensorHub.BrandCounts.ZERO
        // Anonymised (id, rssi) list for trilateration. Empty when closed —
        // there's no scan in flight to derive distances from.
        val bleDevices = if (open) sensorHub.drainBleDevices() else emptyList()
        return Uploader.Summary(
            deviceId = deviceId,
            businessId = prefs.businessId,
            countIn = din,
            countOut = dout,
            noiseDb = if (open) sensorHub.noiseDb else null,
            noiseLabel = if (open) sensorHub.noiseLabel() else "closed",
            wifiCount = if (open) sensorHub.wifiCount() else null,
            bluetoothCount = if (open) sensorHub.drainBluetoothCount() else 0,
            lightLux = if (open) sensorHub.lightLux else null,
            zoneName = prefs.zoneName,
            zoneType = prefs.zoneType,
            avgDwellSeconds = dwell.avgSeconds,
            maxDwellSeconds = dwell.maxSeconds,
            dwellUnder30 = dwell.under30,
            dwell30To2Min = dwell.from30To120,
            dwell2To5Min = dwell.from120To300,
            dwellOver5Min = dwell.over300,
            btApple = brands.apple,
            btSamsung = brands.samsung,
            btGoogle = brands.google,
            btHuawei = brands.huawei,
            btOtherAndroid = brands.otherAndroid,
            btUnknown = brands.unknown,
            btDevices = bleDevices,
            heartbeat = !open,
        )
    }

    // ─────────────────────────────────────────────────────────
    // Camera
    // ─────────────────────────────────────────────────────────

    private fun startCamera() {
        if (cameraBound || pendingCameraStart) return
        pendingCameraStart = true
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            try {
                val provider = future.get()
                @Suppress("DEPRECATION")
                val analysis = ImageAnalysis.Builder()
                    .setTargetResolution(TARGET_RES) // 720p
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                    .also { it.setAnalyzer(cameraExecutor, analyzer) }

                // Plain camera preview for hardware testing. When privacy
                // compositing is re-enabled, drop this Preview use case and
                // bind only the analysis use case as before.
                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(binding.previewView.surfaceProvider)
                }

                provider.unbindAll()
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                cameraBound = true
            } catch (e: Exception) {
                binding.txtIn.text = "camera error"
            } finally {
                pendingCameraStart = false
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun unbindCamera() {
        if (!cameraBound) return
        ProcessCameraProvider.getInstance(this).get()?.unbindAll()
        // Clear tracking state so any person mid-frame at unbind doesn't
        // get a stale dwell of "minutes since the camera last ran".
        analyzer.clearTracking()
        cameraBound = false
    }

    // ─────────────────────────────────────────────────────────
    // HUD
    // ─────────────────────────────────────────────────────────

    private fun scheduleHudRefresh() {
        ui.post(object : Runnable {
            override fun run() {
                val noise = sensorHub.noiseDb
                val noiseStr = if (noise == null) "unavailable"
                    else "${"%.0f".format(noise)} dB (${sensorHub.noiseLabel()})"
                val wifi = sensorHub.wifiCount()?.toString() ?: "—"
                val lux = sensorHub.lightLux?.let { "${"%.0f".format(it)} lux" } ?: "—"

                binding.txtSensors.text =
                    "🔊 $noiseStr    📶 WiFi: $wifi    💡 $lux"

                val stamp = if (uploader.lastUploadAt == 0L) "—"
                    else timeFmt.format(Date(uploader.lastUploadAt)) +
                        if (uploader.lastUploadOk) " ✓" else " ✗"
                binding.txtLive.text = "● LIVE  $stamp"

                if (!isOpen) {
                    binding.txtNextOpen.text = BusinessHours.formatNextOpen(prefs, LocalDateTime.now())
                }

                ui.postDelayed(this, 1500)
            }
        })
    }

    private fun applyBrightness() {
        val pct = prefs.brightnessPct.coerceIn(0, 100)
        window.attributes = window.attributes.apply {
            screenBrightness = pct / 100f
        }
    }

    // ─────────────────────────────────────────────────────────
    // Boilerplate
    // ─────────────────────────────────────────────────────────

    private fun requiredPermissions(): Array<String> {
        val perms = mutableListOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACCESS_FINE_LOCATION,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            perms.add(Manifest.permission.BLUETOOTH_SCAN)
        }
        return perms.toTypedArray()
    }

    private fun granted(perm: String) =
        ContextCompat.checkSelfPermission(this, perm) == PackageManager.PERMISSION_GRANTED

    override fun onDestroy() {
        super.onDestroy()
        ui.removeCallbacksAndMessages(null)
        // First-launch path: onCreate bounces to SetupActivity and finishes
        // before any of these are wired up. onDestroy still fires, so guard
        // every lateinit access — touching one before it's initialised
        // throws UninitializedPropertyAccessException and crashes the app.
        // cameraExecutor is a property-initialiser `val`, so it's always
        // ready by the time we get here; no isInitialized guard available
        // for it (compile error — isInitialized only works on lateinit).
        if (::uploader.isInitialized)  uploader.stop()
        if (::sensorHub.isInitialized) sensorHub.stop()
        cameraExecutor.shutdown()
    }
}
