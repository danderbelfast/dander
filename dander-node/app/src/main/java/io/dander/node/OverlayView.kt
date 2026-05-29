package io.dander.node

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View

/**
 * OverlayView — draws the horizontal counting line and the person bounding
 * boxes on top of the camera preview.
 *
 * Detections arrive as normalised (0..1) upright rects from PeopleAnalyzer,
 * so we just scale by this view's width/height — no rotation maths here.
 */
class OverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyle: Int = 0,
) : View(context, attrs, defStyle) {

    private var detections: List<PeopleAnalyzer.Detection> = emptyList()

    private val boxPaint = Paint().apply {
        color = Color.parseColor("#00E5FF")
        style = Paint.Style.STROKE
        strokeWidth = 4f
        isAntiAlias = true
    }
    private val linePaint = Paint().apply {
        color = Color.parseColor("#FFEB3B")
        style = Paint.Style.STROKE
        strokeWidth = 5f
        isAntiAlias = true
    }
    private val idPaint = Paint().apply {
        color = Color.parseColor("#00E5FF")
        textSize = 28f
        isAntiAlias = true
    }

    fun setDetections(dets: List<PeopleAnalyzer.Detection>) {
        detections = dets
        postInvalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()

        // Counting line across the middle of the frame.
        val midY = h * 0.5f
        canvas.drawLine(0f, midY, w, midY, linePaint)

        for (d in detections) {
            val l = d.box.left * w
            val t = d.box.top * h
            val r = d.box.right * w
            val b = d.box.bottom * h
            canvas.drawRect(l, t, r, b, boxPaint)
            canvas.drawText("#${d.id}", l + 4f, t + 28f, idPaint)
        }
    }
}
