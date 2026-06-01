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
    private var cameraBound = false
    private var pendingCameraStart = false

    private val analyzer = PeopleAnalyzer(
        onResult = { inCount, outCount ->
            runOnUiThread {
                binding.txtIn.text = "IN $inCount"
                binding.txtOut.text = "OUT $outCount"
            }
        },
        displayCallback = { bitmap ->
            runOnUiThread { binding.displayView.setImageBitmap(bitmap) }
        },
    )

    private val timeFmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            onPermissionsSettled()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        prefs = Prefs(this)
        applyBrightness()
        deviceId = prefs.resolveDeviceId()
        sensorHub = SensorHub(applicationContext, prefs)
        analyzer.frameInterval = prefs.frameInterval

        uploader = Uploader(ENDPOINT) { buildSummary() }

        binding.btnSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        permissionLauncher.launch(requiredPermissions())
    }

    /** Re-pick up Settings changes whenever we return to the foreground. */
    override fun onResume() {
        super.onResume()
        applyBrightness()
        analyzer.frameInterval = prefs.frameInterval
    }

    private fun onPermissionsSettled() {
        sensorHub.start()
        uploader.start()
        scheduleHudRefresh()
        scheduleHoursCheck()
        // Initial transition decides whether camera/sensors run right now.
        applyOpenClosedState(BusinessHours.isOpen(prefs), force = true)
    }

    // ─────────────────────────────────────────────────────────
    // Business-hours state machine
    // ─────────────────────────────────────────────────────────

    private fun scheduleHoursCheck() {
        ui.post(object : Runnable {
            override fun run() {
                val nowOpen = BusinessHours.isOpen(prefs)
                if (nowOpen != isOpen) applyOpenClosedState(nowOpen)
                ui.postDelayed(this, HOURS_CHECK_MS)
            }
        })
    }

    private fun applyOpenClosedState(open: Boolean, force: Boolean = false) {
        if (!force && open == isOpen) return
        isOpen = open

        if (open) {
            binding.closedOverlay.visibility = View.GONE
            applyBrightness()
            if (!cameraBound && granted(Manifest.permission.CAMERA)) startCamera()
            sensorHub.resume()
            uploader.intervalMs = OPEN_INTERVAL_MS
        } else {
            binding.closedOverlay.visibility = View.VISIBLE
            binding.txtNextOpen.text = BusinessHours.formatNextOpen(prefs)
            // Dim hard so the panel barely glows — actual screen-off requires
            // device-admin; this is the PoC-safe approximation.
            window.attributes = window.attributes.apply { screenBrightness = 0.02f }
            unbindCamera()
            sensorHub.suspend()
            uploader.intervalMs = HEARTBEAT_INTERVAL_MS
        }
    }

    private fun buildSummary(): Uploader.Summary {
        val open = isOpen
        val (din, dout) = if (open) analyzer.drainCounts() else Pair(0, 0)
        return Uploader.Summary(
            deviceId = deviceId,
            countIn = din,
            countOut = dout,
            noiseDb = if (open) sensorHub.noiseDb else null,
            noiseLabel = if (open) sensorHub.noiseLabel() else "closed",
            wifiCount = if (open) sensorHub.wifiCount() else null,
            bluetoothCount = if (open) sensorHub.drainBluetoothCount() else 0,
            lightLux = if (open) sensorHub.lightLux else null,
            zoneName = prefs.zoneName,
            zoneType = prefs.zoneType,
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

                provider.unbindAll()
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, analysis)
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
        uploader.stop()
        sensorHub.stop()
        cameraExecutor.shutdown()
    }
}
