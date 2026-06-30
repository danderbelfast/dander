package io.tapprove.node

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService

/**
 * MonitorService — the always-on foreground service that owns the node's
 * long-lived sensing lifecycle (camera, sensors, uploader, hours/thermal
 * loops).
 *
 * FOUNDATION (Increment 1): establishes the foreground service (specialUse)
 * + a partial wake lock + START_STICKY restart, so the OS can no longer
 * silently kill out-of-hours monitoring (the known root cause — everything
 * previously ran in MainActivity and died on screen-off / Doze).
 *
 * The sensing itself still lives in MainActivity at this point; Increment 2
 * migrates camera + SensorHub + Uploader + WsClient + the hours loop into
 * THIS service (camera bound to this service's Lifecycle), with a defensive
 * 1x1 no-op-Surface fallback for HALs that won't deliver headless frames
 * (see CameraProbe). The Activity then becomes a pure observer.
 */
class MonitorService : LifecycleService() {

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        startInForeground()
        acquireWakeLock()
        Log.i(TAG, "created (foreground + partial wake lock)")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        // START_STICKY: if the OS kills us under memory pressure, recreate the
        // service. The scheduled wake alarm (Increment 3) is the backstop for
        // process death during deep sleep, when no service is running at all.
        return START_STICKY
    }

    override fun onBind(intent: Intent): IBinder? {
        super.onBind(intent)
        // No local binder yet — Increment 2 exposes one so the Activity can
        // observe sensing state / receive display-command events.
        return null
    }

    override fun onDestroy() {
        releaseWakeLock()
        Log.i(TAG, "destroyed")
        super.onDestroy()
    }

    private fun startInForeground() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Monitoring", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Keeps anonymous counting + loyalty running."
                    setShowBadge(false)
                }
            )
        }
        val tapIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notif: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("TapProve node active")
            .setContentText("Anonymous counting + loyalty are running.")
            .setSmallIcon(android.R.drawable.presence_online)
            .setOngoing(true)
            .setContentIntent(tapIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        // specialUse FGS type only exists API 34+; pass 0 (untyped, allowed)
        // below that. Manifest declares foregroundServiceType="specialUse".
        val type = if (Build.VERSION.SDK_INT >= 34)
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        ServiceCompat.startForeground(this, NOTIF_ID, notif, type)
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "tapprove:monitor").apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun releaseWakeLock() {
        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) { /* ignore */ }
        wakeLock = null
    }

    companion object {
        private const val TAG = "TapProveMonitor"
        private const val CHANNEL_ID = "tapprove_monitor"
        private const val NOTIF_ID = 1001

        /** Start (or no-op if already running) the foreground monitor service. */
        fun start(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, MonitorService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, MonitorService::class.java))
        }
    }
}
