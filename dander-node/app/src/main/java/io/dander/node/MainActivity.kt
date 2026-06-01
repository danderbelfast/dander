package io.dander.node

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import io.dander.node.databinding.ActivityMainBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private companion object {
        const val ENDPOINT = "https://api.dander.io/api/webhooks/phone-counter"
        const val PREFS = "dander_node"
        const val KEY_DEVICE_ID = "device_id"
    }

    private lateinit var binding: ActivityMainBinding
    private lateinit var deviceId: String
    private lateinit var sensorHub: SensorHub
    private lateinit var uploader: Uploader

    private val cameraExecutor = Executors.newSingleThreadExecutor()
    private val ui = Handler(Looper.getMainLooper())

    private val analyzer = PeopleAnalyzer(
        onResult = { inCount, outCount ->
            runOnUiThread {
                binding.txtIn.text = "IN $inCount"
                binding.txtOut.text = "OUT $outCount"
            }
        },
        displayCallback = { bitmap ->
            // Push the privacy-composited frame to the display ImageView.
            // setImageBitmap takes ownership of the reference; we don't
            // recycle here — the next frame will replace it and the old
            // bitmap becomes GC-eligible once ImageView lets go.
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

        deviceId = resolveDeviceId()
        sensorHub = SensorHub(applicationContext)
        uploader = Uploader(ENDPOINT) {
            val (din, dout) = analyzer.drainCounts()
            Uploader.Summary(
                deviceId = deviceId,
                countIn = din,
                countOut = dout,
                noiseDb = sensorHub.noiseDb,
                noiseLabel = sensorHub.noiseLabel(),
                wifiCount = sensorHub.wifiCount(),
                bluetoothCount = sensorHub.drainBluetoothCount(),
                lightLux = sensorHub.lightLux,
            )
        }

        permissionLauncher.launch(requiredPermissions())
    }

    private fun onPermissionsSettled() {
        if (granted(Manifest.permission.CAMERA)) {
            startCamera()
        } else {
            binding.txtIn.text = "camera unavailable"
        }
        sensorHub.start()
        uploader.start()
        scheduleHudRefresh()
    }

    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            val provider = future.get()

            // ImageAnalysis is the ONLY output now — the analyzer
            // composites a privacy frame from each ImageProxy and pushes
            // it into displayView. Raw camera bytes never reach a
            // SurfaceView / PreviewView on screen.
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also { it.setAnalyzer(cameraExecutor, analyzer) }

            try {
                provider.unbindAll()
                provider.bindToLifecycle(
                    this, CameraSelector.DEFAULT_BACK_CAMERA, analysis
                )
            } catch (e: Exception) {
                binding.txtIn.text = "camera error"
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun scheduleHudRefresh() {
        ui.post(object : Runnable {
            override fun run() {
                val noise = sensorHub.noiseDb
                val noiseStr = if (noise == null) "unavailable"
                    else "${"%.0f".format(noise)} dB (${sensorHub.noiseLabel()})"
                val wifi = sensorHub.wifiCount()?.toString() ?: "unavailable"
                val lux = sensorHub.lightLux?.let { "${"%.0f".format(it)} lux" } ?: "unavailable"

                binding.txtSensors.text =
                    "🔊 $noiseStr    📶 WiFi: $wifi    💡 $lux"

                val stamp = if (uploader.lastUploadAt == 0L) "—"
                    else timeFmt.format(Date(uploader.lastUploadAt)) +
                        if (uploader.lastUploadOk) " ✓" else " ✗"
                binding.txtLive.text = "● LIVE  $stamp"

                ui.postDelayed(this, 1500)
            }
        })
    }

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

    private fun resolveDeviceId(): String {
        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.getString(KEY_DEVICE_ID, null)?.let { return it }
        val id = "node-" + UUID.randomUUID().toString()
        prefs.edit().putString(KEY_DEVICE_ID, id).apply()
        return id
    }

    override fun onDestroy() {
        super.onDestroy()
        ui.removeCallbacksAndMessages(null)
        uploader.stop()
        sensorHub.stop()
        cameraExecutor.shutdown()
    }
}
