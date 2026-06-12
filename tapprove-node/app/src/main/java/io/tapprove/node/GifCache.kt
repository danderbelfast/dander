package io.tapprove.node

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * GifCache — local on-disk store of every GIF the backend's library
 * holds for this Node's paired business + the global defaults.
 *
 * Refresh flow:
 *   1. POST /api/loyalty/gif-cache?device_id=… returns
 *      { regular: [url, ...], first_visit: [...], ... }
 *   2. For every URL, hash → cache file path. Download if not present.
 *   3. Manifest JSON saved at cacheDir/gifs/manifest.json holds the
 *      trigger → local path mapping for fast lookup.
 *
 * Lookups:
 *   getRandomGif(triggerType) → local file:// path, or null. The
 *   DisplayModeView prefers this over the URL-based fetch because the
 *   coin-spitting overlay can't afford a 1-2s download mid-greeting.
 *
 * Idempotent: re-running refresh against the same set of URLs is fast
 * (download-if-missing only) and safe under concurrent calls because
 * each download writes to its hash-derived path before atomic rename.
 */
class GifCache(private val context: Context) {

    private companion object {
        const val TAG = "TapProveGifCache"
        const val MAX_BYTES_PER_GIF = 5 * 1024 * 1024
        const val MAX_AGE_MS = 24L * 60L * 60L * 1000L
        const val MANIFEST_NAME = "manifest.json"
    }

    private val io = Executors.newSingleThreadExecutor()
    private val cacheDir: File = File(context.cacheDir, "gifs").apply { mkdirs() }
    private val manifestFile: File = File(cacheDir, MANIFEST_NAME)

    @Volatile private var manifest: Manifest = loadManifest()

    data class Manifest(
        val gifs: Map<String, List<String>>,  // triggerType → list of local file paths
        val updatedAt: Long,
    ) {
        companion object {
            val EMPTY = Manifest(emptyMap(), 0L)
        }
    }

    /** True if the manifest is older than MAX_AGE_MS or has never been populated. */
    fun isStale(): Boolean =
        manifest.updatedAt == 0L || System.currentTimeMillis() - manifest.updatedAt > MAX_AGE_MS

    /**
     * Returns a random local file path for the given trigger type, or
     * null if no cached GIF exists for that type. Caller falls back to
     * URL-based loading from the command's gif_url field.
     */
    fun getRandomGif(triggerType: String): String? {
        val list = manifest.gifs[triggerType].orEmpty()
        if (list.isEmpty()) return null
        return list.random()
    }

    /**
     * Kick off a refresh on the IO thread. Safe to call from main —
     * returns immediately. Caller logs the result via the same TAG.
     */
    fun triggerCacheRefresh(deviceId: String, baseUrl: String = "https://api.tapprove.io") {
        io.execute {
            try {
                Log.i(TAG, "refresh starting for $deviceId")
                val urls = fetchCache(baseUrl, deviceId) ?: return@execute
                val newMap = HashMap<String, MutableList<String>>()
                var downloaded = 0; var reused = 0; var failed = 0
                for ((trigger, urlList) in urls) {
                    val paths = ArrayList<String>(urlList.size)
                    for (url in urlList) {
                        val target = File(cacheDir, hashName(url))
                        if (target.exists() && target.length() in 1..MAX_BYTES_PER_GIF.toLong()) {
                            paths += target.absolutePath
                            reused++
                            continue
                        }
                        if (downloadTo(url, target)) {
                            paths += target.absolutePath
                            downloaded++
                        } else {
                            failed++
                        }
                    }
                    if (paths.isNotEmpty()) newMap[trigger] = paths
                }
                val next = Manifest(newMap, System.currentTimeMillis())
                saveManifest(next)
                manifest = next
                Log.i(TAG, "GIF cache refreshed: ${flatCount(next)} GIFs ready " +
                    "(downloaded=$downloaded reused=$reused failed=$failed)")
            } catch (e: Exception) {
                Log.w(TAG, "refresh failed: ${e.message}")
            }
        }
    }

    // ─────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────

    private fun fetchCache(baseUrl: String, deviceId: String): Map<String, List<String>>? {
        val url = "$baseUrl/api/loyalty/gif-cache?device_id=" +
                  java.net.URLEncoder.encode(deviceId, "UTF-8")
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 6_000
                readTimeout = 10_000
            }
            if (conn.responseCode !in 200..299) return null
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            val cache = json.optJSONObject("cache") ?: return null
            val out = HashMap<String, List<String>>(cache.length())
            val keys = cache.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                val arr = cache.optJSONArray(k) ?: continue
                val list = ArrayList<String>(arr.length())
                for (i in 0 until arr.length()) list += arr.optString(i)
                out[k] = list
            }
            out
        } catch (e: Exception) {
            Log.w(TAG, "fetchCache: ${e.message}")
            null
        } finally { conn?.disconnect() }
    }

    private fun downloadTo(url: String, target: File): Boolean {
        val tmp = File(target.parentFile, target.name + ".tmp")
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 6_000
                readTimeout = 15_000
                instanceFollowRedirects = true
            }
            if (conn.responseCode !in 200..299) return false
            conn.inputStream.use { input ->
                tmp.outputStream().use { out ->
                    val buf = ByteArray(16 * 1024)
                    var total = 0L
                    while (true) {
                        val n = input.read(buf)
                        if (n <= 0) break
                        total += n
                        if (total > MAX_BYTES_PER_GIF) {
                            tmp.delete()
                            return false
                        }
                        out.write(buf, 0, n)
                    }
                }
            }
            tmp.renameTo(target)
        } catch (e: Exception) {
            tmp.delete()
            false
        } finally { conn?.disconnect() }
    }

    private fun hashName(url: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(url.toByteArray(Charsets.UTF_8))
        val hex = StringBuilder(16)
        for (i in 0 until 8) {
            val v = bytes[i].toInt() and 0xff
            hex.append("0123456789abcdef"[v ushr 4]); hex.append("0123456789abcdef"[v and 0x0f])
        }
        return hex.toString() + ".gif"
    }

    private fun loadManifest(): Manifest {
        if (!manifestFile.exists()) return Manifest.EMPTY
        return try {
            val root = JSONObject(manifestFile.readText())
            val gifs = root.optJSONObject("gifs") ?: return Manifest.EMPTY
            val out = HashMap<String, List<String>>(gifs.length())
            val keys = gifs.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                val arr = gifs.optJSONArray(k) ?: continue
                val list = ArrayList<String>(arr.length())
                for (i in 0 until arr.length()) {
                    val p = arr.optString(i)
                    if (File(p).exists()) list += p
                }
                if (list.isNotEmpty()) out[k] = list
            }
            Manifest(out, root.optLong("updatedAt", 0L))
        } catch (_: Exception) { Manifest.EMPTY }
    }

    private fun saveManifest(m: Manifest) {
        try {
            val root = JSONObject().apply {
                put("updatedAt", m.updatedAt)
                put("gifs", JSONObject().apply {
                    for ((k, v) in m.gifs) put(k, org.json.JSONArray(v))
                })
            }
            manifestFile.writeText(root.toString())
        } catch (e: Exception) {
            Log.w(TAG, "saveManifest: ${e.message}")
        }
    }

    private fun flatCount(m: Manifest): Int = m.gifs.values.sumOf { it.size }
}
