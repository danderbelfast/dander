package io.tapprove.node

import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import android.util.Log
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * HceBroadcaster — emulates a Type 4 NDEF Tag containing a single URI
 * record pointing at https://tapprove.io/tap?node=<id>&business=<id>.
 *
 * When any phone taps the Node, its OS executes the standard Type 4
 * NDEF read sequence:
 *
 *   1. SELECT AID D2760000850101            → 9000
 *   2. SELECT FILE E103 (CC)                → 9000
 *   3. READ BINARY (CC contents, 15 bytes)  → <CC> 9000
 *   4. SELECT FILE E104 (NDEF)              → 9000
 *   5. READ BINARY (2-byte NLEN)            → <NLEN> 9000
 *   6. READ BINARY (NDEF message body)      → <NDEF> 9000
 *
 * The reading phone then either:
 *   - Opens the URL in its browser (stranger path), or
 *   - Hands the URL to the registered Dander App Link handler.
 *
 * `processCommandApdu` rebuilds the URL from Prefs on every transaction
 * so a re-pair (new business_id / device_id) is picked up without
 * restarting the service.
 */
class HceBroadcaster : HostApduService() {

    private companion object {
        const val TAG = "TapProveNFC"

        // Standard NDEF Tag Application AID.
        private val SELECT_NDEF_APP = hexBytes("00A4040007D2760000850101")
        // SELECT CC FILE (E103) and SELECT NDEF FILE (E104).
        private const val FILE_ID_CC   = 0xE103
        private const val FILE_ID_NDEF = 0xE104

        // CC file (15 bytes, NDEF Type 4 Tag v2.0 spec).
        private val CC_FILE = byteArrayOf(
            0x00, 0x0F,                  // CCLEN
            0x20,                        // Mapping Version (2.0)
            0x00, 0x3B,                  // Max R-APDU data size (59)
            0x00, 0x34,                  // Max C-APDU data size (52)
            0x04,                        // TLV: NDEF File Control
            0x06,                        // L = 6
            0xE1.toByte(), 0x04,         // File ID
            0x7F.toByte(), 0xFF.toByte(), // Max NDEF size (32767)
            0x00,                        // Read access (free)
            0xFF.toByte()                // Write access (no write)
        )

        // SW1/SW2 responses.
        private val SW_OK             = hexBytes("9000")
        private val SW_FILE_NOT_FOUND = hexBytes("6A82")
        private val SW_NOT_SUPPORTED  = hexBytes("6A81")

        private fun hexBytes(s: String): ByteArray {
            val out = ByteArray(s.length / 2)
            for (i in out.indices) out[i] = s.substring(i * 2, i * 2 + 2).toInt(16).toByte()
            return out
        }
    }

    private var selectedFile = 0
    private var ndefBlob: ByteArray = ByteArray(0)

    override fun onCreate() {
        super.onCreate()
        rebuildNdef()
        Log.i(TAG, "NFC: broadcasting (${ndefBlob.size} byte NDEF blob ready)")
    }

