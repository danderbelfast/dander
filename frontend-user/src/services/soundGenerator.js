/**
 * Sound Generator Service
 * Synthesizes audio alerts using Web Audio API
 * Caches AudioContext for reuse and respects user preferences
 */

let audioContext = null;
let audioContextPromise = null;

/**
 * Get or create the global AudioContext
 * @returns {Promise<AudioContext|null>}
 */
async function getAudioContext() {
  // Return existing context
  if (audioContext) {
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (e) {
        // Silently fail if context can't be resumed
      }
    }
    return audioContext;
  }

  // Prevent concurrent creation attempts
  if (audioContextPromise) {
    return audioContextPromise;
  }

  // Create new context
  audioContextPromise = (async () => {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      return audioContext;
    } catch (err) {
      console.warn('[soundGenerator] AudioContext not available:', err.message);
      audioContextPromise = null;
      return null;
    }
  })();

  return audioContextPromise;
}

/**
 * Create an oscillator with specified frequency and duration
 * @param {AudioContext} ctx
 * @param {number} frequency - Hz
 * @param {number} startTime - seconds
 * @param {number} duration - seconds
 * @param {number} volume - 0.0-1.0
 * @returns {object} - { osc, gain, endTime }
 */
function createTone(ctx, frequency, startTime, duration, volume = 0.3) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.value = frequency;
  osc.type = 'sine';

  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);

  return { osc, gain, endTime: startTime + duration };
}

/**
 * Create multiple tones with envelope
 * @param {AudioContext} ctx
 * @param {Array} frequencies - array of { freq, duration, delay? }
 * @param {number} volume
 * @returns {number} - total duration
 */
function playFrequencies(ctx, frequencies, volume = 0.3) {
  let currentTime = ctx.currentTime;
  let maxEndTime = currentTime;

  frequencies.forEach((f) => {
    const delay = f.delay || 0;
    const startTime = currentTime + delay;
    const endTime = startTime + (f.duration || 0.1);
    createTone(ctx, f.freq, startTime, f.duration || 0.1, volume);
    maxEndTime = Math.max(maxEndTime, endTime);
  });

  return maxEndTime - currentTime;
}

/**
 * deal_nearby - Two rising tones, like a shop door chime
 * Duration: 0.6s
 * Frequency sweep: 440→660, pause, 520→780
 */
export async function playDealNearby(volume = 0.3) {
  const ctx = await getAudioContext();
  if (!ctx) return;

  try {
    const baseTime = ctx.currentTime;
    const tones = [
      { freq: 440, duration: 0.2 },
      { freq: 660, duration: 0.15, delay: 0.2 },
      { freq: 520, duration: 0.15, delay: 0.35 },
      { freq: 780, duration: 0.15, delay: 0.5 },
    ];

    playFrequencies(ctx, tones, volume);
    return new Promise((resolve) => {
      setTimeout(resolve, 600);
    });
  } catch (err) {
    console.warn('[soundGenerator] playDealNearby error:', err.message);
  }
}

/**
 * very_close - Three quick ascending tones
 * Duration: 0.5s
 * Frequency: 523, 659, 784
 */
export async function playVeryClose(volume = 0.3) {
  const ctx = await getAudioContext();
  if (!ctx) return;

  try {
    const tones = [
      { freq: 523, duration: 0.12 },
      { freq: 659, duration: 0.12, delay: 0.13 },
      { freq: 784, duration: 0.12, delay: 0.26 },
    ];

    playFrequencies(ctx, tones, volume);
    return new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  } catch (err) {
    console.warn('[soundGenerator] playVeryClose error:', err.message);
  }
}

/**
 * coupon_claimed - Satisfying ascending arpeggio
 * Duration: 0.8s
 * Frequency: 261, 329, 392, 523
 */
export async function playCouponClaimed(volume = 0.3) {
  const ctx = await getAudioContext();
  if (!ctx) return;

  try {
    const tones = [
      { freq: 261, duration: 0.15 },
      { freq: 329, duration: 0.15, delay: 0.16 },
      { freq: 392, duration: 0.15, delay: 0.32 },
      { freq: 523, duration: 0.25, delay: 0.48 },
    ];

    playFrequencies(ctx, tones, volume);
    return new Promise((resolve) => {
      setTimeout(resolve, 800);
    });
  } catch (err) {
    console.warn('[soundGenerator] playCouponClaimed error:', err.message);
  }
}

/**
 * coupon_redeemed - Double confirmation tone
 * Duration: 0.6s
 * Frequency: 784, pause, 784
 */
export async function playCouponRedeemed(volume = 0.3) {
  const ctx = await getAudioContext();
  if (!ctx) return;

  try {
    const tones = [
      { freq: 784, duration: 0.15 },
      { freq: 784, duration: 0.15, delay: 0.3 },
    ];

    playFrequencies(ctx, tones, volume);
    return new Promise((resolve) => {
      setTimeout(resolve, 600);
    });
  } catch (err) {
    console.warn('[soundGenerator] playCouponRedeemed error:', err.message);
  }
}

/**
 * deal_expiring - Three descending pulses
 * Duration: 0.7s
 * Frequency: 659, 587, 523
 */
export async function playDealExpiringSoon(volume = 0.3) {
  const ctx = await getAudioContext();
  if (!ctx) return;

  try {
    const tones = [
      { freq: 659, duration: 0.15 },
      { freq: 587, duration: 0.15, delay: 0.2 },
      { freq: 523, duration: 0.2, delay: 0.4 },
    ];

    playFrequencies(ctx, tones, volume);
    return new Promise((resolve) => {
      setTimeout(resolve, 700);
    });
  } catch (err) {
    console.warn('[soundGenerator] playDealExpiringSoon error:', err.message);
  }
}

/**
 * new_offer - Single bright chime
 * Duration: 0.4s
 * Frequency: 880 with quick decay
 */
export async function playNewOffer(volume = 0.3) {
  const ctx = await getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = 880;
    osc.type = 'sine';

    const startTime = ctx.currentTime;
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.4);

    return new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
  } catch (err) {
    console.warn('[soundGenerator] playNewOffer error:', err.message);
  }
}

/**
 * error_sound - Two low descending tones
 * Duration: 0.4s
 * Frequency: 330 → 220
 */
export async function playError(volume = 0.3) {
  const ctx = await getAudioContext();
  if (!ctx) return;

  try {
    const tones = [
      { freq: 330, duration: 0.15 },
      { freq: 220, duration: 0.15, delay: 0.2 },
    ];

    playFrequencies(ctx, tones, volume);
    return new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
  } catch (err) {
    console.warn('[soundGenerator] playError error:', err.message);
  }
}
