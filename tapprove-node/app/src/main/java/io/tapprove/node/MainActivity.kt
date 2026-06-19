package io.tapprove.node

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.OrientationEventListener
import android.util.Size
import android.graphics.Color
import android.media.RingtoneManager
import android.nfc.NfcAdapter
import android.util.Log
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import io.tapprove.node.BuildConfig
import io.tapprove.node.databinding.ActivityMainBinding
import java.text.SimpleDateFormat
import java.time.LocalDateTime
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private companion object {
        val ENDPOINT = "${BuildConfig.API_BASE_URL}/api/webhooks/phone-counter"
        const val OPEN_INTERVAL_MS      = 60_000L
        const val HEARTBEAT_INTERVAL_MS = 10 * 60_000L
        const val HOURS_CHECK_MS        = 60_000L
        const val OPERATOR_LONG_PRESS_MS = 2_000L
        const val OPERATOR_AUTO_DISMISS_MS = 10_000L
        val TARGET_RES: Size = Size(1280, 720) // 720p analysis
    }

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: Prefs
    private lateinit var deviceId: String
    private lateinit var sensorHub: SensorHub
    private lateinit var uploader: Uploader
    private lateinit var bleBroadcaster: BleBroadcaster
    private lateinit var wsClient: WsClient
    private lateinit var gifCache: GifCache

    private val cameraExecutor = Executors.newSingleThreadExecutor()
    private val ui = Handler(Looper.getMainLooper())

    @Volatile private var isOpen: Boolean = true
    @Volatile private var pausedRemotely: Boolean = false
    private var cameraBound = false
    private var pendingCameraStart = false

    // Health-check / auto-recovery state. We grant exactly one retry per
    // bind cycle: if frames still aren't flowing after a fresh bind, mark
    // cameraFailed and let the operator tap the chip to try again.
    private var pendingHealthCheck: Runnable? = null
    private var cameraRecoveryInFlight = false
    private var backgroundJobsScheduled = false

    // Latest IN/OUT for the operator panel readout. The detection
    // callback already updates the on-screen chips; we mirror the
    // values here so the operator panel can show them on demand
    // without poking into the analyzer's private state.
    @Volatile private var latestIn: Int = 0
    @Volatile private var latestOut: Int = 0
    @Volatile private var bleStatus: BleBroadcaster.Status = BleBroadcaster.Status.Idle

    // Long-press detection + auto-dismiss for the operator panel.
    private var operatorLongPress: Runnable? = null
    private var operatorAutoDismiss: Runnable? = null
    private var orientationListener: OrientationEventListener? = null

    private val analyzer = PeopleAnalyzer(
        onResult = { inCount, outCount ->
            latestIn = inCount
            latestOut = outCount
            runOnUiThread {
                binding.txtIn.text = "IN $inCount"
                binding.txtOut.text = "OUT $outCount"
                refreshQueueHud(inCount, outCount)
                // Keep the operator panel in sync if it happens to be open.
                if (binding.operatorPanel.visibility == View.VISIBLE) {
                    binding.opIn.text  = "IN $inCount"
                    binding.opOut.text = "OUT $outCount"
                }
            }
        },
        // Detections feed the OverlayView. The overlay sits between the
        // PreviewView and the stranger display in z-order, both of which
        // cover it visually — these calls are effectively no-ops for the
        // customer view but keep the cache fresh for any future overlay.
        onDetections = { norms ->
            binding.overlayView.setDetections(norms)
        },
        // Face boxes — display-only, never stored or uploaded. Same
        // visual-cover situation as above.
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
            onDisplay   = { json -> runOnUiThread { showLoyaltyGreeting(json) } },
            onVersionInfo = { latest, behind ->
                val changed = prefs.latestVersion != latest || prefs.updateAvailable != behind
                prefs.latestVersion = latest
                prefs.updateAvailable = behind
                if (changed) runOnUiThread { binding.strangerDisplay.refreshUpdateBanner() }
            },
        )
        bleBroadcaster = BleBroadcaster(applicationContext, prefs) { status ->
            // Status callback fires on whichever thread the BLE adapter
            // posts back on — bounce to the UI for the chip update.
            bleStatus = status
            runOnUiThread { renderBleStatusChip() }
        }

        // Local GIF cache. Hand it to DisplayMode so loyalty greetings
        // prefer the on-disk file over a fresh HTTP fetch. The on-boot
        // network refresh, version check, and periodic WorkManager job
        // are all deferred until startCamera() confirms a successful
        // bindToLifecycle — camera is the highest-priority startup task
        // and we keep the main thread out of any HTTP/WorkManager I/O
        // until counting is up.
        gifCache = GifCache(applicationContext)
        binding.displayMode.gifCache = gifCache
        // Real-time display channel. Falls back to the Uploader's 60s
        // piggy-back if the WS is down — both paths feed the same
        // showLoyaltyGreeting() handler, so duplicate delivery would
        // just retrigger the same overlay (server-side delivered_at
        // gating prevents duplicate enqueues).
        wsClient = WsClient(prefs) { json -> runOnUiThread { showLoyaltyGreeting(json) } }

        binding.btnSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        // Stranger display fires this when the entrance count crosses a
        // 100-multiple while the kiosk is open. We respond with a GIF
        // celebration via the same DisplayMode overlay used for loyalty
        // greetings — if a real loyalty greeting arrives during the
        // celebration its show() call will replace ours and reset the
        // dismiss timer (z-order is the same view, latest content wins).
        binding.strangerDisplay.onMilestone = { milestone ->
            if (isOpen) ui.post { triggerMilestoneCelebration(milestone) }
        }

        // ─── Operator escape hatch ────────────────────────────
        // 2-second long-press on the stranger display reveals a small
        // semi-transparent panel with IN/OUT + Settings + Close. The
        // operator never sees the gear icon at the top of the screen
        // (it sits under the full-screen stranger display), so this
        // touch gesture is the only path back to settings from a
        // running kiosk.
        @Suppress("ClickableViewAccessibility")
        binding.strangerDisplay.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    val r = Runnable { showOperatorPanel() }
                    operatorLongPress = r
                    ui.postDelayed(r, OPERATOR_LONG_PRESS_MS)
                }
                MotionEvent.ACTION_UP,
                MotionEvent.ACTION_CANCEL,
                MotionEvent.ACTION_OUTSIDE -> {
                    operatorLongPress?.let { ui.removeCallbacks(it) }
                    operatorLongPress = null
                }
            }
            true
        }
        binding.opSettings.setOnClickListener {
            hideOperatorPanel()
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        binding.opClose.setOnClickListener { hideOperatorPanel() }
        binding.opUpdate.setOnClickListener {
            hideOperatorPanel()
            // Open the update instructions in the kiosk browser.
            startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse("${BuildConfig.APP_BASE_URL}/update/node")))
        }

        // Invert IN / OUT. No camera rebind — analyzer reads
        // invertDirection on every bump(), so the next crossing flips
        // immediately. The button text shows the live IN arrow so the
        // operator never has to remember which way "inverted" means.
        binding.btnInvert.setOnClickListener {
            prefs.invertDirection = !prefs.invertDirection
            analyzer.invertDirection = prefs.invertDirection
            updateInvertButton()
        }

        // Auto-rotate via accelerometer. Replaces the manual rotate
        // button: when the phone is physically tilted, we just update
        // `orientation` in prefs and re-derive the counting mode. No
        // camera rebind — the analyzer/overlay swap state on the same
        // running stream, which is what fixes the earlier "counting
        // pauses on rotate" behaviour.
        orientationListener = object : OrientationEventListener(this) {
            override fun onOrientationChanged(degrees: Int) {
                if (degrees == ORIENTATION_UNKNOWN) return
                // Map to portrait / landscape with a generous deadband
                // around the 45° boundaries so a phone held near a
                // diagonal doesn't flap state every frame.
                val isLandscape = degrees in 60..120 || degrees in 240..300
                val next = if (isLandscape) "landscape" else "portrait"
                if (next != prefs.orientation) {
                    prefs.orientation = next
                    applyCountingMode()
                }
            }
        }

        // Seed analyzer tunables from prefs before the camera spins up.
        analyzer.invertDirection = prefs.invertDirection
        applyCountingMode()

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
        analyzer.invertDirection = prefs.invertDirection
        applyCountingMode()
        orientationListener?.enable()
        if (::wsClient.isInitialized) wsClient.start()
    }

    override fun onPause() {
        super.onPause()
        orientationListener?.disable()
        if (::wsClient.isInitialized) wsClient.stop()
    }

    /**
     * Compute the active counting strategy from prefs and propagate it to
     * the analyzer + overlay + queue HUD visibility. Reads `zoneType`,
     * `orientation` and `tillMode`.
     *
     * Till zones drive their own mode via `tillMode` (overhead / walkpast
     * / approach). Every other zone defers to `orientation` (landscape =
     * horizontal line, portrait = vertical line).
     */
    private fun applyCountingMode() {
        val mode = if (prefs.zoneType == "till") {
            when (prefs.tillMode) {
                "approach" -> PeopleAnalyzer.CountingMode.APPROACH
                "walkpast" -> PeopleAnalyzer.CountingMode.VERTICAL_LINE
                else       -> PeopleAnalyzer.CountingMode.HORIZONTAL_LINE   // "overhead"
            }
        } else {
            if (prefs.orientation == "portrait") PeopleAnalyzer.CountingMode.VERTICAL_LINE
            else                                 PeopleAnalyzer.CountingMode.HORIZONTAL_LINE
        }
        analyzer.countingMode = mode
        // Front camera is now the only supported lens — keep mirror on
        // permanently so the analyzer's X axis matches what a customer
        // sees on the screen.
        analyzer.mirrorX = true
        binding.overlayView.setLineDirection(when (mode) {
            PeopleAnalyzer.CountingMode.HORIZONTAL_LINE -> OverlayView.LineDirection.HORIZONTAL
            PeopleAnalyzer.CountingMode.VERTICAL_LINE   -> OverlayView.LineDirection.VERTICAL
            PeopleAnalyzer.CountingMode.APPROACH        -> OverlayView.LineDirection.NONE
        })
        // Queue HUD only relevant for till zones.
        val isTill = prefs.zoneType == "till"
        binding.queueHud.visibility = if (isTill) View.VISIBLE else View.GONE
        binding.txtTillMode.visibility = if (isTill) View.VISIBLE else View.GONE
        if (isTill) {
            binding.txtTillMode.text = "Mode: " + when (prefs.tillMode) {
                "approach" -> "Approach"
                "walkpast" -> "Walk Past"
                else        -> "Overhead"
            }
        }
        // Re-apply the current depth so the colour/bar reflect the new threshold
        // even if the count itself didn't move.
        refreshQueueHud(0, 0)
        // Arrow on the invert button depends on the mode we just set.
        updateInvertButton()
    }

    /**
     * Render the invert button label as `IN: <arrow>` so the operator can
     * see at a glance which direction currently counts as IN. The arrow
     * tracks the active counting mode, not just the orientation pref:
     *   horizontal line — ↑ (up = in, ↓ = inverted)
     *   vertical line   — → (left-to-right = in, ← = inverted)
     *   approach        — → (toward the camera = in, ← = inverted)
     */
    private fun updateInvertButton() {
        val arrow = when (analyzer.countingMode) {
            PeopleAnalyzer.CountingMode.HORIZONTAL_LINE -> if (prefs.invertDirection) "↓" else "↑"
            PeopleAnalyzer.CountingMode.VERTICAL_LINE   -> if (prefs.invertDirection) "←" else "→"
            PeopleAnalyzer.CountingMode.APPROACH        -> if (prefs.invertDirection) "←" else "→"
        }
        binding.btnInvert.text = "IN: $arrow"
    }

    private fun refreshQueueHud(@Suppress("UNUSED_PARAMETER") inCount: Int, @Suppress("UNUSED_PARAMETER") outCount: Int) {
        if (prefs.zoneType != "till") return
        val depth = analyzer.currentQueueDepth()
        val threshold = prefs.queueThreshold.coerceAtLeast(1)
        binding.txtQueueDepth.text = depth.toString()
        val colour = when {
            depth >  threshold -> Color.parseColor("#FF5252")  // red — over
            depth == threshold -> Color.parseColor("#FFB300")  // amber — at
            else               -> Color.parseColor("#00E676")  // green — under
        }
        binding.txtQueueDepth.setTextColor(colour)
        // Progress bar fills 0..100%; 100% at threshold.
        val pct = ((depth.toFloat() / threshold) * 100f).toInt().coerceIn(0, 100)
        binding.queueBar.progress = pct
    }

    private fun onPermissionsSettled() {
        sensorHub.start()
        uploader.start()
        // BLE broadcasting disabled — NFC HCE is now the primary check-in
        // method (HceBroadcaster.kt). BLE scanning in SensorHub is kept
        // for trilateration and per-zone device detection. To re-enable
        // BLE advertising, uncomment the line below.
        // if (canStartBleBroadcaster()) bleBroadcaster.start()
        binding.strangerDisplay.start(prefs.businessId)
        binding.strangerDisplay.refreshUpdateBanner()
        // Customer-facing kiosk: stranger display is the default visible
        // state. previewView IS bound to a live PreviewView (required for
        // CameraX to drive the ImageAnalysis pipeline) but sits behind
        // the opaque stranger display so customers never see it.
        binding.strangerDisplay.visibility = View.VISIBLE
        scheduleHudRefresh()
        scheduleHoursCheck()
        // Initial transition decides whether camera/sensors run right now.
        isOpen = BusinessHours.isOpen(prefs)
        applyRunningState()
    }

    /**
     * Show the loyalty greeting overlay. Called from the Uploader/
     * WsClient callbacks — already bounced to the UI thread by the
     * caller. Hides the full-screen stranger display while up,
     * restores it on dismiss.
     */
    /**
     * Fire a visitor-milestone celebration. Posts to the public
     * stranger-milestone endpoint to get a Claude+Giphy-selected GIF +
     * message, then displays via the same overlay used for personal
     * greetings. Network is on a background thread; text-only fallback
     * runs if anything fails so the celebration always happens.
     */
    private fun triggerMilestoneCelebration(milestone: Int) {
        // Default fallback text — used immediately if the network is slow,
        // overridden in place once the response lands. No GIF, just text.
        val fallbackMsg = "You're visitor #$milestone today!"
        Thread {
            var gifUrl: String? = null
            var message = fallbackMsg
            var conn: java.net.HttpURLConnection? = null
            try {
                val url = java.net.URL("${BuildConfig.API_BASE_URL}/api/public/stranger-milestone")
                conn = (url.openConnection() as java.net.HttpURLConnection).apply {
                    requestMethod = "POST"
                    doOutput = true
                    connectTimeout = 4000
                    readTimeout = 6000
                    setRequestProperty("Content-Type", "application/json")
                }
                val body = org.json.JSONObject().apply {
                    put("milestone", milestone)
                    put("business_id", prefs.businessId)
                }.toString()
                conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)); it.flush() }
                if (conn.responseCode in 200..299) {
                    val text = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = org.json.JSONObject(text)
                    gifUrl  = json.optString("gif_url", "").ifBlank { null }
                    message = json.optString("message", "").ifBlank { fallbackMsg }
                }
            } catch (_: Exception) {
                // Keep fallback text + null GIF — celebration still runs.
            } finally { conn?.disconnect() }

            runOnUiThread {
                val cmd = org.json.JSONObject().apply {
                    put("type", "milestone")
                    put("customer_name", "VISITOR #$milestone TODAY! 🎉")
                    put("message", message)
                    put("gif_url", gifUrl ?: org.json.JSONObject.NULL)
                    put("points_awarded", 0)
                    put("visit_number", 0)
                    put("display_duration", 10_000L)
                }
                showLoyaltyGreeting(cmd)
            }
        }.start()
    }

    private fun showLoyaltyGreeting(cmd: org.json.JSONObject) {
        binding.strangerDisplay.visibility = View.GONE
        // A greeting takes priority over the operator panel.
        if (binding.operatorPanel.visibility == View.VISIBLE) hideOperatorPanel()
        binding.displayMode.show(cmd)
        playGreetingChime()
        val dur = cmd.optLong("display_duration", 8_000L).coerceIn(2_000L, 30_000L)
        ui.postDelayed({ binding.strangerDisplay.visibility = View.VISIBLE }, dur)
    }

    /**
     * Fire the device's default notification sound. Respects silent /
     * vibrate mode automatically because RingtoneManager honours the
     * notification stream's volume. Async — no GIF-display blocking.
     */
    private fun playGreetingChime() {
        if (!prefs.soundEnabled) return
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val ringtone = RingtoneManager.getRingtone(applicationContext, uri)
            ringtone?.play()
        } catch (_: Exception) {
            // Audio failure must never block the visual greeting.
        }
    }

    private fun showOperatorPanel() {
        binding.opIn.text  = "IN $latestIn"
        binding.opOut.text = "OUT $latestOut"
        renderBleStatusChip()
        renderNfcStatusChip()
        renderCameraStatusChip()
        // Update button — visible only when behind. Label includes the
        // version delta so the operator knows what they're upgrading to.
        if (prefs.updateAvailable && prefs.latestVersion.isNotBlank()) {
            binding.opUpdate.text = "⬆️ v${BuildConfig.VERSION_NAME} → v${prefs.latestVersion}"
            binding.opUpdate.visibility = View.VISIBLE
        } else {
            binding.opUpdate.visibility = View.GONE
        }
        binding.operatorPanel.visibility = View.VISIBLE
        binding.operatorPanel.bringToFront()
        operatorAutoDismiss?.let { ui.removeCallbacks(it) }
        operatorAutoDismiss = Runnable { hideOperatorPanel() }
        ui.postDelayed(operatorAutoDismiss!!, OPERATOR_AUTO_DISMISS_MS)
    }

    /**
     * Refresh the "Camera: active/inactive" chip in the operator panel.
     * Active iff the camera use cases are bound AND the analyzer has
     * received a frame in the last 2 seconds. Catches the silent
     * failure mode where binding succeeds but no frames flow through
     * the ImageAnalysis use case (the regression that prompted the
     * hidden-PreviewView fix in this commit).
     */
    private fun renderCameraStatusChip() {
        if (!::binding.isInitialized) return
        val now = System.currentTimeMillis()
        val recentFrames = cameraBound && analyzer.lastFrameMs() != 0L &&
            (now - analyzer.lastFrameMs()) < 2_000L
        when {
            prefs.cameraFailed -> {
                binding.opCamera.text = "Camera: failed ❌ — tap to restart"
                binding.opCamera.setTextColor(Color.parseColor("#FF5252"))
                binding.opCamera.isClickable = true
                binding.opCamera.setOnClickListener { restartCameraFromOperator() }
            }
            recentFrames -> {
                binding.opCamera.text = "Camera: active ✅"
                binding.opCamera.setTextColor(Color.parseColor("#00E676"))
                binding.opCamera.isClickable = false
                binding.opCamera.setOnClickListener(null)
            }
            else -> {
                binding.opCamera.text = "Camera: inactive"
                binding.opCamera.setTextColor(Color.parseColor("#FF5252"))
                binding.opCamera.isClickable = false
                binding.opCamera.setOnClickListener(null)
            }
        }
    }

    /**
     * Refresh the "NFC: active/unavailable" chip. The HCE service is
     * always registered in the manifest, so "active" reflects whether
     * the device has NFC hardware enabled (`NfcAdapter` non-null and
     * isEnabled). No way to verify a tap happened from MainActivity —
     * tap events fire in the HceBroadcaster service process — but the
     * service logs every transaction under the "TapProveNFC" tag.
     */
    private fun renderNfcStatusChip() {
        if (!::binding.isInitialized) return
        val adapter = NfcAdapter.getDefaultAdapter(this)
        val (text, colour) = when {
            adapter == null         -> "NFC: unavailable" to android.graphics.Color.parseColor("#9E9E9E")
            !adapter.isEnabled      -> "NFC: disabled"    to android.graphics.Color.parseColor("#FFB300")
            else                    -> "NFC: active"      to android.graphics.Color.parseColor("#00E676")
        }
        binding.opNfc.text = text
        binding.opNfc.setTextColor(colour)
    }

    /**
     * Push the latest BLE broadcaster status into the operator-panel
     * chip. Always safe — `binding` is initialised before the
     * BleBroadcaster constructor (and therefore before the callback
     * could fire), and we guard the binding existence anyway.
     */
    private fun renderBleStatusChip() {
        if (!::binding.isInitialized) return
        val (text, colour) = when (val s = bleStatus) {
            BleBroadcaster.Status.Broadcasting -> "BLE: broadcasting" to Color.parseColor("#00E676")
            BleBroadcaster.Status.NoPermission -> "BLE: no permission" to Color.parseColor("#FFB300")
            BleBroadcaster.Status.Unsupported  -> "BLE: unsupported"  to Color.parseColor("#9E9E9E")
            BleBroadcaster.Status.NotPaired    -> "BLE: not paired"   to Color.parseColor("#9E9E9E")
            BleBroadcaster.Status.Idle         -> "BLE: idle"         to Color.parseColor("#9E9E9E")
            is BleBroadcaster.Status.Failed    -> "BLE: failed [${s.code} ${s.label}]" to Color.parseColor("#FF5252")
        }
        binding.opBle.text = text
        binding.opBle.setTextColor(colour)
    }

    private fun hideOperatorPanel() {
        binding.operatorPanel.visibility = View.GONE
        operatorAutoDismiss?.let { ui.removeCallbacks(it) }
        operatorAutoDismiss = null
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
            // Sound toggle takes effect on the next greeting (the chime
            // function reads prefs.soundEnabled at fire time — no view
            // state to refresh here).
            cmd.soundEnabled?.let { if (it != prefs.soundEnabled) prefs.soundEnabled = it }
            // Opening hours pushed from the dashboard. Persist + re-evaluate
            // the open/closed state immediately so the kiosk transitions
            // without waiting for the next minute tick.
            cmd.openingHoursJson?.let { json ->
                if (json != prefs.openingHoursJson) {
                    prefs.openingHoursJson = json
                    val summary = BusinessHours.summary(prefs).replace("\n", " · ")
                    Log.i("TapProveMain", "Opening hours updated remotely: $summary")
                    // Re-derive isOpen and always re-apply state so the
                    // closed-overlay / next-open text refresh immediately,
                    // not at the next 60-second hours-check tick.
                    isOpen = BusinessHours.isOpen(prefs)
                    applyRunningState()
                }
            }
            // Dashboard-triggered GIF cache refresh.
            if (cmd.refreshGifs == true) {
                Log.i("TapProveMain", "Refreshing GIF cache (remote command)")
                gifCache.triggerCacheRefresh(prefs.resolveDeviceId())
            }
            // Per-business BLE salt. Persisted via EncryptedSharedPreferences
            // (see Prefs.btSalt). SensorHub picks it up on the next BLE scan
            // window. We update only on actual change to avoid pointlessly
            // rewriting the Keystore-backed file every 60s.
            cmd.btSalt?.let { salt ->
                if (salt.isNotEmpty() && salt != prefs.btSalt) {
                    prefs.btSalt = salt
                    Log.i("TapProveMain", "BLE salt provisioned/rotated from backend (${salt.length} chars)")
                }
            }
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
            orientation = prefs.orientation,
            // Queue metrics only meaningful for till zones — heartbeat / non-till
            // uploads report 0 so the dashboard doesn't get phantom alerts.
            queueDepth = if (open && prefs.zoneType == "till") analyzer.currentQueueDepth() else 0,
            queueAlert = open && prefs.zoneType == "till" &&
                analyzer.currentQueueDepth() > prefs.queueThreshold,
            tillMode = if (prefs.zoneType == "till") prefs.tillMode else null,
            soundEnabled = prefs.soundEnabled,
            appVersion = BuildConfig.VERSION_NAME,
            heartbeat = !open,
        )
    }

    // ─────────────────────────────────────────────────────────
    // Camera
    // ─────────────────────────────────────────────────────────

    private fun startCamera() {
        if (cameraBound || pendingCameraStart) return
        pendingCameraStart = true
        Log.i("TapProveCamera", "startCamera() requested")
        val isRetry = cameraRecoveryInFlight
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            try {
                val provider = future.get()
                // setTargetResolution() is a hint and CameraX 1.3 routinely
                // ignores it on phones whose native front-sensor output is a
                // square 3088x3088 — ML Kit then fails silently and no
                // analyze() callback fires. ResolutionSelector with a
                // ResolutionStrategy is the non-deprecated API that
                // actually constrains the choice; FALLBACK_RULE_CLOSEST_
                // LOWER_THEN_HIGHER prefers something at or below 720p so
                // the analyzer keeps a sane workload.
                val resSelector = ResolutionSelector.Builder()
                    .setResolutionStrategy(
                        ResolutionStrategy(
                            TARGET_RES,
                            ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER,
                        )
                    )
                    .build()
                val analysis = ImageAnalysis.Builder()
                    .setResolutionSelector(resSelector)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                    .also { it.setAnalyzer(cameraExecutor, analyzer) }

                // Preview use case is bound to a real (visible) PreviewView
                // covered by the stranger display. CameraX needs a live
                // SurfaceProvider for the camera pipeline to deliver frames
                // to ImageAnalysis on many devices.
                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(binding.previewView.surfaceProvider)
                }

                // Wall-mount, screen-facing-outward install — front lens
                // only. analyzer.mirrorX is hard-true.
                provider.unbindAll()
                provider.bindToLifecycle(
                    this, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analysis,
                )
                cameraBound = true
                val chosen = analysis.resolutionInfo?.resolution
                Log.i("TapProveCamera",
                    "bindToLifecycle ok — front lens; analysis resolution=$chosen (requested $TARGET_RES)")
                scheduleCameraHealthCheck(isRetry)
                scheduleBackgroundJobsOnce()
            } catch (e: Exception) {
                // Operator can't see the chip behind the stranger display
                // anyway — log instead, and surface via the operator
                // panel's "Camera: inactive" chip on the long-press menu.
                Log.e("TapProveCamera", "startCamera failed: ${e.message}", e)
            } finally {
                pendingCameraStart = false
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun unbindCamera() {
        if (!cameraBound) return
        pendingHealthCheck?.let { ui.removeCallbacks(it) }
        pendingHealthCheck = null
        ProcessCameraProvider.getInstance(this).get()?.unbindAll()
        // Clear tracking state so any person mid-frame at unbind doesn't
        // get a stale dwell of "minutes since the camera last ran".
        analyzer.clearTracking()
        cameraBound = false
    }

    /**
     * Schedule a single +30s health check. `isRetry` carries over from
     * the startCamera() call site so the check knows whether a pass
     * means "Auto-recovery successful" or just "normal bind succeeded".
     */
    private fun scheduleCameraHealthCheck(isRetry: Boolean) {
        pendingHealthCheck?.let { ui.removeCallbacks(it) }
        val r = Runnable { runCameraHealthCheck(isRetry) }
        pendingHealthCheck = r
        ui.postDelayed(r, 30_000L)
    }

    private fun runCameraHealthCheck(isRetry: Boolean) {
        pendingHealthCheck = null
        if (!cameraBound) return
        val last = analyzer.lastFrameMs()
        val now = System.currentTimeMillis()
        val healthy = last > 0L && (now - last) < 5_000L
        if (healthy) {
            if (isRetry) {
                Log.i("TapProveCamera", "Auto-recovery successful")
                if (prefs.cameraFailed) {
                    prefs.cameraFailed = false
                    if (binding.operatorPanel.visibility == View.VISIBLE) renderCameraStatusChip()
                }
            }
            cameraRecoveryInFlight = false
            return
        }
        Log.w("TapProveCamera", "HEALTH CHECK FAILED — camera not producing frames")
        if (isRetry) {
            Log.e("TapProveCamera", "Auto-recovery failed — manual restart needed")
            prefs.cameraFailed = true
            cameraRecoveryInFlight = false
            if (binding.operatorPanel.visibility == View.VISIBLE) renderCameraStatusChip()
            return
        }
        cameraRecoveryInFlight = true
        unbindCamera()
        startCamera()
    }

    /** Operator-tap recovery — fresh attempt budget, clears the sticky flag. */
    private fun restartCameraFromOperator() {
        cameraRecoveryInFlight = false
        prefs.cameraFailed = false
        unbindCamera()
        startCamera()
        renderCameraStatusChip()
    }

    /**
     * Fires the on-boot GIF refresh, version check, and daily WorkManager
     * job — but only after the first successful camera bind. Idempotent;
     * subsequent rebinds (closed→open transitions, recovery retries) skip
     * this entirely so we don't re-enqueue WorkManager work or thrash the
     * GIF cache on every state change.
     */
    private fun scheduleBackgroundJobsOnce() {
        if (backgroundJobsScheduled) return
        backgroundJobsScheduled = true
        if (gifCache.isStale()) {
            gifCache.triggerCacheRefresh(prefs.resolveDeviceId())
        }
        VersionChecker.checkAppVersion(prefs, BuildConfig.VERSION_NAME) { _, _ ->
            runOnUiThread { binding.strangerDisplay.refreshUpdateBanner() }
        }
        GifRefreshWorker.schedule(applicationContext)
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

                // Keep the operator panel's Camera chip current — only
                // worth the work if the panel is actually showing.
                if (binding.operatorPanel.visibility == View.VISIBLE) {
                    renderCameraStatusChip()
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
            // API 31+ (Android 12+) needs every BLE op separately granted:
            //   SCAN      — SensorHub scans for nearby phones / peripherals
            //   ADVERTISE — BleBroadcaster broadcasts the Dander service UUID
            //   CONNECT   — required by some OEM stacks even for advertise-only
            // Without ADVERTISE we'd silently fail to broadcast and no user
            // app could detect the kiosk.
            perms.add(Manifest.permission.BLUETOOTH_SCAN)
            perms.add(Manifest.permission.BLUETOOTH_ADVERTISE)
            perms.add(Manifest.permission.BLUETOOTH_CONNECT)
        }
        return perms.toTypedArray()
    }

    private fun granted(perm: String) =
        ContextCompat.checkSelfPermission(this, perm) == PackageManager.PERMISSION_GRANTED

    /**
     * Whether we have the runtime perm required to start BLE advertising
     * on this SDK level. API 31+ needs BLUETOOTH_ADVERTISE; earlier
     * versions (including Android 9 / API 28) gate every BLE operation
     * on ACCESS_FINE_LOCATION — even advertising, despite it being
     * locationally meaningless.
     */
    private fun canStartBleBroadcaster(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            granted(Manifest.permission.BLUETOOTH_ADVERTISE)
        else
            granted(Manifest.permission.ACCESS_FINE_LOCATION)

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
        if (::bleBroadcaster.isInitialized) bleBroadcaster.stop()
        if (::wsClient.isInitialized) wsClient.stop()
        if (::binding.isInitialized) binding.strangerDisplay.stop()
        cameraExecutor.shutdown()
    }
}