    override fun processCommandApdu(commandApdu: ByteArray?, extras: Bundle?): ByteArray {
        if (commandApdu == null) return SW_NOT_SUPPORTED

        // Rebuild on every transaction so prefs changes propagate
        // without restarting the service.
        rebuildNdef()
        Log.i(TAG, "NFC: tapped by device (cmd ${commandApdu.size} bytes)")

        // 1. SELECT AID
        if (matchesPrefix(commandApdu, SELECT_NDEF_APP)) {
            return SW_OK
        }

        // 2/4. SELECT FILE by 2-byte file ID
        if (commandApdu.size >= 7 && commandApdu[0] == 0x00.toByte() && commandApdu[1] == 0xA4.toByte()
            && commandApdu[2] == 0x00.toByte() && commandApdu[3] == 0x0C.toByte()) {
            val fileId = ((commandApdu[5].toInt() and 0xFF) shl 8) or (commandApdu[6].toInt() and 0xFF)
            when (fileId) {
                FILE_ID_CC   -> { selectedFile = FILE_ID_CC;   return SW_OK }
                FILE_ID_NDEF -> { selectedFile = FILE_ID_NDEF; return SW_OK }
                else         -> return SW_FILE_NOT_FOUND
            }
        }

        // 3/5/6. READ BINARY P1 P2 Le
        if (commandApdu.size >= 5 && commandApdu[0] == 0x00.toByte() && commandApdu[1] == 0xB0.toByte()) {
            val offset = ((commandApdu[2].toInt() and 0xFF) shl 8) or (commandApdu[3].toInt() and 0xFF)
            val le = commandApdu[4].toInt() and 0xFF
            val source = when (selectedFile) {
                FILE_ID_CC   -> CC_FILE
                FILE_ID_NDEF -> ndefBlob
                else         -> return SW_FILE_NOT_FOUND
            }
            return readBinaryResponse(source, offset, if (le == 0) 256 else le)
        }

        return SW_NOT_SUPPORTED
    }

    override fun onDeactivated(reason: Int) {
        Log.d(TAG, "NFC: link deactivated reason=$reason")
        selectedFile = 0
    }

    private fun rebuildNdef() {
        val prefs = Prefs(applicationContext)
        val deviceId = prefs.resolveDeviceId()
        val businessId = prefs.businessId
        // MUST be a fully-qualified https:// URL — App Links verification
        // only works for the HTTPS scheme. Apps without a verified link
        // fall through to the browser and hit the /join landing page.
        val url = "https://tapprove.io/tap" +
                  "?node=" + java.net.URLEncoder.encode(deviceId, "UTF-8") +
                  "&business=" + businessId
        Log.d(TAG, "rebuildNdef url=$url")
        ndefBlob = buildNdefFile(url)
    }

    /**
     * Build the contents of the NDEF file: a 2-byte big-endian NLEN
     * followed by a single NDEF URI record carrying `url` with
     * identifier code 0x00 ("no abbreviation").
     */
    private fun buildNdefFile(url: String): ByteArray {
        val urlBytes = url.toByteArray(Charsets.UTF_8)
        val payload = ByteArray(urlBytes.size + 1).also {
            it[0] = 0x00 // URI identifier code — full URL
            System.arraycopy(urlBytes, 0, it, 1, urlBytes.size)
        }
        // Header byte: MB=1, ME=1, CF=0, SR=1, IL=0, TNF=001 (well-known)
        val header = 0xD1.toByte()
        val typeBytes = byteArrayOf('U'.code.toByte())
        val message = ByteArrayOutputStream().apply {
            write(header.toInt())
            write(typeBytes.size)
            write(payload.size)        // SR=1 → 1-byte payload length
            write(typeBytes)
            write(payload)
        }.toByteArray()
        // Prepend 2-byte big-endian NLEN.
        return ByteBuffer.allocate(2 + message.size)
            .order(ByteOrder.BIG_ENDIAN)
            .putShort(message.size.toShort())
            .put(message)
            .array()
    }

    private fun readBinaryResponse(source: ByteArray, offset: Int, le: Int): ByteArray {
        if (offset >= source.size) return SW_OK   // Nothing more to read.
        val end = (offset + le).coerceAtMost(source.size)
        val chunk = source.copyOfRange(offset, end)
        val out = ByteArray(chunk.size + 2)
        System.arraycopy(chunk, 0, out, 0, chunk.size)
        out[out.size - 2] = 0x90.toByte()
        out[out.size - 1] = 0x00.toByte()
        return out
    }

    private fun matchesPrefix(a: ByteArray, prefix: ByteArray): Boolean {
        if (a.size < prefix.size) return false
        for (i in prefix.indices) if (a[i] != prefix[i]) return false
        return true
    }
}
