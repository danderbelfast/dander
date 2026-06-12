package io.tapprove.node

import android.content.Context
import android.content.SharedPreferences

/**
 * Prefs — typed accessor over SharedPreferences for every operator-tunable
 * value. Defaults sit here so the rest of the codebase never has to think
 * about "what if the user hasn't opened Settings yet."
 */
class Prefs(context: Context) {
    private val sp: SharedPreferences =
        context.applicationContext.getSharedPreferences("tapprove_node", Context.MODE_PRIVATE)

    // Per-day weekly opening hours as JSON. See BusinessHours.kt for the
    // schema. The single open/close hour fields used by previous versions
    // are gone — replaced by this richer schedule that the dashboard pushes
    // remotely via the existing node_commands channel.
    var openingHoursJson: String
        get() = sp.getString(KEY_OPENING_HOURS, BusinessHours.defaultJson()) ?: BusinessHours.defaultJson()
        set(v) = sp.edit().putString(KEY_OPENING_HOURS, v).apply()

    // Display.
    var brightnessPct: Int get() = sp.getInt(KEY_BRIGHTNESS, 20); set(v) = sp.edit().putInt(KEY_BRIGHTNESS, v).apply()

    // Camera/ML.
    var frameInterval:    Int get() = sp.getInt(KEY_FRAME_INTERVAL, 5);     set(v) = sp.edit().putInt(KEY_FRAME_INTERVAL, v).apply()
    var wifiIntervalMin:  Int get() = sp.getInt(KEY_WIFI_INTERVAL, 5);      set(v) = sp.edit().putInt(KEY_WIFI_INTERVAL, v).apply()

    // Zone metadata (sent with every upload).
    var zoneName: String get() = sp.getString(KEY_ZONE_NAME, "Entrance") ?: "Entrance"; set(v) = sp.edit().putString(KEY_ZONE_NAME, v).apply()
    var zoneType: String get() = sp.getString(KEY_ZONE_TYPE, "entrance") ?: "entrance"; set(v) = sp.edit().putString(KEY_ZONE_TYPE, v).apply()

    // Counting strategy.
    //   orientation:      "landscape" (horizontal line) or "portrait" (vertical line)
    //   invertDirection:  flips which crossing direction counts as IN
    //   tillMode:         active only when zoneType == "till" —
    //                     "approach" | "walkpast" | "overhead"
    //   queueThreshold:   queueDepth > queueThreshold triggers an alert
    var orientation:     String  get() = sp.getString(KEY_ORIENTATION, "landscape") ?: "landscape"; set(v) = sp.edit().putString(KEY_ORIENTATION, v).apply()
    var invertDirection: Boolean get() = sp.getBoolean(KEY_INVERT_DIR, false);                       set(v) = sp.edit().putBoolean(KEY_INVERT_DIR, v).apply()
    var tillMode:        String  get() = sp.getString(KEY_TILL_MODE, "overhead") ?: "overhead";    set(v) = sp.edit().putString(KEY_TILL_MODE, v).apply()
    var queueThreshold:  Int     get() = sp.getInt(KEY_QUEUE_THRESHOLD, 3);                          set(v) = sp.edit().putInt(KEY_QUEUE_THRESHOLD, v).apply()

    // Play a short chime when a loyalty greeting overlay appears. Uses the
    // device's default notification sound, so a phone in silent mode stays
    // silent.
    var soundEnabled:    Boolean get() = sp.getBoolean(KEY_SOUND_ENABLED, true);                     set(v) = sp.edit().putBoolean(KEY_SOUND_ENABLED, v).apply()

    // App-update state. Both fields are mirrored from the webhook
    // response on every upload (and refreshed by the daily version
    // check). The StrangerDisplayView reads `updateAvailable` to show
    // the amber banner; MainActivity's operator panel uses both to
    // build the "Update available v0.9 → v1.0" button.
    var updateAvailable: Boolean get() = sp.getBoolean(KEY_UPDATE_AVAILABLE, false); set(v) = sp.edit().putBoolean(KEY_UPDATE_AVAILABLE, v).apply()
    var latestVersion:   String  get() = sp.getString(KEY_LATEST_VERSION, "") ?: "";  set(v) = sp.edit().putString(KEY_LATEST_VERSION, v).apply()

    // Sticky after auto-recovery exhausts its one retry. Operator sees a
    // red "tap to restart" chip; tapping clears it and runs startCamera()
    // again. Never surfaced on the customer-facing stranger display.
    var cameraFailed:    Boolean get() = sp.getBoolean(KEY_CAMERA_FAILED, false);     set(v) = sp.edit().putBoolean(KEY_CAMERA_FAILED, v).apply()

    // Business pairing — set during the first-launch setup flow.
    var businessCode: String get() = sp.getString(KEY_BUSINESS_CODE, "") ?: ""; set(v) = sp.edit().putString(KEY_BUSINESS_CODE, v).apply()
    var businessId:   Int    get() = sp.getInt(KEY_BUSINESS_ID, 0);             set(v) = sp.edit().putInt(KEY_BUSINESS_ID, v).apply()
    var businessName: String get() = sp.getString(KEY_BUSINESS_NAME, "") ?: ""; set(v) = sp.edit().putString(KEY_BUSINESS_NAME, v).apply()

    val isConfigured: Boolean get() = businessCode.length == 4 && businessId > 0

    // Stable per-install id; written once on first launch, never reset.
    fun resolveDeviceId(): String {
        sp.getString(KEY_DEVICE_ID, null)?.let { return it }
        val id = "node-" + java.util.UUID.randomUUID().toString()
        sp.edit().putString(KEY_DEVICE_ID, id).apply()
        return id
    }

    companion object {
        const val KEY_OPENING_HOURS = "opening_hours_json"
        const val KEY_BRIGHTNESS    = "brightness_pct"
        const val KEY_FRAME_INTERVAL = "frame_interval"
        const val KEY_WIFI_INTERVAL = "wifi_interval_min"
        const val KEY_ZONE_NAME     = "zone_name"
        const val KEY_ZONE_TYPE     = "zone_type"
        const val KEY_DEVICE_ID     = "device_id"
        const val KEY_BUSINESS_CODE = "business_code"
        const val KEY_BUSINESS_ID   = "business_id"
        const val KEY_BUSINESS_NAME = "business_name"
        const val KEY_ORIENTATION   = "orientation"
        const val KEY_INVERT_DIR    = "invert_direction"
        const val KEY_TILL_MODE     = "till_mode"
        const val KEY_QUEUE_THRESHOLD = "queue_threshold"
        const val KEY_SOUND_ENABLED = "sound_enabled"
        const val KEY_UPDATE_AVAILABLE = "update_available"
        const val KEY_LATEST_VERSION   = "latest_version"
        const val KEY_CAMERA_FAILED    = "camera_failed"

        val ZONE_TYPES = listOf("entrance", "display", "till", "general")
        val TILL_MODES = listOf("overhead", "walkpast", "approach")
    }
}
