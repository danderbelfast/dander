/**
 * Haptic Service
 * Provides haptic feedback using the Vibration API
 * - Checks hapticsEnabled from user preferences
 * - Respects document visibility
 * - Falls back silently if Vibration API not available
 * - Supports pattern-based vibrations
 */

/**
 * Check if Vibration API is supported
 */
function isVibrationSupported() {
  return !!(navigator.vibrate || navigator.webkitVibrate || navigator.mozVibrate || navigator.msVibrate);
}

/**
 * Get the vibrate function (with vendor prefixes)
 */
function getVibrateFunction() {
  return navigator.vibrate || navigator.webkitVibrate || navigator.mozVibrate || navigator.msVibrate;
}

/**
 * Get user haptic preferences from localStorage
 */
function getUserHapticPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem('tapprove_sound_prefs') || '{}');
    return prefs.haptics_enabled !== false;
  } catch {
    return true;
  }
}

/**
 * Check if we should trigger haptic feedback
 */
function shouldVibrate() {
  return getUserHapticPrefs() && !document.hidden && isVibrationSupported();
}

/**
 * Internal helper to vibrate with prefs check
 */
function vibrateIfEnabled(pattern) {
  if (!shouldVibrate()) {
    return;
  }

  try {
    const vibrate = getVibrateFunction();
    if (vibrate) {
      vibrate.call(navigator, pattern);
    }
  } catch (err) {
    console.warn('[hapticService] Vibration error:', err.message);
  }
}

// Pattern definitions for different alert types

/**
 * dealNearby - Gentle single pulse
 * Indicates nearby deal opportunity
 */
export function dealNearby() {
  vibrateIfEnabled([30, 50, 30]);
}

/**
 * veryClose - Stronger, more urgent pulses
 * Indicates deal is very close
 */
export function veryClose() {
  vibrateIfEnabled([50, 30, 50, 30, 50]);
}

/**
 * couponClaimed - Short success pulse
 * Confirms coupon was claimed
 */
export function couponClaimed() {
  vibrateIfEnabled([40]);
}

/**
 * couponRedeemed - Double confirmation pulses
 * Confirms coupon was successfully redeemed
 */
export function couponRedeemed() {
  vibrateIfEnabled([80, 40, 80]);
}

/**
 * dealExpiringSoon - Quick urgent pattern
 * Indicates deal is about to expire
 */
export function dealExpiringSoon() {
  vibrateIfEnabled([40, 20, 40, 20, 40]);
}

/**
 * error - Error feedback pattern
 * Indicates an error or invalid action
 */
export function error() {
  vibrateIfEnabled([100, 50, 100]);
}

/**
 * Vibrate a custom pattern directly
 * @param {Array<number>} pattern - [vibrate_ms, pause_ms, vibrate_ms, ...]
 */
export function custom(pattern) {
  vibrateIfEnabled(pattern);
}

/**
 * Stop all vibration immediately
 */
export function stop() {
  if (isVibrationSupported()) {
    try {
      const vibrate = getVibrateFunction();
      if (vibrate) {
        vibrate.call(navigator, 0);
      }
    } catch (err) {
      console.warn('[hapticService] Stop vibration error:', err.message);
    }
  }
}
