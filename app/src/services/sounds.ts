/**
 * sounds.ts — sound alert API.
 *
 * STUB. The exported functions exist so callers can wire them in today,
 * but no audio is actually played until:
 *
 *   1. `expo-av` is added to dependencies (`npx expo install expo-av`),
 *   2. real audio assets are placed in `app/assets/sounds/`:
 *        - points.mp3              (≤200ms, short positive chime)
 *        - offer-claimed.mp3       (~600ms, celebratory)
 *        - redemption-success.mp3  (~800ms, strong positive)
 *        - daily-bonus.mp3         (~500ms, warm welcome)
 *        - milestone.mp3           (~1s,    fanfare)
 *   3. the `play` helper below is swapped from a no-op to a real
 *      Audio.Sound.createAsync + playAsync chain.
 *
 * Why a stub instead of a working implementation right now: the Web Audio
 * oscillator pattern used by frontend-user/src/services/soundGenerator.js
 * doesn't have an equivalent in React Native / expo-av — playback is
 * file-based only. So real sound design needs real audio files. Until
 * those land, calling these functions is a no-op (in __DEV__ we log so
 * you can see what _would_ have played).
 *
 * Haptics ([haptics.ts](./haptics.ts)) provide the primary tactile
 * feedback in the meantime.
 */

type SoundKey =
  | 'points'
  | 'offer-claimed'
  | 'redemption-success'
  | 'daily-bonus'
  | 'milestone';

function play(key: SoundKey) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[sounds] would play: ${key}`);
  }
  // TODO: replace with expo-av once audio assets are in place.
  // const { sound } = await Audio.Sound.createAsync(SOUND_FILES[key]);
  // await sound.playAsync();
  // sound.setOnPlaybackStatusUpdate((s) => s.didJustFinish && sound.unloadAsync());
}

/** Short positive chime — fires alongside points ticks. */
export function soundPoints() { play('points'); }

/** Celebratory tone — fires when a coupon is claimed. */
export function soundOfferClaimed() { play('offer-claimed'); }

/** Strong positive — fires when a coupon is redeemed at the till. */
export function soundRedemptionSuccess() { play('redemption-success'); }

/** Warm welcome — fires when the daily-login bonus is granted. */
export function soundDailyBonus() { play('daily-bonus'); }

/** Fanfare — fires on step milestones (1k, 5k, 10k, 20k). */
export function soundMilestone() { play('milestone'); }
