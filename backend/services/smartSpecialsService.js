'use strict';

/**
 * smartSpecialsService.js — Claude Vision-driven offer copy.
 *
 * The owner picks an offer type and value first (discount % / fixed £ /
 * freebie text / urgency). They upload a photo. Claude Vision analyses
 * the photo *for marketing copy only* — it never proposes a different
 * discount or value. The owner sees the suggestion, can edit it freely,
 * then explicitly hits Post to create the offer.
 *
 * Returns an assessment row: { id, photo_url, offer_type, offer_value,
 * suggested_title, suggested_description, photo_summary, confidence }.
 *
 * If the Claude call fails, the assessment row is still created (with
 * empty suggestions) so the owner can write their own copy by hand. The
 * route layer surfaces an error flag to the UI.
 */

const Anthropic = require('@anthropic-ai/sdk');
const pool      = require('../db/pool');

const MODEL      = 'claude-opus-4-7';
const MAX_TOKENS = 1024;

let _client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic();
  return _client;
}

const VALID_OFFER_TYPES = new Set(['discount', 'freebie', 'urgency']);

const SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    title:         { type: 'string', maxLength: 120 },
    description:   { type: 'string', maxLength: 400 },
    confidence:    { type: 'integer', minimum: 0, maximum: 100 },
    photo_summary: { type: 'string', maxLength: 400 },
  },
  required: ['title', 'description', 'confidence', 'photo_summary'],
  additionalProperties: false,
};

function buildSystemPrompt({ businessName, businessCategory, offerType, offerValue }) {
  const valueLine = offerValue
    ? `The owner has chosen this offer: ${describeOffer(offerType, offerValue)}.`
    : `The offer is an urgency / call-to-action — no discount or freebie value.`;

  return [
    `You write short, punchy offer copy for "${businessName || 'a local business'}"`,
    `(category: ${businessCategory || 'general retail'}). You analyse the supplied`,
    'photo and produce marketing copy only.',
    '',
    valueLine,
    '',
    'Hard rules:',
    '- Write a title of at most 8 words.',
    '- Write a description of at most 20 words.',
    '- Reflect what is actually visible in the photo.',
    '- Use the offer type and value the owner already chose. NEVER suggest a',
    '  different discount, price, freebie, or value.',
    '- Be concrete and inviting. No emojis. No exclamation marks unless natural.',
    '- The photo_summary is a one-sentence factual description of what you see',
    '  (e.g. "Tray of fresh croissants on a wooden board"). The owner sees this',
    '  for transparency.',
    '- confidence: 0-100, how well the photo matches the chosen offer.',
    '',
    'Return JSON only, matching the supplied schema.',
  ].join('\n');
}

function describeOffer(offerType, offerValue) {
  switch (offerType) {
    case 'discount': return `${offerValue} off`;
    case 'freebie':  return offerValue; // already a freebie phrase like "free coffee with any cake"
    case 'urgency':  return 'an urgency / awareness message';
    default:         return offerValue || '';
  }
}

function buildUserContent({ photoUrl, photoBase64, photoMediaType }) {
  const image = photoUrl
    ? { type: 'image', source: { type: 'url', url: photoUrl } }
    : { type: 'image', source: { type: 'base64', media_type: photoMediaType || 'image/jpeg', data: photoBase64 } };

  return [
    image,
    {
      type: 'text',
      text: 'Look at this photo and write the offer copy. Return JSON only.',
    },
  ];
}

/**
 * Run Claude Vision against the photo, returning { title, description,
 * confidence, photo_summary } or null if the call fails / the key is unset.
 */
async function generateSuggestion({
  businessName, businessCategory, offerType, offerValue,
  photoUrl, photoBase64, photoMediaType,
}) {
  const client = getClient();
  if (!client) return null;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', name: 'offer_copy', schema: SUGGESTION_SCHEMA },
      },
      system: buildSystemPrompt({ businessName, businessCategory, offerType, offerValue }),
      messages: [
        { role: 'user', content: buildUserContent({ photoUrl, photoBase64, photoMediaType }) },
      ],
    });

    // Prefer the structured-outputs convenience if present, otherwise parse
    // the text block (Claude returns JSON conforming to the schema either way).
    if (response.parsed_output) return response.parsed_output;

    const textBlock = (response.content || []).find((b) => b.type === 'text');
    if (!textBlock) return null;
    try {
      return JSON.parse(textBlock.text);
    } catch {
      return null;
    }
  } catch (err) {
    console.error('[smartSpecials] Claude Vision call failed:', err.message);
    return null;
  }
}

/**
 * Validate the owner's offer-type + value pair. Throws with a code the
 * route layer can surface as 400.
 */
