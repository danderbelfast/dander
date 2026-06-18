package expo.modules.applinks

import android.content.pm.verify.domain.DomainVerificationManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * AppLinks — exposes Android 12+'s DomainVerificationManager state to JS.
 *
 * Used by the customer app to detect whether the device has the
 * "Open supported links" master toggle enabled for io.tapprove.app.
 * Samsung One UI ships this OFF by default, which means verified
 * domains still open in the browser unless the user (or our in-app
 * prompt) flips the toggle in system Settings.
 *
 * Returns supported=false on API < 31 so the JS layer can no-op
 * gracefully — those devices use the older legacy verification model
 * and lack DomainVerificationManager entirely.
 */
class AppLinksModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppLinks")

    AsyncFunction("getDomainState") {
      val ctx = appContext.reactContext
        ?: return@AsyncFunction unsupported()

      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        return@AsyncFunction unsupported()
      }

      val manager = ctx.getSystemService(DomainVerificationManager::class.java)
        ?: return@AsyncFunction unsupported()

      val state = manager.getDomainVerificationUserState(ctx.packageName)
        ?: return@AsyncFunction unsupported()

      mapOf(
        "supported" to true,
        "linkHandlingAllowed" to state.isLinkHandlingAllowed,
        "hosts" to state.hostToStateMap.mapValues { it.value.toInt() }
      )
    }
  }

  private fun unsupported() = mapOf(
    "supported" to false,
    "linkHandlingAllowed" to true,
    "hosts" to emptyMap<String, Int>()
  )
}
