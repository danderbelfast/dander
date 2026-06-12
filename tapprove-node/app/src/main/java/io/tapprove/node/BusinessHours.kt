package io.tapprove.node

import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

/**
 * BusinessHours — per-day weekly open/closed test against a JSON-encoded
 * schedule in Prefs. JSON shape (one entry per day key):
 *
 *   { "monday":    {"open":"09:00","close":"17:30","closed":false},
 *     "tuesday":   ...,
 *     ...
 *     "sunday":    {"open":"09:00","close":"17:30","closed":true} }
 *
 * Overnight windows (close < open, e.g. 20:00 → 02:00 next morning) are
 * supported — the wrap treats anything after `open` *or* before `close`
 * as inside the window. The next-open calculation iterates forward
 * through the week and finds the next non-closed day's open time.
 */
object BusinessHours {

    private val DAY_KEYS = listOf(
        DayOfWeek.MONDAY    to "monday",
        DayOfWeek.TUESDAY   to "tuesday",
        DayOfWeek.WEDNESDAY to "wednesday",
        DayOfWeek.THURSDAY  to "thursday",
        DayOfWeek.FRIDAY    to "friday",
        DayOfWeek.SATURDAY  to "saturday",
        DayOfWeek.SUNDAY    to "sunday",
    ).toMap()

    // Fresh-install default: Mon-Sat 09:00-18:00 open, Sun closed.
    // A Node that boots before the dashboard has pushed remote hours
    // should look "open during typical hours" rather than closed.
    private val DEFAULT_HOURS = """
        {"monday":   {"open":"09:00","close":"18:00","closed":false},
         "tuesday":  {"open":"09:00","close":"18:00","closed":false},
         "wednesday":{"open":"09:00","close":"18:00","closed":false},
         "thursday": {"open":"09:00","close":"18:00","closed":false},
         "friday":   {"open":"09:00","close":"18:00","closed":false},
         "saturday": {"open":"09:00","close":"18:00","closed":false},
         "sunday":   {"open":"09:00","close":"18:00","closed":true}}
    """.trimIndent()

    fun defaultJson(): String = DEFAULT_HOURS

    data class DayHours(val open: LocalTime, val close: LocalTime, val closed: Boolean)

    private fun parse(json: String): Map<String, DayHours> {
        return try {
            val root = JSONObject(json)
            val out = HashMap<String, DayHours>(7)
            for (key in DAY_KEYS.values) {
                val v = root.optJSONObject(key) ?: continue
                val open  = LocalTime.parse(v.optString("open",  "09:00"))
                val close = LocalTime.parse(v.optString("close", "17:30"))
                val closed = v.optBoolean("closed", false)
                out[key] = DayHours(open, close, closed)
            }
            out
        } catch (_: Exception) {
            emptyMap()
        }
    }

    fun isOpen(prefs: Prefs, now: LocalDateTime = LocalDateTime.now()): Boolean {
        val schedule = parse(prefs.openingHoursJson)
        val todayKey = DAY_KEYS[now.dayOfWeek] ?: return false
        val today = schedule[todayKey] ?: return false
        if (today.closed) return false

        val t = now.toLocalTime()
        return if (today.close.isAfter(today.open)) {
            // Same-day window: [open, close).
            !t.isBefore(today.open) && t.isBefore(today.close)
        } else {
            // Overnight wrap: open today, close tomorrow morning.
            !t.isBefore(today.open) || t.isBefore(today.close)
        }
    }

    /**
     * Find the next instant the kiosk should next be open. Walks forward up
     * to 7 days; if every day is marked closed we return `now` (the caller
     * will still see isOpen=false but the format string stays sensible).
     */
    fun nextOpenAt(prefs: Prefs, now: LocalDateTime = LocalDateTime.now()): LocalDateTime {
        val schedule = parse(prefs.openingHoursJson)
        // First, today — if today's window starts later than now and isn't closed.
        val todayKey = DAY_KEYS[now.dayOfWeek]
        val todayHours = todayKey?.let { schedule[it] }
        if (todayHours != null && !todayHours.closed) {
            val candidate = now.toLocalDate().atTime(todayHours.open)
            if (candidate.isAfter(now)) return candidate
        }
        // Then iterate the next 7 days.
        var day = now.toLocalDate().plusDays(1)
        for (i in 0 until 7) {
            val key = DAY_KEYS[day.dayOfWeek] ?: continue
            val h = schedule[key] ?: continue
            if (!h.closed) return day.atTime(h.open)
            day = day.plusDays(1)
        }
        return now
    }

    fun formatNextOpen(prefs: Prefs, now: LocalDateTime = LocalDateTime.now()): String {
        val next = nextOpenAt(prefs, now)
        if (next == now) return "Hours not set"
        val today = now.toLocalDate()
        val nextDate = next.toLocalDate()
        val time = next.toLocalTime().format(DateTimeFormatter.ofPattern("HH:mm"))
        return when {
            nextDate == today          -> "Opens today at $time"
            nextDate == today.plusDays(1) -> "Opens tomorrow at $time"
            else -> {
                val dayName = nextDate.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.getDefault())
                "Opens $dayName at $time"
            }
        }
    }

    /** Human-readable single-line summary for the Settings read-only display. */
    fun summary(prefs: Prefs): String {
        val schedule = parse(prefs.openingHoursJson)
        if (schedule.isEmpty()) return "Hours not set"
        val lines = ArrayList<String>(7)
        for ((dow, key) in DAY_KEYS) {
            val h = schedule[key] ?: continue
            val dayName = dow.getDisplayName(TextStyle.SHORT, Locale.getDefault())
            lines += if (h.closed) "$dayName: Closed"
                     else "$dayName: ${h.open}-${h.close}"
        }
        return lines.joinToString("\n")
    }
}
