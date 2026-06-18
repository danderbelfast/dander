package io.tapprove.node

import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * VersionChecker — daily(-ish) ping of /api/public/app-version that
 * keeps prefs.updateAvailable + prefs.latestVersion fresh independently
 * of the webhook piggy-back (which also surfaces these fields on every
 * upload, so this is belt-and-braces for kiosks that for some reason
 * aren't uploading right now).
 *
 * Triggered on app start alongside GifCache.triggerCacheRefresh().
 * A WorkManager daily job is the natural follow-up — for the PoC the
 * boot-time check is sufficient because Nodes restart at least daily
 * via their power schedule.
 */
object VersionChecker {

    private const val TAG = "TapProveUpdate"
    private val io = Executors.newSingleThreadExecutor()

    fun checkAppVersion(
        prefs: Prefs,
        currentVersion: String,
        baseUrl: String = BuildConfig.API_BASE_URL,
        onResult: ((latest: String, behind: Boolean) -> Unit)? = null,
    ) {
        io.execute {
            var conn: HttpURLConnection? = null
            try {
                conn = (URL("$baseUrl/api/public/app-version").openConnection() as HttpURLConnection).apply {
                    connectTimeout = 6_000
                    readTimeout = 8_000
                }
                if (conn.responseCode !in 200..299) return@execute
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(body)
                val latest = json.optString("node_app", "").ifBlank { return@execute }
                val behind = isVersionBehind(currentVersion, latest)
                prefs.latestVersion = latest
                prefs.updateAvailable = behind
                if (behind) {
                    Log.i(TAG, "Update available: $currentVersion → $latest")
                } else {
                    Log.i(TAG, "App is up to date: $currentVersion")
                }
                onResult?.invoke(latest, behind)
            } catch (e: Exception) {
                Log.w(TAG, "version check failed: ${e.message}")
            } finally { conn?.disconnect() }
        }
    }

    /**
     * Patch-level semver compare. "1.0.0" vs "1.2.0" → true (behind),
     * "1.2.0" vs "1.2.0" → false. Empty/garbage components count as 0.
     */
    fun isVersionBehind(current: String, latest: String): Boolean {
        val c = current.split(".").map { it.toIntOrNull() ?: 0 }
        val l = latest.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0..2) {
            val cv = c.getOrElse(i) { 0 }
            val lv = l.getOrElse(i) { 0 }
            if (lv > cv) return true
            if (lv < cv) return false
        }
        return false
    }
}
