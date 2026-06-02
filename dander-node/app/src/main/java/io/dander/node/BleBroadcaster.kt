package io.dander.node

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
import androidx.core.content.ContextCompat
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

/**
 * BleBroadcaster — advertise this Dander Node so nearby Dander user
 * apps can recognise the kiosk and trigger a loyalty greeting.
 *
 * The advertisement carries enough state in the *service data* field to
 * identify the right business + device without the user app having to
 * round-trip to the backend just to figure out who's nearby:
 *
 *   service UUID  : DANDER_SERVICE_UUID
 *   service data  : [ business_id (4B LE int32) | device_id prefix (8B ASCII) ]
 *
 * The device_id prefix is the first 8 hex chars after the "node-" prefix
 * the Node generates at first boot. The user app picks the strongest
 * advertisement matching the Dander UUID, reads the business_id straight
 * from the bytes, and POSTs /api/proximity/detected. No MAC tracking
 * (the phone's BLE MAC randomises anyway), no fragile name parsing.
 *
 * BLE peripheral mode requires API 21+ and a chipset that supports
 * advertising — every modern Android handset does. `start()` is safe to
 * call before permissions or hardware are ready; it just no-ops and can
 * be retried.
 */
class BleBroadcaster(
    private val context: Context,
    private val prefs: Prefs,
) {
    companion object {
        // Fixed Dander service UUID — every Node uses this so the user
        // app can filter by it during scanning. Random UUID4 generated
        // once and burnt in.
        val DANDER_SERVICE_UUID: UUID = UUID.fromString("6e646564-616e-6465-7200-000000000001")
        private val PARCEL_UUID = ParcelUuid(DANDER_SERVICE_UUID)
        // Service data payload length: 4 bytes business_id + 8 bytes
        // device_id prefix. Stays under the 31-byte legacy adv budget.
        private const val PAYLOAD_LEN = 12
    }

    private var advertiser: BluetoothLeAdvertiser? = null
    @Volatile private var advertising = false

    private val callback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            advertising = true
        }

        override fun onStartFailure(errorCode: Int) {
            // ALREADY_STARTED (3) is fine — somebody else started it.
            // The rest we just log and back off; the next start() retries.
            advertising = (errorCode == ADVERTISE_FAILED_ALREADY_STARTED)
        }
    }

    fun start() {
        if (advertising) return
        if (!hasAdvertisePermission()) return

        val mgr = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager ?: return
        val adapter: BluetoothAdapter = mgr.adapter ?: return
        if (!adapter.isEnabled) return
        advertiser = adapter.bluetoothLeAdvertiser ?: return

        val businessId = prefs.businessId
        val deviceId   = prefs.resolveDeviceId()
        if (businessId <= 0) return                 // not paired yet — nothing to advertise
        val payload = buildPayload(businessId, deviceId) ?: return

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(false)
            .build()

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)            // save room in the 31-byte budget
            .addServiceUuid(PARCEL_UUID)
            .addServiceData(PARCEL_UUID, payload)
            .build()

        try {
            advertiser?.startAdvertising(settings, data, callback)
        } catch (_: SecurityException) {
            // Permission was revoked between check and call. Safe to ignore.
        }
    }

    fun stop() {
        val a = advertiser ?: return
        try { a.stopAdvertising(callback) } catch (_: Exception) {}
        advertising = false
    }

    private fun buildPayload(businessId: Int, deviceId: String): ByteArray? {
        // device_id is "node-<uuid>"; we take 8 hex chars from after the
        // dash so the prefix is stable per device.
        val cleaned = deviceId.removePrefix("node-").replace("-", "")
        if (cleaned.length < 8) return null
        val prefix = cleaned.substring(0, 8).toByteArray(Charsets.US_ASCII)

        return ByteBuffer.allocate(PAYLOAD_LEN)
            .order(ByteOrder.LITTLE_ENDIAN)
            .putInt(businessId)
            .put(prefix)
            .array()
    }

    private fun hasAdvertisePermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_ADVERTISE) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            true   // pre-S inherits from the legacy BLUETOOTH/BLUETOOTH_ADMIN perms
        }
    }
}
