package io.tapprove.node

import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioGroup
import android.widget.SeekBar
import android.widget.Spinner
import android.widget.Switch
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity

/**
 * SettingsActivity — operator-tunable settings persisted via Prefs.
 * Closing the activity (Save or system back) makes the values available
 * to MainActivity, which re-reads them in onResume.
 */
class SettingsActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        prefs = Prefs(this)

        val txtHoursSummary = findViewById<TextView>(R.id.txtHoursSummary)
        val seek     = findViewById<SeekBar>(R.id.seekBrightness)
        val lblBri   = findViewById<TextView>(R.id.lblBrightness)
        val group    = findViewById<RadioGroup>(R.id.groupFrames)
        val editWifi = findViewById<EditText>(R.id.editWifi)
        val editZone = findViewById<EditText>(R.id.editZoneName)
        val spinType = findViewById<Spinner>(R.id.spinnerZoneType)
        val btnSave  = findViewById<Button>(R.id.btnSave)

        // Read-only summary — hours are managed remotely from the dashboard
        // via the existing node_commands channel. A future on-device editor
        // can replace this when offline setup is needed.
        txtHoursSummary.text = BusinessHours.summary(prefs)

        // Sound toggle. Persists immediately — showLoyaltyGreeting reads
        // prefs.soundEnabled on every greeting so no MainActivity restart
        // is needed for the change to take effect.
        val switchSound = findViewById<Switch>(R.id.switchSound)
        switchSound.isChecked = prefs.soundEnabled
        switchSound.setOnCheckedChangeListener { _, isOn -> prefs.soundEnabled = isOn }

        seek.progress = prefs.brightnessPct
        lblBri.text = "${prefs.brightnessPct}%"
        seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, p: Int, fromUser: Boolean) {
                prefs.brightnessPct = p
                lblBri.text = "$p%"
            }
            override fun onStartTrackingTouch(sb: SeekBar?) {}
            override fun onStopTrackingTouch(sb: SeekBar?) {}
        })

        when (prefs.frameInterval) {
            3    -> group.check(R.id.frame3)
            10   -> group.check(R.id.frame10)
            else -> group.check(R.id.frame5)
        }
        group.setOnCheckedChangeListener { _, id ->
            prefs.frameInterval = when (id) {
                R.id.frame3  -> 3
                R.id.frame10 -> 10
                else          -> 5
            }
        }

        editWifi.setText(prefs.wifiIntervalMin.toString())
        editWifi.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) {
                prefs.wifiIntervalMin = editWifi.text.toString().toIntOrNull()?.coerceIn(1, 120) ?: 5
                editWifi.setText(prefs.wifiIntervalMin.toString())
            }
        }

        editZone.setText(prefs.zoneName)
        editZone.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) prefs.zoneName = editZone.text.toString().ifBlank { "Entrance" }
        }

        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, Prefs.ZONE_TYPES)
        spinType.adapter = adapter
        val idx = Prefs.ZONE_TYPES.indexOf(prefs.zoneType).coerceAtLeast(0)
        spinType.setSelection(idx)

        // Till-only sub-section: counting mode + queue threshold. Hidden
        // unless the operator picks "till" for the zone type.
        val tillSection         = findViewById<LinearLayout>(R.id.tillSection)
        val groupTill           = findViewById<RadioGroup>(R.id.groupTillMode)
        val editQueueThreshold  = findViewById<EditText>(R.id.editQueueThreshold)

        fun applyTillVisibility() {
            tillSection.visibility = if (prefs.zoneType == "till") View.VISIBLE else View.GONE
        }
        applyTillVisibility()

        when (prefs.tillMode) {
            "walkpast" -> groupTill.check(R.id.tillWalkpast)
            "approach" -> groupTill.check(R.id.tillApproach)
            else        -> groupTill.check(R.id.tillOverhead)
        }
        groupTill.setOnCheckedChangeListener { _, id ->
            prefs.tillMode = when (id) {
                R.id.tillWalkpast -> "walkpast"
                R.id.tillApproach -> "approach"
                else               -> "overhead"
            }
        }

        editQueueThreshold.setText(prefs.queueThreshold.toString())
        editQueueThreshold.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) {
                prefs.queueThreshold = editQueueThreshold.text.toString().toIntOrNull()?.coerceIn(1, 99) ?: 3
                editQueueThreshold.setText(prefs.queueThreshold.toString())
            }
        }

        spinType.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: android.widget.AdapterView<*>?, v: android.view.View?, pos: Int, id: Long) {
                prefs.zoneType = Prefs.ZONE_TYPES[pos]
                applyTillVisibility()
            }
            override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
        }

        btnSave.setOnClickListener {
            // Force-commit any in-progress edits then exit.
            prefs.wifiIntervalMin = editWifi.text.toString().toIntOrNull()?.coerceIn(1, 120) ?: 5
            prefs.zoneName = editZone.text.toString().ifBlank { "Entrance" }
            prefs.queueThreshold = editQueueThreshold.text.toString().toIntOrNull()?.coerceIn(1, 99) ?: 3
            finish()
        }

        // Re-pair: clear the business pairing from prefs and exit. MainActivity's
        // onResume checks Prefs.isConfigured and will bounce to SetupActivity when
        // it sees we've been unpaired.
        val btnRepair = findViewById<Button>(R.id.btnRepair)
        btnRepair.setOnClickListener {
            val current = prefs.businessName.ifBlank { "this business" }
            AlertDialog.Builder(this)
                .setTitle("Re-pair business")
                .setMessage("This will unpair this device from $current. Continue?")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Unpair") { _, _ ->
                    prefs.businessCode = ""
                    prefs.businessId   = 0
                    prefs.businessName = ""
                    finish()
                }
                .show()
        }
    }

}
