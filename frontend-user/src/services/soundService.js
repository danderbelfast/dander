/**
 * Sound Service
 * Wrapper around sound generation that respects user preferences
 * - Checks soundEnabled from user preferences
 * - Checks document.hidden — don't play sounds when app is in background
 * - Respects volume preference (0.0 to 1.0)
 * - Falls back silently if AudioContext not available
 */

import * as soundGenerator from './soundGenerator';

/**
 * Get user sound preferences from localStorage/cache
 * @returns {object} - { soundEnabled, volume }
 */
function getUserSoundPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem('tapprove_sound_prefs') || '{}');
    return {
      soundEnabled: prefs.sounds_enabled !== false,
      volume: prefs.alert_volume ?? 0.7,
    };
  } catch {
    return { soundEnabled: true, volume: 0.7 };
  }
}

/**
 * Check if we should play sound
 */
function shouldPlaySound() {
  const { soundEnabled } = getUserSoundPrefs();
  
  // Don't play if disabled, app is in background, or sounds are muted
  if (!soundEnabled || document.hidden) {
    return false;
  }
  
  // Check if sounds are muted until a certain time
  const muteUntil = localStorage.getItem('tapprove_sound_mute_until');
  if (muteUntil && new Date(muteUntil) > new Date()) {
    return false;
  }
  
  return true;
}

/**
 * Internal helper to play sound with prefs check
 */
async function playSoundIfEnabled(soundFunction, volumeOverride) {
  if (!shouldPlaySound()) {
    return Promise.resolve();
  }

  const { volume } = getUserSoundPrefs();
  const finalVolume = volumeOverride !== undefined ? volumeOverride : volume;

  return soundFunction(finalVolume).catch((err) => {
    console.warn('[soundService] Error playing sound:', err.message);
  });
}

// Export named functions matching the sound types

export function dealNearby(volumeOverride) {
  return playSoundIfEnabled(soundGenerator.playDealNearby, volumeOverride);
}

export function veryClose(volumeOverride) {
  return playSoundIfEnabled(soundGenerator.playVeryClose, volumeOverride);
}

export function couponClaimed(volumeOverride) {
  return playSoundIfEnabled(soundGenerator.playCouponClaimed, volumeOverride);
}

export function couponRedeemed(volumeOverride) {
  return playSoundIfEnabled(soundGenerator.playCouponRedeemed, volumeOverride);
}

export function dealExpiringSoon(volumeOverride) {
  return playSoundIfEnabled(soundGenerator.playDealExpiringSoon, volumeOverride);
}

export function newOffer(volumeOverride) {
  return playSoundIfEnabled(soundGenerator.playNewOffer, volumeOverride);
}

export function error(volumeOverride) {
  return playSoundIfEnabled(soundGenerator.playError, volumeOverride);
}

/**
 * Play any sound without preference checks (for preview/testing)
 * Used for preference UI previews where user explicitly triggered the sound
 */
export function playPreview(soundFunction, volumeOverride) {
  // Check if document is hidden, but don't check soundEnabled
  // (user is actively in settings and triggered this)
  if (document.hidden) {
    return Promise.resolve();
  }

  const { volume } = getUserSoundPrefs();
  const finalVolume = volumeOverride !== undefined ? volumeOverride : volume;

  return soundFunction(finalVolume).catch((err) => {
    console.warn('[soundService] Error playing preview sound:', err.message);
  });
}
