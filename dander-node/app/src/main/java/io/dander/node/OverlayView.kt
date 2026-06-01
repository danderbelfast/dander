package io.dander.node

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

    @Volatile private var detections: List<RectF> = emptyList()

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

    fun setDetections(norms: List<RectF>) {
        detections = norms
        postInvalidateOnAnimation()
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0 || h <= 0) return

        for (n in detections) {
            canvas.drawRect(n.left * w, n.top * h, n.right * w, n.bottom * h, boxPaint)
        }
        val midY = h * LINE
        canvas.drawLine(0f, midY, w, midY, linePaint)
    }
}
