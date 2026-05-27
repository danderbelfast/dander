/**
 * sounds.ts — short audio alerts.
 *
 * Assets currently live at `app/assets/sounds/<key>.mp3` as 0-byte
 * placeholders so the require() resolves through Metro. Real audio gets
 * dropped over the top of these later — no code changes required.
 *
 * The graceful fallback: `Audio.Sound.createAsync` rejects when the file
 * is empty / not a valid audio container. We catch, cache the failure as
 * `null`, and never retry that key for the lifetime of the process.
 * Callers never see an error.
 *
 * Each Sound instance is loaded once and re-used via `replayAsync()` so
 * subsequent plays don't allocate. Sounds are tiny (<1s each) so keeping
 * them resident is fine.
 */

import { Audio, AVPlaybackSource } from 'expo-av';

type SoundKey =
  | 'points'
  | 'offer-claimed'
  | 'redemption-success'
  | 'daily-bonus'
  | 'milestone';

const SOURCES: Record<SoundKey, AVPlaybackSource> = {
  'points':             require('../../assets/sounds/points.mp3'),
  'offer-claimed':      require('../../assets/sounds/offer-claimed.mp3'),
  'redemption-success': require('../../assets/sounds/redemption-success.mp3'),
  'daily-bonus':        require('../../assets/sounds/daily-bonus.mp3'),
  'milestone':          require('../../assets/sounds/milestone.mp3'),
};

// `Audio.Sound` once loaded; `null` once a load attempt has failed so we
// don't keep retrying empty placeholder files at every play.
const cache = new Map<SoundKey, Audio.Sound | null>();
const loading = new Map<SoundKey, Promise<Audio.Sound | null>>();

async function getSound(key: SoundKey): Promise<Audio.Sound | null> {
  if (cache.has(key))   return cache.get(key) ?? null;
  if (loading.has(key)) return loading.get(key) as Promise<Audio.Sound | null>;

  const p = Audio.Sound.createAsync(SOURCES[key], { shouldPlay: false })
    .then(({ sound }) => {
      cache.set(key, sound);
      return sound;
    })
    .catch((err) => {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(`[sounds] could not load ${key}:`, err?.message ?? err);
      }
      cache.set(key, null);
      return null;
    })
    .finally(() => { loading.delete(key); });

  loading.set(key, p);
  return p;
}

async function play(key: SoundKey) {
  try {
    const sound = await getSound(key);
    if (!sound) return;
    await sound.replayAsync();
  } catch (err) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(`[sounds] could not play ${key}:`, (err as Error)?.message ?? err);
    }
  }
}

/** Short positive chime — fires alongside points ticks. */
export function soundPoints() { void play('points'); }

/** Celebratory tone — fires when a coupon is claimed. */
export function soundOfferClaimed() { void play('offer-claimed'); }

/** Strong positive — fires when a coupon is redeemed at the till. */
export function soundRedemptionSuccess() { void play('redemption-success'); }

/** Warm welcome — fires when the daily-login bonus is granted. */
export function soundDailyBonus() { void play('daily-bonus'); }

/** Fanfare — fires on step milestones (1k, 5k, 10k, 20k). */
export function soundMilestone() { void play('milestone'); }
