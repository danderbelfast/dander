package io.tapprove.node

import android.content.Context
import android.graphics.SurfaceTexture
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Size
import android.view.Surface
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.UseCase
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * CameraProbe — belt-and-braces diagnostic for the headless-camera question.
 *
 * Some camera HALs (the "many devices" the existing startCamera() comment
 * warns about) only deliver ImageAnalysis frames when a real preview Surface
 * is ALSO bound. Nodes run on customer-sourced phones (full device spectrum),
 * so Increment 2 binds defensively with a 1x1 no-op Surface fallback
 * regardless — but this probe lets an operator confirm, on a given handset,
 * which mode actually produces frames. Run it from Settings (long-press the
 * hours summary) and read the result (also logged under "TapProveProbe").
 *
 *   Pass 1: ImageAnalysis ONLY (headless).
 *   Pass 2: ImageAnalysis + a 1x1 no-op Preview Surface (the fallback).
 *
 * Caller must already hold CAMERA permission.
 */
object CameraProbe {

    private const val TAG = "TapProveProbe"
    private const val PASS_MS = 5_000L
    private val TARGET = Size(1280, 720)

    data class Result(val headlessFrames: Int, val withSurfaceFrames: Int) {
        val recommendation: String
            get() = when {
                headlessFrames > 0    -> "Headless OK — ImageAnalysis-only delivers frames here."
                withSurfaceFrames > 0 -> "Needs the 1×1-surface fallback — headless gave 0 frames."
                else                  -> "No frames either way — check camera permission / hardware."
            }
    }

    /**
     * Runs both passes sequentially on [owner]'s lifecycle, then reports on the
     * main thread. Safe to call from an Activity (`this` is a LifecycleOwner).
     */
    fun run(context: Context, owner: LifecycleOwner, onResult: (Result) -> Unit) {
        val main = Handler(Looper.getMainLooper())
        val exec = Executors.newSingleThreadExecutor()
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            val provider = try { future.get() } catch (e: Exception) {
                Log.e(TAG, "no camera provider: ${e.message}", e)
                exec.shutdown(); main.post { onResult(Result(0, 0)) }; return@addListener
            }
            runPass(provider, owner, exec, withSurface = false) { headless ->
                runPass(provider, owner, exec, withSurface = true) { withSurface ->
                    try { provider.unbindAll() } catch (_: Exception) {}
                    exec.shutdown()
                    val r = Result(headless, withSurface)
                    Log.i(TAG, "done: headless=$headless withSurface=$withSurface — ${r.recommendation}")
                    main.post { onResult(r) }
                }
            }
        }, ContextCompat.getMainExecutor(context))
    }

    private fun runPass(
        provider: ProcessCameraProvider,
        owner: LifecycleOwner,
        exec: Executor,
        withSurface: Boolean,
        done: (Int) -> Unit,
    ) {
        val frames = AtomicInteger(0)
        val main = Handler(Looper.getMainLooper())
        main.post {
            try {
                provider.unbindAll()
                val resSelector = ResolutionSelector.Builder()
                    .setResolutionStrategy(
                        ResolutionStrategy(TARGET, ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER)
                    ).build()
                val analysis = ImageAnalysis.Builder()
                    .setResolutionSelector(resSelector)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                    .also { it.setAnalyzer(exec) { img -> frames.incrementAndGet(); img.close() } }

                val useCases = mutableListOf<UseCase>(analysis)
                if (withSurface) useCases.add(buildNoOpPreview(exec))

                provider.bindToLifecycle(
                    owner, CameraSelector.DEFAULT_FRONT_CAMERA, *useCases.toTypedArray(),
                )
            } catch (e: Exception) {
                Log.e(TAG, "bind failed (withSurface=$withSurface): ${e.message}", e)
                done(0)
                return@post
            }
            main.postDelayed({
                try { provider.unbindAll() } catch (_: Exception) {}
                done(frames.get())
            }, PASS_MS)
        }
    }

    /**
     * A Preview bound to a throwaway 1×1-ish SurfaceTexture — gives the HAL a
     * real producer Surface without rendering anything. This is the exact
     * fallback technique Increment 2 uses when headless delivers no frames.
     */
    private fun buildNoOpPreview(exec: Executor): Preview {
        return Preview.Builder().build().also { preview ->
            preview.setSurfaceProvider(exec) { request ->
                val texture = SurfaceTexture(0).apply {
                    setDefaultBufferSize(request.resolution.width, request.resolution.height)
                }
                val surface = Surface(texture)
                request.provideSurface(surface, exec) {
                    surface.release()
                    texture.release()
                }
            }
        }
    }
}
