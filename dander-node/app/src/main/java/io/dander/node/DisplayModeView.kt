package io.dander.node

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.util.AttributeSet
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import pl.droidsonroids.gif.GifDrawable
import pl.droidsonroids.gif.GifImageView
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * DisplayModeView — full-screen overlay that takes over the kiosk for
 * `display_duration` ms whenever the proximity endpoint enqueues a
 * loyalty greeting for this device.
 *
 * Layout (top → bottom):
 *   - GIF image filling most of the frame
 *   - Customer name (large, white, bottom third)
 *   - Greeting message + points + visit number (smaller, below name)
 *
 * Auto-dismisses by setting itself GONE; MainActivity holds the
 * reference but doesn't have to manage the timer.
 *
 * GIF fetching is best-effort:
 *   - HttpURLConnection on a single-thread executor (no Glide/Coil dep)
 *   - On any failure (no URL, no net, malformed body) we still show the
 *     text so the customer never sees a blank stuck overlay
 */
class DisplayModeView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {

    private val ui = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()

    private val gifView: GifImageView
    private val nameView: TextView
    private val messageView: TextView
    private val metaView: TextView

    private var dismissRunnable: Runnable? = null

    init {
        setBackgroundColor(Color.parseColor("#FF0A0A0F"))

        gifView = GifImageView(context).apply {
            scaleType = android.widget.ImageView.ScaleType.CENTER_CROP
        }
        addView(gifView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

        // Bottom-third text stack — overlay on the GIF.
        val textStack = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(48, 0, 48, 64)
            // Slightly translucent black scrim so text reads against any GIF.
            setBackgroundColor(Color.parseColor("#99000000"))
        }
        val stackParams = LayoutParams(
            LayoutParams.MATCH_PARENT,
            LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM,
        )
        addView(textStack, stackParams)

        nameView = TextView(context).apply {
            textSize = 36f
            setTextColor(Color.WHITE)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            gravity = Gravity.CENTER_HORIZONTAL
        }
        messageView = TextView(context).apply {
            textSize = 18f
            setTextColor(Color.parseColor("#E0E0E0"))
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, 12, 0, 0)
        }
        metaView = TextView(context).apply {
            textSize = 14f
            setTextColor(Color.parseColor("#9FA8DA"))
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, 12, 0, 0)
            typeface = Typeface.MONOSPACE
        }
        textStack.addView(nameView)
        textStack.addView(messageView)
        textStack.addView(metaView)

        visibility = View.GONE
    }

    /**
     * Show a loyalty greeting. Returns immediately; auto-dismisses after
     * `display_duration` ms (default 8 s) on the UI thread.
     */
    fun show(cmd: JSONObject) {
        val name = cmd.optString("customer_name", "friend")
        val message = cmd.optString("message", "Welcome!")
        val pts  = cmd.optInt("points_awarded", 0)
        val visit = cmd.optInt("visit_number", 0)
        val durationMs = cmd.optLong("display_duration", 8_000L).coerceIn(2_000L, 30_000L)
        val gifUrl = cmd.optString("gif_url", "").ifBlank { null }

        nameView.text = name
        messageView.text = message
        // metaView reads as "+0 points" for a milestone celebration which
        // looks like a bug — suppress when there's no real loyalty data.
        metaView.text = when {
            visit > 0 -> "+%d points · visit #%d".format(pts, visit)
            pts  > 0 -> "+%d points".format(pts)
            else      -> ""
        }
        metaView.visibility = if (metaView.text.isNullOrEmpty()) View.GONE else View.VISIBLE

        // Clear any previous animation, fall back to a flat colour if no GIF.
        gifView.setImageDrawable(null)
        gifView.setBackgroundColor(Color.parseColor("#FF1A1A22"))

        if (gifUrl != null) loadGifAsync(gifUrl)

        visibility = View.VISIBLE
        bringToFront()

        dismissRunnable?.let { ui.removeCallbacks(it) }
        dismissRunnable = Runnable { dismiss() }
        ui.postDelayed(dismissRunnable!!, durationMs)
    }

    fun dismiss() {
        visibility = View.GONE
        val d = gifView.drawable
        if (d is GifDrawable) d.stop()
        gifView.setImageDrawable(null)
    }

    private fun loadGifAsync(url: String) {
        io.execute {
            val bytes = try { fetch(url) } catch (_: Exception) { null }
            if (bytes != null) {
                ui.post {
                    try {
                        gifView.setImageDrawable(GifDrawable(bytes))
                    } catch (_: Exception) {
                        // Not a GIF (Giphy occasionally returns a JPG fallback) —
                        // leave the flat-colour background; text still reads fine.
                    }
                }
            }
        }
    }

    private fun fetch(url: String): ByteArray? {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 4_000
                readTimeout = 6_000
                requestMethod = "GET"
                instanceFollowRedirects = true
            }
            if (conn.responseCode !in 200..299) return null
            // Cap the download — a runaway 100MB GIF would OOM a budget phone.
            val MAX = 6 * 1024 * 1024
            val out = ByteArray(MAX)
            var read = 0
            conn.inputStream.use { input ->
                while (true) {
                    val n = input.read(out, read, out.size - read)
                    if (n <= 0) break
                    read += n
                    if (read >= MAX) break
                }
            }
            out.copyOf(read)
        } catch (_: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }
}
