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
 * PeopleAnalyzer — on-device people counting (ML Kit object detection +
 * tracking IDs + line crossing).
 *
 * NOTE: privacy compositing (greyscale frame + orange rectangle fill)
 * is currently disabled for hardware accuracy testing. The analyzer
 * emits the raw detection rectangles via `onDetections`; the UI uses
 * a plain camera PreviewView with an OverlayView on top. Re-enable
 * the composite path by reintroducing the displayCallback and the
 * compositeAndPublish() function (see git history for this commit).
 *
 * Power optimisation:
 *   - ML Kit runs on every Nth incoming frame only (`frameInterval`).
 *   - On the in-between frames we replay the cached detection
 *     rectangles so the overlay tracks smoothly while the GPU/CPU
 *     cost of inference is amortised.
 */
class PeopleAnalyzer(
    private val onResult: (inCount: Int, outCount: Int) -> Unit,
    private val onDetections: (List<RectF>) -> Unit,
) : ImageAnalysis.Analyzer {

    private companion object {
        const val INVERT_DIRECTION = false
        const val LINE = 0.5f

        // A tracking ID that hasn't been seen for this long is considered to
        // have left the frame; its dwell is finalised at that point.
        const val STALE_MS = 2_000L
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

    // Dwell tracking: epoch-ms timestamps per tracking ID. Lifetime here is
    // first detected -> first sustained gap of STALE_MS.
    private val firstSeen = HashMap<Int, Long>()
    private val lastSeen  = HashMap<Int, Long>()

    // Per-upload-window dwell accumulators. Reset by drainDwell().
    @Volatile private var dwellCount     = 0
    @Volatile private var dwellSumMs     = 0L
    @Volatile private var dwellMaxMs     = 0L
    @Volatile private var dwellU30       = 0
    @Volatile private var dwell30To120   = 0
    @Volatile private var dwell120To300  = 0
    @Volatile private var dwellOver300   = 0

    private var frameTick = 0L

    @SuppressLint("UnsafeOptInUsageError")
    override fun analyze(imageProxy: ImageProxy) {
        val media = imageProxy.image
        if (media == null) { imageProxy.close(); return }

        val rotation = imageProxy.imageInfo.rotationDegrees
        val bw = media.width
        val bh = media.height

        frameTick++
        val runDetection = (frameInterval <= 1) || (frameTick % frameInterval == 0L)

        if (!runDetection) {
            // Replay cached detections so the overlay tracks at full frame
            // rate even though ML only runs every Nth frame.
            onDetections(cachedDetections)
            imageProxy.close()
            return
        }

        val input = InputImage.fromMediaImage(media, rotation)
        detector.process(input)
            .addOnSuccessListener { objects ->
                val now = System.currentTimeMillis()
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

                    if (id !in firstSeen) firstSeen[id] = now
                    lastSeen[id] = now
                }

                // Finalise any tracking ID we haven't seen for STALE_MS — that
                // person left the frame; record their dwell.
                val toFinalise = ArrayList<Int>()
                for ((id, ts) in lastSeen) {
                    if (now - ts > STALE_MS) toFinalise.add(id)
                }
                for (id in toFinalise) {
                    val started = firstSeen[id]
                    val ended   = lastSeen[id]
                    if (started != null && ended != null) recordDwell(ended - started)
                    firstSeen.remove(id); lastSeen.remove(id); lastY.remove(id)
                }

                cachedDetections = norms
                onResult(inCount, outCount)
                onDetections(norms)
            }
            .addOnFailureListener { /* drop this frame's ML; overlay reuses cache */ }
            .addOnCompleteListener {
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

    /** Result of one window of dwell tracking. Seconds are rounded floats. */
    data class DwellWindow(
        val avgSeconds: Double,
        val maxSeconds: Double,
        val under30: Int,
        val from30To120: Int,
        val from120To300: Int,
        val over300: Int,
    )

    /** Drain accumulated dwell stats since the last call. Resets every counter. */
    @Synchronized
    fun drainDwell(): DwellWindow {
        val avg = if (dwellCount > 0) (dwellSumMs.toDouble() / dwellCount) / 1000.0 else 0.0
        val max = dwellMaxMs / 1000.0
        val out = DwellWindow(avg, max, dwellU30, dwell30To120, dwell120To300, dwellOver300)
        dwellCount = 0
        dwellSumMs = 0L
        dwellMaxMs = 0L
        dwellU30 = 0
        dwell30To120 = 0
        dwell120To300 = 0
        dwellOver300 = 0
        return out
    }

    @Synchronized
    private fun recordDwell(dwellMs: Long) {
        if (dwellMs <= 0) return
        dwellCount += 1
        dwellSumMs += dwellMs
        if (dwellMs > dwellMaxMs) dwellMaxMs = dwellMs
        val secs = dwellMs / 1000.0
        when {
            secs < 30  -> dwellU30 += 1
            secs < 120 -> dwell30To120 += 1
            secs < 300 -> dwell120To300 += 1
            else       -> dwellOver300 += 1
        }
    }

    /**
     * Forget every in-progress tracking ID. Called by MainActivity when the
     * camera unbinds (e.g. crossing into closed hours) so a person mid-frame
     * doesn't get "finalised" with an absurd overnight dwell the next time
     * the camera resumes.
     */
    @Synchronized
    fun clearTracking() {
        firstSeen.clear()
        lastSeen.clear()
        lastY.clear()
        cachedDetections = emptyList()
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
