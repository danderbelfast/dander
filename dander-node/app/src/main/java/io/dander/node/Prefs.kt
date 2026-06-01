package io.dander.node

import android.content.Context
import android.content.SharedPreferences

/**
 * Prefs — typed accessor over SharedPreferences for every operator-tunable
 * value. Defaults sit here so the rest of the codebase never has to think
 * about "what if the user hasn't opened Settings yet."
 */
class Prefs(context: Context) {
    private val sp: SharedPreferences =
        context.applicationContext.getSharedPreferences("dander_node", Context.MODE_PRIVATE)

    // Business hours (24h, local time).
    var openHour:  Int get() = sp.getInt(KEY_OPEN_HOUR,  9);  set(v) = sp.edit().putInt(KEY_OPEN_HOUR,  v).apply()
    var openMin:   Int get() = sp.getInt(KEY_OPEN_MIN,   0);  set(v) = sp.edit().putInt(KEY_OPEN_MIN,   v).apply()
    var closeHour: Int get() = sp.getInt(KEY_CLOSE_HOUR, 18); set(v) = sp.edit().putInt(KEY_CLOSE_HOUR, v).apply()
    var closeMin:  Int get() = sp.getInt(KEY_CLOSE_MIN,  0);  set(v) = sp.edit().putInt(KEY_CLOSE_MIN,  v).apply()

    // Display.
    var brightnessPct: Int get() = sp.getInt(KEY_BRIGHTNESS, 20); set(v) = sp.edit().putInt(KEY_BRIGHTNESS, v).apply()

    // Camera/ML.
    var frameInterval:    Int get() = sp.getInt(KEY_FRAME_INTERVAL, 5);     set(v) = sp.edit().putInt(KEY_FRAME_INTERVAL, v).apply()
    var wifiIntervalMin:  Int get() = sp.getInt(KEY_WIFI_INTERVAL, 5);      set(v) = sp.edit().putInt(KEY_WIFI_INTERVAL, v).apply()

    // Zone metadata (sent with every upload).
    var zoneName: String get() = sp.getString(KEY_ZONE_NAME, "Entrance") ?: "Entrance"; set(v) = sp.edit().putString(KEY_ZONE_NAME, v).apply()
    var zoneType: String get() = sp.getString(KEY_ZONE_TYPE, "entrance") ?: "entrance"; set(v) = sp.edit().putString(KEY_ZONE_TYPE, v).apply()

    // Stable per-install id; written once on first launch, never reset.
    fun resolveDeviceId(): String {
        sp.getString(KEY_DEVICE_ID, null)?.let { return it }
        val id = "node-" + java.util.UUID.randomUUID().toString()
        sp.edit().putString(KEY_DEVICE_ID, id).apply()
        return id
    }

    companion object {
        const val KEY_OPEN_HOUR     = "open_hour"
        const val KEY_OPEN_MIN      = "open_min"
        const val KEY_CLOSE_HOUR    = "close_hour"
        const val KEY_CLOSE_MIN     = "close_min"
        const val KEY_BRIGHTNESS    = "brightness_pct"
        const val KEY_FRAME_INTERVAL = "frame_interval"
        const val KEY_WIFI_INTERVAL = "wifi_interval_min"
        const val KEY_ZONE_NAME     = "zone_name"
        const val KEY_ZONE_TYPE     = "zone_type"
        const val KEY_DEVICE_ID     = "device_id"

        val ZONE_TYPES = listOf("entrance", "aisle", "till", "window", "back")
    }
}
