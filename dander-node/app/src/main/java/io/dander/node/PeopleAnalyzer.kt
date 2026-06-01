package io.dander.node

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.objects.ObjectDetection
import com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions

/**
 * PeopleAnalyzer — on-device people counting (ML Kit object detection +
 * tracking IDs + line crossing) and a privacy-preserving display
 * compositor.
 *
 * Power optimisation:
 *   - ML Kit runs on every Nth incoming frame only (`frameInterval`).
 *   - The display gets composited every frame: cached detection
 *     rectangles from the most recent ML pass are reused on the
 *     in-between frames so the picture stays smooth at full camera rate
 *     while the GPU/CPU cost of inference is amortised.
 */
class PeopleAnalyzer(
    private val onResult: (inCount: Int, outCount: Int) -> Unit,
    private val displayCallback: (Bitmap) -> Unit,
) : ImageAnalysis.Analyzer {

    private companion object {
        const val INVERT_DIRECTION = false
        const val LINE = 0.5f
        const val ORANGE = 0xFFE85D26.toInt()
    }

    @Volatile var frameInterval: Int = 5    // every Nth frame; settable from Settings.

    private val detector = ObjectDetection.getClient(
        ObjectDetectorOptions.Builder()
            .setDetectorMode(ObjectDetectorOptions.STREAM_MODE)
            .enableMultipleObjects()
            .build()
    )

    @Volatile private var inCount = 0
    @Volatile private var outCount = 0
    private var uploadedIn = 0
    private var uploadedOut = 0

    private val lastY = HashMap<Int, Float>()
    @Volatile private var cachedDetections: List<RectF> = emptyList()

    private var frameTick = 0L

    private val greyPaint = Paint().apply {
        colorFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(0f) })
        isFilterBitmap = true
    }
    private val orangePaint = Paint().apply { color = ORANGE; isAntiAlias = true }
    private val linePaint = Paint().apply {
        color = Color.WHITE
        strokeWidth = 4f
        isAntiAlias = true
    }

    @SuppressLint("UnsafeOptInUsageError")
    override fun analyze(imageProxy: ImageProxy) {
        val media = imageProxy.image
        if (media == null) { imageProxy.close(); return }

        val rotation = imageProxy.imageInfo.rotationDegrees
        val bw = media.width
        val bh = media.height
        val srcBitmap: Bitmap = try {
            imageProxy.toBitmap()
        } catch (e: Throwable) {
            imageProxy.close(); return
        }

        frameTick++
        val runDetection = (frameInterval <= 1) || (frameTick % frameInterval == 0L)

        if (!runDetection) {
            runCatching { compositeAndPublish(srcBitmap, rotation, cachedDetections) }
            srcBitmap.recycle()
            imageProxy.close()
            return
        }

        val input = InputImage.fromMediaImage(media, rotation)
        detector.process(input)
            .addOnSuccessListener { objects ->
                val norms = ArrayList<RectF>(objects.size)
                for (obj in objects) {
                    val id = obj.trackingId ?: continue
                    val norm = toUprightNorm(obj.boundingBox, bw, bh, rotation)
                    norms.add(norm)

                    val cy = (norm.top + norm.bottom) / 2f
                    val prev = lastY[id]
                    if (prev != null) {
                        if (prev > LINE && cy <= LINE)      bump(up = true)
                        else if (prev < LINE && cy >= LINE) bump(up = false)
                    }
                    lastY[id] = cy
                }
                if (lastY.size > 256) lastY.keys.retainAll(objects.mapNotNull { it.trackingId }.toHashSet())

                cachedDetections = norms
                onResult(inCount, outCount)
                runCatching { compositeAndPublish(srcBitmap, rotation, norms) }
                    .onFailure { /* drop frame */ }
            }
            .addOnFailureListener { /* drop this frame's ML; display still draws below */ }
            .addOnCompleteListener {
                srcBitmap.recycle()
                imageProxy.close()
            }
    }

    private fun bump(up: Boolean) {
        val isIn = if (INVERT_DIRECTION) !up else up
        if (isIn) inCount++ else outCount++
    }

    @Synchronized
    fun drainCounts(): Pair<Int, Int> {
        val dIn = inCount - uploadedIn
        val dOut = outCount - uploadedOut
        uploadedIn = inCount
        uploadedOut = outCount
        return Pair(dIn, dOut)
    }

    private fun compositeAndPublish(srcBuffer: Bitmap, rotation: Int, norms: List<RectF>) {
        val uprightSrc = if (rotation == 0) {
            srcBuffer
        } else {
            val m = Matrix().apply { postRotate(rotation.toFloat()) }
            Bitmap.createBitmap(srcBuffer, 0, 0, srcBuffer.width, srcBuffer.height, m, true)
        }

        val uw = uprightSrc.width
        val uh = uprightSrc.height

        val display = Bitmap.createBitmap(uw, uh, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(display)
        canvas.drawBitmap(uprightSrc, 0f, 0f, greyPaint)

        for (norm in norms) {
            canvas.drawRect(
                norm.left * uw, norm.top * uh,
                norm.right * uw, norm.bottom * uh,
                orangePaint,
            )
        }

        val midY = uh * LINE
        canvas.drawLine(0f, midY, uw.toFloat(), midY, linePaint)

        if (uprightSrc !== srcBuffer) uprightSrc.recycle()
        displayCallback(display)
    }

    private fun toUprightNorm(box: Rect, bw: Int, bh: Int, rot: Int): RectF {
        fun mapPoint(x: Float, y: Float): Pair<Float, Float> = when (rot) {
            90  -> Pair(bh - y, x)
            180 -> Pair(bw - x, bh - y)
            270 -> Pair(y, bw - x)
            else -> Pair(x, y)
        }
        val uw = if (rot == 90 || rot == 270) bh.toFloat() else bw.toFloat()
        val uh = if (rot == 90 || rot == 270) bw.toFloat() else bh.toFloat()

        val (x1, y1) = mapPoint(box.left.toFloat(), box.top.toFloat())
        val (x2, y2) = mapPoint(box.right.toFloat(), box.bottom.toFloat())

        return RectF(
            (minOf(x1, x2) / uw).coerceIn(0f, 1f),
            (minOf(y1, y2) / uh).coerceIn(0f, 1f),
            (maxOf(x1, x2) / uw).coerceIn(0f, 1f),
            (maxOf(y1, y2) / uh).coerceIn(0f, 1f),
        )
    }
}
