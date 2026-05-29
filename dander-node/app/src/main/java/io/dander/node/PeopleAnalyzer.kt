package io.dander.node

import android.annotation.SuppressLint
import android.graphics.Rect
import android.graphics.RectF
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.objects.ObjectDetection
import com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions

/**
 * PeopleAnalyzer — on-device people counting via ML Kit object detection
 * with tracking IDs, plus horizontal line-crossing logic.
 *
 * PoC NOTE on the model: ML Kit's base object detector tracks prominent
 * moving objects (giving each a stable trackingId) but is NOT a dedicated
 * person detector. For a wall/doorway PoC that's usually "good enough" —
 * the only moving things over a threshold are people. For production,
 * swap in a person-specific TFLite model via the custom-model object
 * detector; the crossing logic below is unchanged.
 *
 * Coordinates: ML Kit boxes come back in the unrotated camera-buffer
 * space. We transform them into an upright, normalised (0..1) space so the
 * crossing test and the overlay are both rotation-independent. The counting
 * line is the horizontal midline (normalised y = 0.5).
 *
 *   crossing midline upward (y: >0.5 -> <=0.5)  = bottom-to-top = IN
 *   crossing midline downward (y: <0.5 -> >=0.5) = top-to-bottom = OUT
 *
 * If IN/OUT come out reversed on the real mount, flip INVERT_DIRECTION.
 * Nothing is ever stored or transmitted from the frames — only the counts.
 */
class PeopleAnalyzer(
    private val onResult: (inCount: Int, outCount: Int, detections: List<Detection>) -> Unit,
) : ImageAnalysis.Analyzer {

    data class Detection(val id: Int, val box: RectF) // box is normalised 0..1, upright

    private companion object {
        const val INVERT_DIRECTION = false
        const val LINE = 0.5f
    }

    private val detector = ObjectDetection.getClient(
        ObjectDetectorOptions.Builder()
            .setDetectorMode(ObjectDetectorOptions.STREAM_MODE) // gives tracking IDs
            .enableMultipleObjects()
            .build()
    )

    // Cumulative since app start (drives the on-screen running totals).
    @Volatile private var inCount = 0
    @Volatile private var outCount = 0
    // High-water marks of what's already been uploaded, so each 60s POST
    // carries only the delta for that window (the backend sums windows).
    private var uploadedIn = 0
    private var uploadedOut = 0

    // trackingId -> last normalised centre-Y, so we can detect a crossing.
    private val lastY = HashMap<Int, Float>()

    @SuppressLint("UnsafeOptInUsageError")
    override fun analyze(imageProxy: ImageProxy) {
        val media = imageProxy.image
        if (media == null) { imageProxy.close(); return }

        val rotation = imageProxy.imageInfo.rotationDegrees
        val input = InputImage.fromMediaImage(media, rotation)
        val bw = media.width
        val bh = media.height

        detector.process(input)
            .addOnSuccessListener { objects ->
                val dets = ArrayList<Detection>(objects.size)
                for (obj in objects) {
                    val id = obj.trackingId ?: continue
                    val norm = toUprightNorm(obj.boundingBox, bw, bh, rotation)
                    dets.add(Detection(id, norm))

                    val cy = (norm.top + norm.bottom) / 2f
                    val prev = lastY[id]
                    if (prev != null) {
                        if (prev > LINE && cy <= LINE)      bump(up = true)
                        else if (prev < LINE && cy >= LINE) bump(up = false)
                    }
                    lastY[id] = cy
                }
                // Forget IDs we no longer see so the map can't grow unbounded.
                if (lastY.size > 256) {
                    val live = dets.map { it.id }.toHashSet()
                    lastY.keys.retainAll(live)
                }
                onResult(inCount, outCount, dets)
            }
            .addOnFailureListener { /* drop this frame; never crash */ }
            .addOnCompleteListener { imageProxy.close() }
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

    /**
     * Map a buffer-space box to an upright, normalised (0..1) RectF given the
     * rotation ML Kit applied to make the image upright.
     */
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
