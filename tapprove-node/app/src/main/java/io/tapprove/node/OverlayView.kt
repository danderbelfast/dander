package io.tapprove.node

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View

/**
 * OverlayView — draws the counting line and the latest detection
 * bounding boxes on top of the live camera preview.
 *
 * Used while privacy compositing is disabled for hardware testing.
 * When the greyscale composite path comes back, this view goes away
 * and the analyzer renders both the frame and the boxes itself.
 *
 * Detections arrive as normalised (0..1) rectangles in upright
 * screen coordinates — same shape PeopleAnalyzer used to feed its
 * own composite canvas. This view scales them to its current size.
 */
class OverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    private companion object {
        const val LINE   = 0.5f
        const val ORANGE = 0xFFE85D26.toInt()
    }

    enum class LineDirection { HORIZONTAL, VERTICAL, NONE }

    @Volatile private var detections: List<RectF> = emptyList()
    @Volatile private var faces:      List<RectF> = emptyList()
    @Volatile private var lineDirection: LineDirection = LineDirection.HORIZONTAL

    private val boxPaint = Paint().apply {
        color = ORANGE
        style = Paint.Style.STROKE
        strokeWidth = 4f
        isAntiAlias = true
    }
    private val linePaint = Paint().apply {
        color = Color.WHITE
        strokeWidth = 4f
        isAntiAlias = true
    }
    // Face privacy mask: solid black fill + a small orange dot in the
    // centre so the mask reads as an intentional Dander brand mark
    // rather than a rendering glitch.
    private val faceMaskPaint = Paint().apply {
        color = Color.BLACK
        style = Paint.Style.FILL
    }
    private val faceMarkPaint = Paint().apply {
        color = ORANGE
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    fun setDetections(norms: List<RectF>) {
        detections = norms
        postInvalidateOnAnimation()
    }

    fun setFaces(norms: List<RectF>) {
        faces = norms
        postInvalidateOnAnimation()
    }

    fun setLineDirection(dir: LineDirection) {
        if (dir == lineDirection) return
        lineDirection = dir
        postInvalidateOnAnimation()
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0 || h <= 0) return

        // Person bounding boxes — orange outline.
        for (n in detections) {
            canvas.drawRect(n.left * w, n.top * h, n.right * w, n.bottom * h, boxPaint)
        }

        // Counting line — horizontal (overhead / landscape), vertical
        // (walk-past / portrait) or none (approach mode — no line needed).
        when (lineDirection) {
            LineDirection.HORIZONTAL -> {
                val midY = h * LINE
                canvas.drawLine(0f, midY, w, midY, linePaint)
            }
            LineDirection.VERTICAL -> {
                val midX = w * LINE
                canvas.drawLine(midX, 0f, midX, h, linePaint)
            }
            LineDirection.NONE -> { /* approach mode — no line */ }
        }

        // Face masks drawn LAST so they sit on top of person boxes /
        // counting line if they overlap. Each is a black filled rect
        // (covers the face entirely) plus a small orange disc dead-centre.
        for (f in faces) {
            val left   = f.left   * w
            val top    = f.top    * h
            val right  = f.right  * w
            val bottom = f.bottom * h
            canvas.drawRect(left, top, right, bottom, faceMaskPaint)

            val cx = (left + right)  / 2f
            val cy = (top  + bottom) / 2f
            val radius = minOf(right - left, bottom - top) * 0.18f
            canvas.drawCircle(cx, cy, radius, faceMarkPaint)
        }
    }
}
