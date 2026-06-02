package io.dander.node

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.util.AttributeSet
import android.view.Gravity
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * StrangerDisplayView — small idle strip rendered along the bottom of
 * the kiosk when no loyalty greeting is being shown. Tells a stranger
 * (no Dander app, no detected proximity) who they're in front of and
 * how to start earning points.
 *
 *   business name · today's visitor count · headline offer · QR to dander.io
 *
 * Refreshes every 5 minutes from
 *   GET /api/public/business/:id/stranger-display
 *
 * Visibility is owned by MainActivity — it hides this view while the
 * DisplayModeView greeting overlay is up, and shows it again on dismiss.
 */
class StrangerDisplayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {

    private companion object {
        const val REFRESH_MS = 5L * 60L * 1000L
        const val BASE_URL = "https://api.dander.io"
        const val APP_URL  = "https://dander.io"
        const val QR_PX    = 220
    }

    private val ui = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()

    private val txtBusiness: TextView
    private val txtVisitors: TextView
    private val txtOffer:    TextView
    private val qrView:      ImageView

    private var businessId: Int = 0
    private var refreshRunnable: Runnable? = null

    init {
        setBackgroundColor(Color.parseColor("#CC0A0A0F"))
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(24, 16, 24, 16)
        }
        addView(row, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))

        val textCol = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        row.addView(textCol)

        txtBusiness = TextView(context).apply {
            textSize = 18f
            setTextColor(Color.WHITE)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        txtVisitors = TextView(context).apply {
            textSize = 12f
            setTextColor(Color.parseColor("#B0BEC5"))
            setPadding(0, 4, 0, 0)
        }
        txtOffer = TextView(context).apply {
            textSize = 14f
            setTextColor(Color.parseColor("#FFB300"))
            setPadding(0, 6, 0, 0)
        }
        textCol.addView(txtBusiness)
        textCol.addView(txtVisitors)
        textCol.addView(txtOffer)

        // QR + caption stack.
        val qrCol = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        row.addView(qrCol)
        qrView = ImageView(context).apply {
            val side = (resources.displayMetrics.density * 70).toInt()
            layoutParams = LinearLayout.LayoutParams(side, side)
            setBackgroundColor(Color.WHITE)
        }
        val qrCaption = TextView(context).apply {
            text = "Scan for points"
            textSize = 11f
            setTextColor(Color.parseColor("#E0E0E0"))
            setPadding(0, 4, 0, 0)
        }
        qrCol.addView(qrView)
        qrCol.addView(qrCaption)

        qrView.setImageBitmap(generateQr(APP_URL, QR_PX))
        txtBusiness.text = ""
        txtVisitors.text = ""
        txtOffer.text = ""
    }

    /** Start the periodic refresh loop. Safe to call repeatedly. */
    fun start(businessId: Int) {
        if (businessId <= 0) return
        this.businessId = businessId
        refreshRunnable?.let { ui.removeCallbacks(it) }
        refreshRunnable = object : Runnable {
            override fun run() {
                refresh()
                ui.postDelayed(this, REFRESH_MS)
            }
        }
        ui.post(refreshRunnable!!)
    }

    fun stop() {
        refreshRunnable?.let { ui.removeCallbacks(it) }
        refreshRunnable = null
    }

    private fun refresh() {
        val id = businessId
        if (id <= 0) return
        io.execute {
            val json = try {
                val url = URL("$BASE_URL/api/public/business/$id/stranger-display")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 4000; readTimeout = 6000
                }
                if (conn.responseCode !in 200..299) { conn.disconnect(); return@execute }
                val text = conn.inputStream.bufferedReader().use { it.readText() }
                conn.disconnect()
                JSONObject(text)
            } catch (_: Exception) { null } ?: return@execute

            val name = json.optString("business_name", "")
            val visitors = json.optInt("visitor_count_today", 0)
            val offerObj = json.optJSONObject("todays_offer")
            val offerText = offerObj?.optString("title", "")?.takeIf { it.isNotBlank() }
            ui.post {
                txtBusiness.text = name
                txtVisitors.text = "Today: $visitors visitors"
                txtOffer.text = offerText?.let { "Today's offer: $it" } ?: ""
            }
        }
    }

    private fun generateQr(text: String, size: Int): Bitmap {
        val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size)
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
        for (x in 0 until size) for (y in 0 until size) {
            bmp.setPixel(x, y, if (matrix[x, y]) Color.BLACK else Color.WHITE)
        }
        return bmp
    }
}
