package io.tapprove.node

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import androidx.core.content.ContextCompat
import java.util.UUID

/**
 * BleBroadcaster — advertise this Dander Node so nearby Dander user
 * apps can recognise the kiosk and trigger a loyalty greeting.
 *
 * The legacy BLE advertising packet is 31 bytes total. Once the flags
 * AD and the 128-bit service UUID/data overhead are accounted for, only
 * ~8 bytes of service-data payload fit reliably. We therefore broadcast
 * only the 8-char device_id prefix; the user app resolves business_id
 * from its locally-cached /api/nodes/known map keyed by that prefix.
 *
 *   service UUID  : DANDER_SERVICE_UUID
 *   service data  : device_id prefix (8B ASCII)
 *
 * BLE peripheral mode requires API 21+ and a chipset that supports
 * advertising — every modern Android handset does. `start()` is safe to
 * call before permissions or hardware are ready; it just no-ops and can
 * be retried.
 *
 * Diagnostic surface: every branch in `start()` emits a logcat line
 * under the "TapProveBLE" tag AND propagates a Status into the
 * `onStatus` callback so the on-screen indicator stays accurate
 * without logcat being attached.
 */
class BleBroadcaster(
    private val context: Context,
    private val prefs: Prefs,
    private val onStatus: (Status) -> Unit = {},
) {
    /**
     * Diagnostic state surfaced to the UI. Mirrors the AdvertiseCallback
     * paths plus the pre-callback fail-fasts (no permission, no hardware,
     * no pairing). MainActivity flattens this into a chip on the
     * operator panel.
     */
    sealed class Status {
        /** start() hasn't been called or stop() reset us. */
        object Idle           : Status()
        /** No BLE-advertise permission granted at runtime. */
        object NoPermission   : Status()
        /** No paired business yet — start() returned without trying. */
        object NotPaired      : Status()
        /** Device has no BLE adapter or the adapter exposes no advertiser. */
        object Unsupported    : Status()
        /** AdvertiseCallback.onStartSuccess fired. */
        object Broadcasting   : Status()
        /** AdvertiseCallback.onStartFailure — code mapped per spec. */
        data class Failed(val code: Int, val label: String) : Status()
    }

    companion object {
        private const val TAG = "TapProveBLE"

        val DANDER_SERVICE_UUID: UUID = UUID.fromString("6e646564-616e-6465-7200-000000000001")
        private val PARCEL_UUID = ParcelUuid(DANDER_SERVICE_UUID)
        // 8 bytes — the maximum that fits alongside a 128-bit service-data
        // UUID inside the 31-byte legacy adv budget. Changing this requires
        // a matching update in app/src/services/beaconScanner.ts.
        private const val PAYLOAD_LEN = 8

        // Per BluetoothLeAdvertiser docs — codes returned to onStartFailure.
        private fun errorCodeLabel(code: Int): String = when (code) {
            1 -> "DATA_TOO_LARGE"
            2 -> "TOO_MANY_ADVERTISERS"
            3 -> "ALREADY_STARTED"
            4 -> "INTERNAL_ERROR"
            5 -> "FEATURE_UNSUPPORTED"
            else -> "UNKNOWN($code)"
        }
    }

    private var advertiser: BluetoothLeAdvertiser? = null
    @Volatile private var advertising = false
    @Volatile var status: Status = Status.Idle
        private set

    private val callback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            advertising = true
            Log.i(TAG, "onStartSuccess — broadcasting (mode=${settingsInEffect?.mode}, " +
                "txPower=${settingsInEffect?.txPowerLevel})")
            report(Status.Broadcasting)
        }

        override fun onStartFailure(errorCode: Int) {
            val label = errorCodeLabel(errorCode)
            // ALREADY_STARTED is harmless — the radio is already advertising
            // our payload from a prior call. Surface it as Broadcasting so
            // the UI doesn't flip red on a benign double-start.
            if (errorCode == ADVERTISE_FAILED_ALREADY_STARTED) {
                advertising = true
                Log.w(TAG, "onStartFailure code=$errorCode ($label) — already broadcasting, treating as success")
                report(Status.Broadcasting)
            } else {
                advertising = false
                Log.e(TAG, "onStartFailure code=$errorCode ($label)")
                report(Status.Failed(errorCode, label))
            }
        }
    }

    fun start() {
        Log.i(TAG, "start() called (sdk=${Build.VERSION.SDK_INT}, businessId=${prefs.businessId})")
        if (advertising) {
            Log.d(TAG, "  already advertising — skipping")
            return
        }

        if (!hasAdvertisePermission()) {
            Log.w(TAG, "  hasAdvertisePermission=false — bailing")
            report(Status.NoPermission)
            return
        }
        Log.d(TAG, "  hasAdvertisePermission=true")

        val mgr = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        if (mgr == null) {
            Log.w(TAG, "  BluetoothManager service is null — unsupported")
            report(Status.Unsupported)
            return
        }
        val adapter: BluetoothAdapter? = mgr.adapter
        if (adapter == null) {
            Log.w(TAG, "  BluetoothManager.adapter is null — unsupported")
            report(Status.Unsupported)
            return
        }
        if (!adapter.isEnabled) {
            Log.w(TAG, "  adapter present but not enabled — treating as unsupported until user toggles BT on")
            report(Status.Unsupported)
            return
        }
        val le = adapter.bluetoothLeAdvertiser
        if (le == null) {
            // This is the silent failure point — adapter exists, BLE is on,
            // but the chipset/firmware doesn't support peripheral mode.
            Log.w(TAG, "  adapter.bluetoothLeAdvertiser is null — chipset lacks BLE peripheral support")
            report(Status.Unsupported)
            return
        }
        advertiser = le

        val businessId = prefs.businessId
        val deviceId   = prefs.resolveDeviceId()
        if (businessId <= 0) {
            Log.i(TAG, "  not paired (businessId=$businessId) — nothing to advertise")
            report(Status.NotPaired)
            return
        }
        // business_id is intentionally NOT in the payload — see class
        // doc-comment. The user app derives it from /api/nodes/known.
        val payload = buildPayload(deviceId)
        if (payload == null) {
            Log.w(TAG, "  buildPayload returned null (deviceId=$deviceId) — treating as unsupported")
            report(Status.Unsupported)
            return
        }

        // ADVERTISE_TX_POWER_HIGH is explicit for Android 9 / API 28 BLE
        // stacks where the default ("MEDIUM") on some OEM ROMs ends up
        // below the scanner's RSSI threshold. LOW_LATENCY mode keeps the
        // adv interval tight so a fast walk-by still gets picked up.
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(false)
            .build()

        // The 128-bit UUID is already carried inside the service data AD
        // structure — adding it separately via addServiceUuid() duplicates
        // 18 bytes of overhead and pushes the legacy 31-byte adv packet
        // over budget, which the radio reports as DATA_TOO_LARGE (code 1).
        // Scanners filtering by service UUID still match because the
        // service data AD declares the UUID in its header.
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceData(PARCEL_UUID, payload)
            .build()

        Log.i(TAG, "  startAdvertising → settings(mode=${settings.mode}, txPower=${settings.txPowerLevel}, " +
            "connectable=${settings.isConnectable}); data(uuid=$DANDER_SERVICE_UUID, " +
            "serviceDataBytes=${payload.size}, includeName=${data.includeDeviceName})")

        try {
            advertiser?.startAdvertising(settings, data, callback)
        } catch (e: SecurityException) {
            Log.e(TAG, "  startAdvertising threw SecurityException: ${e.message}")
            report(Status.NoPermission)
        }
    }

    fun stop() {
        val a = advertiser ?: return
        Log.i(TAG, "stop() called")
        try { a.stopAdvertising(callback) } catch (e: Exception) {
            Log.w(TAG, "  stopAdvertising threw: ${e.message}")
        }
        advertising = false
        report(Status.Idle)
    }

    private fun report(s: Status) {
        status = s
        try { onStatus(s) } catch (_: Exception) { /* never let UI explode kill the radio loop */ }
    }

    private fun buildPayload(deviceId: String): ByteArray? {
        // 8 ASCII bytes — the device_id prefix only. business_id used to
        // be packed as a 4-byte LE int32 here but pushed the legacy adv
        // packet over the 31-byte limit (DATA_TOO_LARGE on first start).
        val cleaned = deviceId.removePrefix("node-").replace("-", "")
        if (cleaned.length < 8) return null
        return cleaned.substring(0, 8).toByteArray(Charsets.US_ASCII)
    }

    private fun hasAdvertisePermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // API 31+ (Android 12+): BLUETOOTH_ADVERTISE is a runtime
            // permission that the user must grant explicitly.
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_ADVERTISE) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            // API ≤ 30 (Android 11 and earlier, including Android 9):
            // BLUETOOTH and BLUETOOTH_ADMIN are install-time perms granted
            // automatically. The runtime gate is ACCESS_FINE_LOCATION —
            // Android 9 in particular rejects any BLE operation without
            // it, even though advertising doesn't logically need location.
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        }
    }
}
