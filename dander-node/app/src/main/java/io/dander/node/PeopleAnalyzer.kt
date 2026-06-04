package io.dander.node

import android.annotation.SuppressLint
import android.graphics.Rect
import android.graphics.RectF
import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.objects.ObjectDetection
import com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions
import java.util.concurrent.atomic.AtomicInteger

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
    private val onFaces: (List<RectF>) -> Unit = {},
) : ImageAnalysis.Analyzer {

    enum class CountingMode { HORIZONTAL_LINE, VERTICAL_LINE, APPROACH }

    private companion object {
        const val LINE = 0.5f

        // A tracking ID that hasn't been seen for this long is considered to
        // have left the frame; its dwell is finalised at that point.
        const val STALE_MS = 2_000L

        // Face-detection cadence (display-only privacy masking). Independent
        // of `frameInterval`, which throttles the heavier object detector.
        // Faces re-detect every Nth analyse() so masks stay in place even
        // when the user has set a sparse person-detection interval.
        const val FACE_FRAME_INTERVAL = 3L

        // Approach mode: keep this many area samples per tracking ID and
        // only commit IN/OUT once we have at least the floor below.
        const val APPROACH_HISTORY = 5
        const val APPROACH_MIN_SAMPLES = 3
    }

    @Volatile var frameInterval: Int = 5    // every Nth frame; settable from Settings.

    // Live tunables — MainActivity rewrites these from Prefs in onResume and
    // whenever the operator toggles orientation / invert via the on-screen
    // buttons. Don't read prefs directly here: keeps the analyzer pure.
    @Volatile var countingMode: CountingMode = CountingMode.HORIZONTAL_LINE
    @Volatile var invertDirection: Boolean = false
    // Front-camera installs see the world mirrored on the X axis. When true
    // we flip every detection rectangle horizontally before any downstream
    // consumer (line crossing, area trend, overlay) touches it — so the
    // "left-to-right = IN" intuition the operator set with the rear lens
    // continues to mean the same physical direction after switching lenses.
    @Volatile var mirrorX: Boolean = false

    private val detector = ObjectDetection.getClient(
        ObjectDetectorOptions.Builder()
            .setDetectorMode(ObjectDetectorOptions.STREAM_MODE)
            .enableMultipleObjects()
            .build()
    )

    // FAST_MODE only — no landmarks, classifications, or contours. We
    // only need bounding boxes to drop a privacy mask over each face;
    // anything richer would be wasted CPU and would scope-creep this
    // into something that could feel like surveillance.
    private val faceDetector = FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .build()
    )

    @Volatile private var inCount = 0
    @Volatile private var outCount = 0
    private var uploadedIn = 0
    private var uploadedOut = 0

    // Per-ID state for the three counting strategies:
    //   lastY     — centre-Y of last seen frame (HORIZONTAL_LINE)
    //   lastX     — centre-X of last seen frame (VERTICAL_LINE)
    //   areaHist  — recent bbox areas (APPROACH); drained on finalisation
    private val lastY = HashMap<Int, Float>()
    private val lastX = HashMap<Int, Float>()
    private val areaHist = HashMap<Int, ArrayDeque<Float>>()
    @Volatile private var cachedDetections: List<RectF> = emptyList()
    // Cached face boxes for in-between frames. Display-only — never read
    // by counting logic, never stored, never uploaded.
    @Volatile private var cachedFaces: List<RectF> = emptyList()

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
    // Wall-clock timestamp of the most recent analyze() entry. Surfaced
    // so MainActivity's operator-panel "Camera: active/inactive" chip
    // can show staleness if the ImageAnalysis pipeline dies silently
    // (this is the regression mode that prompted the hidden-PreviewView
    // fix — counting "looked bound" but no frames were flowing).
    @Volatile private var lastFrameMs: Long = 0L
    fun lastFrameMs(): Long = lastFrameMs

    @SuppressLint("UnsafeOptInUsageError")
    override fun analyze(imageProxy: ImageProxy) {
        Log.v("DanderAnalyzer", "Frame received: ${imageProxy.width}x${imageProxy.height}")
        // Stamp before anything can short-circuit — even frames we drop
        // (no media image, throttled, etc.) prove the pipeline is alive.
        lastFrameMs = System.currentTimeMillis()
        val media = imageProxy.image
        if (media == null) { imageProxy.close(); return }

        val rotation = imageProxy.imageInfo.rotationDegrees
        val bw = media.width
        val bh = media.height

        frameTick++
        val runPerson = (frameInterval <= 1) || (frameTick % frameInterval == 0L)
        val runFace   = (frameTick % FACE_FRAME_INTERVAL == 0L)

        // Hot path: no detectors fire this frame — replay both caches.
        if (!runPerson && !runFace) {
            onDetections(cachedDetections)
            onFaces(cachedFaces)
            imageProxy.close()
            return
        }

        // We have to keep `imageProxy` open until every detector consuming
        // its backing media image has finished — closing earlier would
        // invalidate the InputImage they're holding. Track pending
        // completions and close once they've all signalled done.
        val pending = AtomicInteger((if (runPerson) 1 else 0) + (if (runFace) 1 else 0))
        val onAnyComplete = { if (pending.decrementAndGet() == 0) imageProxy.close() }

        // If fromMediaImage throws (rare — corrupt frame), close immediately
        // and bail. Without this guard the imageProxy would leak and back-
        // pressure would freeze the whole analysis pipeline after one frame.
        val input = try {
            InputImage.fromMediaImage(media, rotation)
        } catch (e: Exception) {
            Log.e("DanderML", "Detection failed: ${e.message}")
            imageProxy.close()
            return
        }

        if (runPerson) {
            try {
                detector.process(input)
                    .addOnSuccessListener { objects ->
                        Log.d("DanderML", "Detection complete: ${objects.size} persons found")
                        val now = System.currentTimeMillis()
                    val norms = ArrayList<RectF>(objects.size)
                    val mode = countingMode
                    val mirror = mirrorX
                    for (obj in objects) {
                        val id = obj.trackingId ?: continue
                        val raw = toUprightNorm(obj.boundingBox, bw, bh, rotation)
                        val norm = if (mirror) mirrorHoriz(raw) else raw
                        norms.add(norm)

                        val cy = (norm.top + norm.bottom) / 2f
                        val cx = (norm.left + norm.right) / 2f
                        val area = (norm.right - norm.left) * (norm.bottom - norm.top)

                        when (mode) {
                            CountingMode.HORIZONTAL_LINE -> {
                                // Top of frame = "out of the store"; crossing the
                                // midline downwards = entering. up==true means IN.
                                val prev = lastY[id]
                                if (prev != null) {
                                    if (prev > LINE && cy <= LINE)      bump(up = true)
                                    else if (prev < LINE && cy >= LINE) bump(up = false)
                                }
                                lastY[id] = cy
                            }
                            CountingMode.VERTICAL_LINE -> {
                                // Walk-past row of tills. Left-to-right == IN.
                                // up==true is reused to mean IN so bump()/invert work uniformly.
                                val prev = lastX[id]
                                if (prev != null) {
                                    if (prev < LINE && cx >= LINE)      bump(up = true)
                                    else if (prev > LINE && cx <= LINE) bump(up = false)
                                }
                                lastX[id] = cx
                            }
                            CountingMode.APPROACH -> {
                                // Approach detection: just record the area sample
                                // here. The IN/OUT decision happens at STALE_MS
                                // finalisation, using the trend across history.
                                val q = areaHist.getOrPut(id) { ArrayDeque(APPROACH_HISTORY) }
                                q.addLast(area)
                                while (q.size > APPROACH_HISTORY) q.removeFirst()
                            }
                        }

                        if (id !in firstSeen) firstSeen[id] = now
                        lastSeen[id] = now
                    }

                    // Finalise any tracking ID we haven't seen for STALE_MS — that
                    // person left the frame; record their dwell. In APPROACH mode
                    // this is also where we commit IN/OUT based on area trend.
                    val toFinalise = ArrayList<Int>()
                    for ((id, ts) in lastSeen) {
                        if (now - ts > STALE_MS) toFinalise.add(id)
                    }
                    for (id in toFinalise) {
                        val started = firstSeen[id]
                        val ended   = lastSeen[id]
                        if (started != null && ended != null) recordDwell(ended - started)

                        if (mode == CountingMode.APPROACH) {
                            val q = areaHist[id]
                            if (q != null && q.size >= APPROACH_MIN_SAMPLES) {
                                val list = q.toList()
                                // "first 2" = oldest samples; "last 3" = newest.
                                val first2 = list.take(2).average()
                                val last3  = list.takeLast(3).average()
                                val trend  = last3 - first2
                                if (trend > 0) bump(up = true)
                                else if (trend < 0) bump(up = false)
                            }
                        }

                        firstSeen.remove(id); lastSeen.remove(id)
                        lastY.remove(id); lastX.remove(id); areaHist.remove(id)
                    }

                    cachedDetections = norms
                    onResult(inCount, outCount)
                    onDetections(norms)
                }
                .addOnFailureListener { e ->
                    Log.e("DanderML", "Detection failed: ${e.message}")
                }
                .addOnCompleteListener { onAnyComplete() }
            } catch (e: Exception) {
                Log.e("DanderML", "Detection failed: ${e.message}")
                onAnyComplete()
            }
        } else {
            onDetections(cachedDetections)
        }

        if (runFace) {
            try {
                faceDetector.process(input)
                .addOnSuccessListener { faces ->
                    val mirror = mirrorX
                    val faceNorms = ArrayList<RectF>(faces.size)
                    for (face in faces) {
                        val raw = toUprightNorm(face.boundingBox, bw, bh, rotation)
                        faceNorms.add(if (mirror) mirrorHoriz(raw) else raw)
                    }
                    cachedFaces = faceNorms
                    onFaces(faceNorms)
                }
                .addOnFailureListener { /* mask reuses cache this frame */ }
                .addOnCompleteListener { onAnyComplete() }
            } catch (e: Exception) {
                // Face detector throwing synchronously is rare, but we must
                // still settle the pending counter so the imageProxy.close()
                // fires and the analysis pipeline doesn't stall.
                onAnyComplete()
            }
        } else {
            onFaces(cachedFaces)
        }
    }

    private fun bump(up: Boolean) {
        val isIn = if (invertDirection) !up else up
        if (isIn) inCount++ else outCount++
    }

    /** Live queue depth — cumulative IN minus cumulative OUT, clamped at zero. */
    fun currentQueueDepth(): Int = maxOf(0, inCount - outCount)

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
        lastX.clear()
        areaHist.clear()
        cachedDetections = emptyList()
        cachedFaces = emptyList()
    }

    /** Horizontally mirror a normalised rect: [l,t,r,b] → [1-r, t, 1-l, b]. */
    private fun mirrorHoriz(r: RectF): RectF =
        RectF(1f - r.right, r.top, 1f - r.left, r.bottom)

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
