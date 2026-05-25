'use strict';

/**
 * assistant.js — AI assistant chat for the business dashboard.
 *
 *   GET  /api/assistant/suggestions?page=…   page- and data-aware starter questions
 *   POST /api/assistant/chat                 one assistant turn (calls Claude)
 *
 * Both require an authenticated business. The Anthropic API key is read
 * server-side only; the frontend never sees it.
 */

const { Router } = require('express');
const { body, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const { requireBusiness } = require('../middleware/auth');
const assistant = require('../services/assistantService');

const router = Router();

router.use(requireBusiness);

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}
function fail(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}

// Claude calls cost money — keep a tighter limit than the global one.
const chatLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, code: 'RATE_LIMITED', message: 'You are sending messages too quickly. Please wait a moment.' },
});

const VALID_PAGES = ['dashboard', 'analytics', 'offers', 'smart-specials', 'sensors'];
function normalizePage(p) {
  return VALID_PAGES.includes(p) ? p : 'dashboard';
}

// ---------------------------------------------------------------------------
// GET /api/assistant/suggestions
// ---------------------------------------------------------------------------

router.get(
  '/suggestions',
  [query('page').optional().isString()],
  async (req, res) => {
    const page = normalizePage(req.query.page);
    try {
      const ctx = await assistant.gatherContext(req.business.id, req.business.tier);
      return ok(res, {
        configured:  assistant.isConfigured(),
        suggestions: assistant.buildSuggestions(ctx, page),
      });
    } catch (err) {
      console.error('[assistant/suggestions]', err);
      // Suggestions are non-critical — degrade quietly instead of erroring.
      return ok(res, { configured: assistant.isConfigured(), suggestions: [] });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/assistant/chat
// ---------------------------------------------------------------------------

router.post(
  '/chat',
  chatLimiter,
  [
    body('messages').isArray({ min: 1, max: 20 }).withMessage('messages must be a non-empty array.'),
    body('messages.*.role').isIn(['user', 'assistant']).withMessage('Each message needs a valid role.'),
    body('messages.*.content').isString().notEmpty().withMessage('Each message needs content.'),
    body('page').optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg);

    if (!assistant.isConfigured()) {
      return fail(res, 503, 'NOT_CONFIGURED', 'The AI assistant is not available right now.');
    }

    try {
      const { reply } = await assistant.chat({
        businessId: req.business.id,
        tier:       req.business.tier,
        messages:   req.body.messages,
        page:       normalizePage(req.body.page),
      });
      return ok(res, { reply });
    } catch (err) {
      if (err.code === 'EMPTY') return fail(res, 400, 'EMPTY', 'No message to respond to.');
      if (err.code === 'NOT_CONFIGURED') {
        return fail(res, 503, 'NOT_CONFIGURED', 'The AI assistant is not available right now.');
      }
      if (err.status === 429) {
        return fail(res, 429, 'AI_RATE_LIMITED', 'The assistant is busy. Please try again shortly.');
      }
      console.error('[assistant/chat]', err);
      return fail(res, 500, 'SERVER_ERROR', 'The assistant ran into a problem. Please try again.');
    }
  }
);

module.exports = router;
