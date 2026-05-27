/**
 * haptics.ts — wrappers around expo-haptics.
 *
 * Every function is fire-and-forget and wraps the underlying call in a
 * try/catch so calling code never has to worry about errors on devices
 * without haptic hardware (simulator, older Android phones, etc.).
 */

import * as Haptics from 'expo-haptics';

function safe(fn: () => Promise<unknown>) {
  try {
    void fn().catch(() => { /* swallow */ });
  } catch { /* swallow */ }
}

/** Subtle tap — use for small confirmations like a points tick. */
export function hapticLight() {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Medium impact — use for milestone hits, daily bonus. */
export function hapticMedium() {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Heavy impact — use sparingly, for big moments. */
export function hapticHeavy() {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

/** Success notification — use after a positive outcome (offer claimed, OTP verified). */
export function hapticSuccess() {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Error notification — use after a failed action. */
export function hapticError() {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/** Warning notification — use for "are you sure?" moments. */
export function hapticWarning() {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
