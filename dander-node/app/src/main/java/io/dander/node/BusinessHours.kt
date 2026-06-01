package io.dander.node

import java.time.LocalDateTime
import java.time.LocalTime

/**
 * BusinessHours — open/closed test against a Prefs-configured window in
 * the device's *local* time. Overnight windows (close < open) aren't
 * supported in the PoC; close is assumed later in the same day.
 */
object BusinessHours {

    fun isOpen(prefs: Prefs, now: LocalDateTime = LocalDateTime.now()): Boolean {
        val open  = LocalTime.of(prefs.openHour,  prefs.openMin)
        val close = LocalTime.of(prefs.closeHour, prefs.closeMin)
        val t = now.toLocalTime()
        return !t.isBefore(open) && t.isBefore(close)
    }

    fun nextOpenAt(prefs: Prefs, now: LocalDateTime = LocalDateTime.now()): LocalDateTime {
        val open = LocalTime.of(prefs.openHour, prefs.openMin)
        val today = now.toLocalDate().atTime(open)
        return if (now.isBefore(today)) today else today.plusDays(1)
    }

    fun formatNextOpen(prefs: Prefs, now: LocalDateTime = LocalDateTime.now()): String {
        val next = nextOpenAt(prefs, now)
        val sameDay = next.toLocalDate() == now.toLocalDate()
        val time = "%02d:%02d".format(prefs.openHour, prefs.openMin)
        return if (sameDay) "Opens at $time today" else "Opens at $time tomorrow"
    }

}
