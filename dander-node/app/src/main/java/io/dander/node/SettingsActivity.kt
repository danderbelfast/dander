package io.dander.node

import android.app.TimePickerDialog
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.RadioGroup
import android.widget.SeekBar
import android.widget.Spinner
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

        val btnOpen  = findViewById<Button>(R.id.btnOpen)
        val btnClose = findViewById<Button>(R.id.btnClose)
        val seek     = findViewById<SeekBar>(R.id.seekBrightness)
        val lblBri   = findViewById<TextView>(R.id.lblBrightness)
        val group    = findViewById<RadioGroup>(R.id.groupFrames)
        val editWifi = findViewById<EditText>(R.id.editWifi)
        val editZone = findViewById<EditText>(R.id.editZoneName)
        val spinType = findViewById<Spinner>(R.id.spinnerZoneType)
        val btnSave  = findViewById<Button>(R.id.btnSave)

        btnOpen.text  = fmt(prefs.openHour,  prefs.openMin)
        btnClose.text = fmt(prefs.closeHour, prefs.closeMin)

        btnOpen.setOnClickListener {
            pickTime(prefs.openHour, prefs.openMin) { h, m ->
                prefs.openHour = h; prefs.openMin = m
                btnOpen.text = fmt(h, m)
            }
        }
        btnClose.setOnClickListener {
            pickTime(prefs.closeHour, prefs.closeMin) { h, m ->
                prefs.closeHour = h; prefs.closeMin = m
                btnClose.text = fmt(h, m)
            }
        }

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
        spinType.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: android.widget.AdapterView<*>?, v: android.view.View?, pos: Int, id: Long) {
                prefs.zoneType = Prefs.ZONE_TYPES[pos]
            }
            override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
        }

        btnSave.setOnClickListener {
            // Force-commit any in-progress edits then exit.
            prefs.wifiIntervalMin = editWifi.text.toString().toIntOrNull()?.coerceIn(1, 120) ?: 5
            prefs.zoneName = editZone.text.toString().ifBlank { "Entrance" }
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

    private fun pickTime(hour: Int, min: Int, onSet: (Int, Int) -> Unit) {
        TimePickerDialog(this, { _, h, m -> onSet(h, m) }, hour, min, true).show()
    }

    private fun fmt(h: Int, m: Int) = "%02d:%02d".format(h, m)
}
