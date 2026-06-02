package io.dander.node

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.util.AttributeSet
import android.util.TypedValue
import android.view.Gravity
import android.view.View
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
 * StrangerDisplayView — full-screen customer-facing idle display.
 *
 * Three vertical sections, each 1/3 of the screen:
 *
 *   1. Top:    business name + "Today: N visitors" (entrance-only count)
 *   2. Middle: "TODAY'S SPECIAL" + offer title/description, or the
 *              "Download Dander for loyalty points" fallback if no
 *              active offer.
 *   3. Bottom: QR code linking to dander.io + "Scan to download Dander"
 *
 * Text sizes target legibility at 1–2 metres. Background is a flat
 * near-black so customer attention lands on the headline content,
 * not the chrome.
 *
 * Refreshes every 5 min from /api/public/business/:id/stranger-display.
 */
class StrangerDisplayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {

    private companion object {
        const val REFRESH_MS = 5L * 60L * 1000L
        const val BASE_URL = "https://api.dander.io"
        const val APP_URL  = "https://dander.io"
        const val QR_PX    = 360
    }

    private val ui = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()

    private val txtBusiness: TextView
    private val txtVisitors: TextView
    private val txtSpecialLabel: TextView
    private val txtOfferTitle: TextView
    private val txtOfferDesc:  TextView
    private val qrView: ImageView
    private val qrCaption: TextView

    private var businessId: Int = 0
    private var refreshRunnable: Runnable? = null

    init {
        setBackgroundColor(Color.parseColor("#FF1A1A1A"))

        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        }
        addView(root)

        // ── Section 1: business name + today's visitor count ─────
        val section1 = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 32, 48, 32)
            layoutParams = LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
        }
        root.addView(section1)

        txtBusiness = TextView(context).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 56f)
            setTextColor(Color.WHITE)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            gravity = Gravity.CENTER
            text = ""
        }
        txtVisitors = TextView(context).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
            setTextColor(Color.parseColor("#FF6B35"))
            gravity = Gravity.CENTER
            setPadding(0, 18, 0, 0)
            text = ""
        }
        section1.addView(txtBusiness)
        section1.addView(txtVisitors)

        // ── Section 2: today's special / fallback ────────────────
        val section2 = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(64, 16, 64, 16)
            layoutParams = LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
        }
        root.addView(section2)

        txtSpecialLabel = TextView(context).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setTextColor(Color.parseColor("#9E9E9E"))
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            letterSpacing = 0.18f
            gravity = Gravity.CENTER
            text = ""
        }
        txtOfferTitle = TextView(context).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 32f)
            setTextColor(Color.WHITE)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(0, 10, 0, 0)
            text = ""
        }
        txtOfferDesc = TextView(context).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            setTextColor(Color.parseColor("#E0E0E0"))
            gravity = Gravity.CENTER
            setPadding(0, 12, 0, 0)
            text = ""
        }
        section2.addView(txtSpecialLabel)
        section2.addView(txtOfferTitle)
        section2.addView(txtOfferDesc)

        // ── Section 3: QR + caption ──────────────────────────────
        val section3 = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 16, 48, 48)
            layoutParams = LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
        }
        root.addView(section3)

        val qrSidePx = (resources.displayMetrics.density * 180).toInt()
        qrView = ImageView(context).apply {
            setBackgroundColor(Color.WHITE)
            setPadding(20, 20, 20, 20)
            layoutParams = LinearLayout.LayoutParams(qrSidePx, qrSidePx)
        }
        qrCaption = TextView(context).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setTextColor(Color.parseColor("#BDBDBD"))
            gravity = Gravity.CENTER
            setPadding(0, 18, 0, 0)
            text = "Scan to download Dander"
        }
        section3.addView(qrView)
        section3.addView(qrCaption)

        qrView.setImageBitmap(generateQr(APP_URL, QR_PX))
        applyOfferOrFallback(null)
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

    private fun applyOfferOrFallback(offer: JSONObject?) {
        val title = offer?.optString("title")?.takeIf { it.isNotBlank() }
        if (title != null) {
            txtSpecialLabel.text = "TODAY'S SPECIAL"
            txtOfferTitle.text   = title
            txtOfferDesc.text    = offer.optString("description", "")
            txtOfferDesc.visibility = if (txtOfferDesc.text.isNullOrBlank()) View.GONE else View.VISIBLE
        } else {
            // Fallback when no active offer — the QR section still does
            // the heavy lift of getting them to install the app.
            txtSpecialLabel.text = ""
            txtOfferTitle.text   = "Download Dander for loyalty points"
            txtOfferDesc.text    = ""
            txtOfferDesc.visibility = View.GONE
        }
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

            val name     = json.optString("business_name", "")
            val visitors = json.optInt("visitor_count_today", 0)
            val offer    = json.optJSONObject("todays_offer")
            ui.post {
                txtBusiness.text = name
                txtVisitors.text = "Today: $visitors visitors"
                applyOfferOrFallback(offer)
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
