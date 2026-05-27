'use strict';

/**
 * challenges.js — temporary stub.
 *
 * Returns a hardcoded list of active challenges so the app can ship the
 * Challenges UI ahead of the real engine. Progress is filled in per
 * request from the actual data already collected by other parts of the
 * system:
 *
 *   - steps   → step_logs.steps for today (UTC)
 *   - wifi    → COUNT(DISTINCT bssid) in wifi_points_log for today (UTC)
 *   - login   → COUNT(DISTINCT day) in points_transactions
 *                  where reference_type='daily_login' this UTC month
 *   - visit   → 0 (visit tracking not built yet)
 *   - explore → 0 (hex coverage not built yet)
 *
 * If any of the progress queries fail, that challenge falls back to the
 * hardcoded baseline so the UI never goes blank.
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const pool = require('../db/pool');

const router = Router();

const ACTIVE_CHALLENGES = [
  {
    id: 1,
    type: 'steps',
    name: 'Step it up',
    description: 'Walk 10,000 steps today',
    points_reward: 50,
    target:   10000,
    progress: 0,
    resets:   'daily',
    icon:     '👟',
  },
  {
    id: 2,
    type: 'wifi',
    name: 'Network explorer',
    description: 'Discover 10 new WiFi networks today',
    points_reward: 30,
    target:   10,
    progress: 0,
    resets:   'daily',
    icon:     '📶',
  },
  {
    id: 3,
    type: 'visit',
    name: 'Local explorer',
    description: 'Visit 3 Dander businesses this week',
    points_reward: 100,
    target:   3,
    progress: 0,
    resets:   'weekly',
    icon:     '🏪',
  },
  {
    id: 4,
    type: 'login',
    name: 'Daily habit',
    description: 'Open Dander 7 days in a row',
    points_reward: 200,
    target:   7,
    progress: 1,
    resets:   'weekly',
    icon:     '☀️',
  },
  {
    id: 5,
    type: 'explore',
    name: 'Ballyhackamore explorer',
    description: 'Cover 5 new areas this week',
    points_reward: 150,
    target:   5,
    progress: 0,
    resets:   'weekly',
    icon:     '🗺️',
  },
];

async function fetchProgress(userId) {
  const [stepRes, wifiRes, loginRes] = await Promise.all([
    pool.query(
      `SELECT COALESCE(steps, 0)::int AS n
         FROM step_logs
        WHERE user_id   = $1
          AND logged_at = (NOW() AT TIME ZONE 'UTC')::date
        LIMIT 1`,
      [userId]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT COUNT(DISTINCT bssid)::int AS n
         FROM wifi_points_log
        WHERE user_id   = $1
          AND award_day = (NOW() AT TIME ZONE 'UTC')::date`,
      [userId]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT COUNT(DISTINCT (created_at AT TIME ZONE 'UTC')::date)::int AS n
         FROM points_transactions
        WHERE user_id        = $1
          AND reference_type = 'daily_login'
          AND created_at    >= date_trunc('month', (NOW() AT TIME ZONE 'UTC'))`,
      [userId]
    ).catch(() => ({ rows: [] })),
  ]);

  return {
    steps:   stepRes.rows[0]?.n  ?? 0,
    wifi:    wifiRes.rows[0]?.n  ?? 0,
    login:   loginRes.rows[0]?.n ?? 0,
    visit:   0,
    explore: 0,
  };
}

router.get('/active', requireAuth, async (req, res) => {
  try {
    const progress = await fetchProgress(req.user.id);
    const challenges = ACTIVE_CHALLENGES.map((c) => {
      const live = progress[c.type];
      // Cap progress at target so the UI doesn't render a ratio >1.
      const capped = live == null ? c.progress : Math.min(live, c.target);
      return { ...c, progress: capped };
    });
    return res.json({ success: true, challenges });
  } catch (err) {
    console.error('[challenges/active]', err);
    return res.json({ success: true, challenges: ACTIVE_CHALLENGES });
  }
});

module.exports = router;