function validateOffer(offerType, offerValue) {
  if (!VALID_OFFER_TYPES.has(offerType)) {
    const e = new Error('offer_type must be discount, freebie, or urgency');
    e.code = 'VALIDATION_ERROR';
    e.status = 400;
    throw e;
  }
  if (offerType === 'discount' || offerType === 'freebie') {
    if (!offerValue || typeof offerValue !== 'string' || !offerValue.trim()) {
      const e = new Error('offer_value is required for discount and freebie offers');
      e.code = 'VALIDATION_ERROR';
      e.status = 400;
      throw e;
    }
  }
}

/**
 * Look up the business name + category for the prompt. Cheap.
 */
async function getBusinessContext(businessId) {
  const { rows } = await pool.query(
    'SELECT name, category FROM businesses WHERE id = $1',
    [businessId]
  );
  return rows[0] || { name: null, category: null };
}

/**
 * Main entry: take a photo + the owner's chosen offer, produce a
 * suggestion (via Claude), persist a photo_assessments row, and return it.
 *
 * The caller has already validated the photo / uploaded it to storage,
 * and supplies a publicly-fetchable photoUrl (preferred) or photoBase64.
 *
 * @param {object} args
 * @param {number} args.businessId
 * @param {string} [args.photoUrl]
 * @param {string} [args.photoBase64]
 * @param {string} [args.photoMediaType='image/jpeg']
 * @param {('discount'|'freebie'|'urgency')} args.offerType
 * @param {string|null} args.offerValue
 *
 * @returns {Promise<{
 *   id: number, photo_url: string,
 *   offer_type: string, offer_value: string|null,
 *   suggested_title: string, suggested_description: string,
 *   photo_summary: string, confidence: number,
 *   ai_available: boolean,
 * }>}
 */
async function assessPhoto({
  businessId, photoUrl, photoBase64, photoMediaType,
  offerType, offerValue,
}) {
  validateOffer(offerType, offerValue);
  if (!photoUrl && !photoBase64) {
    const e = new Error('photoUrl or photoBase64 is required');
    e.code = 'VALIDATION_ERROR';
    e.status = 400;
    throw e;
  }

  const biz = await getBusinessContext(businessId);

  const suggestion = await generateSuggestion({
    businessName:     biz.name,
    businessCategory: biz.category,
    offerType,
    offerValue,
    photoUrl,
    photoBase64,
    photoMediaType,
  });

  const aiAvailable = suggestion !== null;
  const title         = suggestion?.title         || '';
  const description   = suggestion?.description   || '';
  const photoSummary  = suggestion?.photo_summary || '';
  const confidence    = typeof suggestion?.confidence === 'number'
    ? Math.max(0, Math.min(100, Math.round(suggestion.confidence)))
    : 0;

  // Persist — photo_url is stored as-is when supplied. For base64-only flows
  // the route layer should upload first and pass a URL; we don't store base64
  // bytes in the DB.
  const { rows } = await pool.query(
    `INSERT INTO photo_assessments
       (business_id, photo_url, offer_type, offer_value,
        suggested_title, suggested_description, photo_summary,
        items_detected, freshness_flags, suggested_offers, offers_approved)
     VALUES ($1, $2, $3, $4, $5, $6, $7, '[]', '[]', '[]', 0)
     RETURNING id, business_id, photo_url, offer_type, offer_value,
               suggested_title, suggested_description, photo_summary,
               assessed_at`,
    [businessId, photoUrl || '', offerType, offerValue || null,
     title, description, photoSummary]
  );

  return {
    ...rows[0],
    confidence,
    ai_available: aiAvailable,
  };
}

/**
 * Mark an assessment as approved and posted. Records who approved it and
 * whether the owner edited the suggested copy. Returns the updated row.
 */
async function markApproved({ assessmentId, businessId, userId, ownerEdited }) {
  const { rows } = await pool.query(
    `UPDATE photo_assessments
     SET approved_at     = NOW(),
         approved_by     = $1,
         owner_edited    = $2,
         offers_approved = offers_approved + 1
     WHERE id = $3 AND business_id = $4
     RETURNING *`,
    [userId, !!ownerEdited, assessmentId, businessId]
  );
  return rows[0] || null;
}

async function getHistory(businessId, limit = 30) {
  const { rows } = await pool.query(
    `SELECT id, photo_url, offer_type, offer_value,
            suggested_title, suggested_description, photo_summary,
            owner_edited, approved_at, assessed_at
     FROM photo_assessments
     WHERE business_id = $1
     ORDER BY assessed_at DESC
     LIMIT $2`,
    [businessId, limit]
  );
  return rows;
}

module.exports = {
  assessPhoto,
  markApproved,
  getHistory,
  validateOffer,
  VALID_OFFER_TYPES,
};
