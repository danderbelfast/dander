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
 * tracking IDs + line crossing) AND a privacy-preserving display
 * compositor. Counting logic is unchanged from earlier; what's new is
 * `displayCallback` which receives a per-frame Bitmap composed of:
 *
 *   - a greyscale render of the camera frame, upright (background)
 *   - solid Dander-orange rectangles where people are detected
 *   - a white horizontal counting line across the midpoint
 *
 * Why rectangles, not silhouette segmentation: subject/selfie
 * segmentation is the "ideal" path for this view, but it doubles the
 * per-frame ML cost and the result is hard to validate without a real
 * device. The spec lists "fill bounding box with orange rectangle" as
 * the explicit fallback when segmentation is too slow — this is that
 * fallback. The path to real silhouettes is to (a) add the segmenter
 * dependency, (b) run it in parallel with the object detector, (c) draw
 * the mask as orange instead of/in addition to the rectangles below.
 *
 * Nothing is stored or transmitted — the composited bitmap is rendered
 * straight to an on-screen ImageView and dropped on the next frame.
 */
class PeopleAnalyzer(
    private val onResult: (inCount: Int, outCount: Int) -> Unit,
    private val displayCallback: (Bitmap) -> Unit,
) : ImageAnalysis.Analyzer {

    private companion object {
        const val INVERT_DIRECTION = false
        const val LINE = 0.5f
        const val ORANGE = 0xFFE85D26.toInt()        // Dander brand
    }

    private val detector = ObjectDetection.getClient(
        ObjectDetectorOptions.Builder()
            .setDetectorMode(ObjectDetectorOptions.STREAM_MODE)
            .enableMultipleObjects()
            .build()
    )

    // Cumulative since app start (drives the on-screen running totals).
    @Volatile private var inCount = 0
    @Volatile private var outCount = 0
    // What's already been uploaded, so each 60s POST is per-window delta.
    private var uploadedIn = 0
    private var uploadedOut = 0

    private val lastY = HashMap<Int, Float>()

    // Paints reused across frames to keep allocation flat.
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
        val input = InputImage.fromMediaImage(media, rotation)
        val bw = media.width
        val bh = media.height

        // ImageProxy.toBitmap() was added in CameraX 1.3 and returns an
        // ARGB_8888 bitmap in the original (buffer) orientation.
        val srcBitmap: Bitmap = try {
            imageProxy.toBitmap()
        } catch (e: Throwable) {
            imageProxy.close(); return
        }

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

                onResult(inCount, outCount)
                runCatching { compositeAndPublish(srcBitmap, rotation, norms) }
                    .onFailure { /* drop frame, never crash */ }
            }
            .addOnFailureListener { /* drop this frame */ }
            .addOnCompleteListener {
                srcBitmap.recycle()
                imageProxy.close()
            }
    }

    private fun bump(up: Boolean) {
        val isIn = if (INVERT_DIRECTION) !up else up
        if (isIn) inCount++ else outCount++
    }

    /** IN/OUT crossings since the previous call — used for the 60s upload window. */
    @Synchronized
    fun drainCounts(): Pair<Int, Int> {
        val dIn = inCount - uploadedIn
        val dOut = outCount - uploadedOut
        uploadedIn = inCount
        uploadedOut = outCount
        return Pair(dIn, dOut)
    }

    // ------------------------------------------------------------------
    // Display compositing
    // ------------------------------------------------------------------

    /**
     * Build the privacy frame: rotate src to upright, draw it greyscale,
     * fill each detection's normalised rect with Dander orange, draw the
     * white counting line. Push to the display callback.
     */
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
