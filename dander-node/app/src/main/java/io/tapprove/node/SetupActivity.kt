package io.tapprove.node

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioGroup
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * SetupActivity — first-launch pairing flow.
 *
 *   Screen 1 — operator types the 4-digit business code printed on the
 *              dashboard. The app calls /api/public/business/code/:code
 *              to validate and resolve a business_id + name.
 *   Screen 2 — operator names the zone and picks its type. Saving exits
 *              into MainActivity, which now sees Prefs.isConfigured == true.
 *
 * Anything network-driven is best-effort; failure shows an inline status
 * message rather than crashing the screen.
 */
class SetupActivity : AppCompatActivity() {

    private companion object {
        const val LOOKUP_BASE = "https://api.dander.io/api/public/business/code/"
    }

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private lateinit var prefs: Prefs

    private lateinit var step1: LinearLayout
    private lateinit var step2: LinearLayout
    private lateinit var editCode: EditText
    private lateinit var codeStatus: TextView
    private lateinit var btnConfirmCode: Button

    private lateinit var lblPairedBusiness: TextView
    private lateinit var editZoneName: EditText
    private lateinit var groupZoneType: RadioGroup
    private lateinit var btnStartCounting: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)
        prefs = Prefs(this)

        step1            = findViewById(R.id.step1)
        step2            = findViewById(R.id.step2)
        editCode         = findViewById(R.id.editCode)
        codeStatus       = findViewById(R.id.codeStatus)
        btnConfirmCode   = findViewById(R.id.btnConfirmCode)
        lblPairedBusiness = findViewById(R.id.lblPairedBusiness)
        editZoneName     = findViewById(R.id.editZoneName)
        groupZoneType    = findViewById(R.id.groupZoneType)
        btnStartCounting = findViewById(R.id.btnStartCounting)

        // Pre-fill if the user is re-pairing.
        if (prefs.businessCode.isNotBlank()) editCode.setText(prefs.businessCode)

        btnConfirmCode.setOnClickListener { handleConfirmCode() }
        btnStartCounting.setOnClickListener { handleStartCounting() }

        // Preset zone name + type from prefs.
        editZoneName.setText(prefs.zoneName)
        when (prefs.zoneType) {
            "display" -> groupZoneType.check(R.id.typeDisplay)
            "till"    -> groupZoneType.check(R.id.typeTill)
            "general" -> groupZoneType.check(R.id.typeGeneral)
            else      -> groupZoneType.check(R.id.typeEntrance)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }

    private fun handleConfirmCode() {
        val code = editCode.text.toString().trim()
        if (!code.matches(Regex("^\\d{4}$"))) {
            codeStatus.text = "Enter exactly 4 digits."
            return
        }
        btnConfirmCode.isEnabled = false
        codeStatus.text = "Checking…"

        scope.launch {
            val result = withContext(Dispatchers.IO) { lookupBusinessCode(code) }
            btnConfirmCode.isEnabled = true
            when (result) {
                is Lookup.Ok -> {
                    prefs.businessCode = code
                    prefs.businessId   = result.businessId
                    prefs.businessName = result.businessName
                    codeStatus.text    = "Paired with ${result.businessName}"
                    lblPairedBusiness.text = "Paired with ${result.businessName}"
                    showStep2()
                }
                Lookup.NotFound -> codeStatus.text = "No business found for that code."
                Lookup.RateLimited -> codeStatus.text = "Too many tries — wait a few minutes."
                Lookup.NetworkError -> codeStatus.text = "Network error — check connection and try again."
            }
        }
    }

    private fun showStep2() {
        step1.visibility = View.GONE
        step2.visibility = View.VISIBLE
    }

    private fun handleStartCounting() {
        val name = editZoneName.text.toString().trim().ifBlank { "Entrance" }
        val type = when (groupZoneType.checkedRadioButtonId) {
            R.id.typeDisplay -> "display"
            R.id.typeTill    -> "till"
            R.id.typeGeneral -> "general"
            else              -> "entrance"
        }
        prefs.zoneName = name
        prefs.zoneType = type

        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    // ── HTTP ────────────────────────────────────────────────────

    private sealed interface Lookup {
        data class Ok(val businessId: Int, val businessName: String) : Lookup
        data object NotFound : Lookup
        data object RateLimited : Lookup
        data object NetworkError : Lookup
    }

    private fun lookupBusinessCode(code: String): Lookup {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(LOOKUP_BASE + code).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 10_000
                readTimeout = 10_000
            }
            val status = conn.responseCode
            if (status == 200) {
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                val j = JSONObject(body)
                Lookup.Ok(
                    businessId   = j.optInt("business_id", 0),
                    businessName = j.optString("business_name", ""),
                )
            } else if (status == 404)        Lookup.NotFound
              else if (status == 429)        Lookup.RateLimited
              else                            Lookup.NetworkError
        } catch (e: Exception) {
            Lookup.NetworkError
        } finally {
            conn?.disconnect()
        }
    }
}
