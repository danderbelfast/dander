package io.dander.node

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.Calendar
import java.util.concurrent.TimeUnit

/**
 * GifRefreshWorker — daily background refresh of the on-disk GIF cache.
 *
 * Boot-time check in MainActivity covers the common case (kiosk
 * restarts at least daily). This worker covers the corner case where a
 * Node has been on for many days without restart and the manifest has
 * gone stale. Initial delay is calculated so the first run happens at
 * ~02:00 local time; periodic interval is 24h after that.
 *
 * Network constraint: NetworkType.CONNECTED only, so a kiosk in airplane
 * mode doesn't retry forever.
 *
 * Also checks the app version while it's online — same endpoint,
 * separate HTTP call. Cheap.
 */
class GifRefreshWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        return try {
            val prefs = Prefs(applicationContext)
            val deviceId = prefs.resolveDeviceId()
            Log.i(TAG, "daily refresh starting for $deviceId")
            val cache = GifCache(applicationContext)
            cache.triggerCacheRefresh(deviceId)
            // Best-effort version check alongside.
            VersionChecker.checkAppVersion(prefs, BuildConfig.VERSION_NAME)
            Result.success()
        } catch (e: Exception) {
            Log.w(TAG, "doWork: ${e.message}")
            Result.retry()
        }
    }

    companion object {
        private const val TAG = "DanderGifWorker"
        private const val UNIQUE_NAME = "dander.gif-refresh.daily"
        private const val TARGET_HOUR = 2  // 02:00 local

        /**
         * Enqueue the worker with KEEP policy so re-launching the app
         * doesn't re-schedule and reset the next-run clock. Initial delay
         * targets 02:00 local; on first install the delay is in [0, 24h).
         */
        fun schedule(context: Context) {
            val now = Calendar.getInstance()
            val target = (now.clone() as Calendar).apply {
                set(Calendar.HOUR_OF_DAY, TARGET_HOUR)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
                if (timeInMillis <= now.timeInMillis) add(Calendar.DAY_OF_YEAR, 1)
            }
            val initialDelayMs = target.timeInMillis - now.timeInMillis

            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<GifRefreshWorker>(24, TimeUnit.HOURS)
                .setInitialDelay(initialDelayMs, TimeUnit.MILLISECONDS)
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
            Log.i(TAG, "scheduled daily refresh; first run in ${initialDelayMs / 60_000} min")
        }
    }
}
