'use strict';

/**
 * challenges.js — temporary stub.
 *
 * Returns a hardcoded list of active challenges so the app can ship the
 * Challenges UI ahead of the real engine. No DB. Once the real challenge
 * system lands, the response shape here is the contract to match.
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');

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

router.get('/active', requireAuth, (_req, res) => {
  return res.json({ success: true, challenges: ACTIVE_CHALLENGES });
});

module.exports = router;
