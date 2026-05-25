'use strict';

const pool = require('../db/pool');

const MIN_REVIEWS_FOR_PUBLIC = 5;

async function submitReview(userId, { couponId, rating, comment }) {
  const { rows: coupon } = await pool.query(
    `SELECT c.id, c.offer_id, o.business_id
     FROM coupons c JOIN offers o ON o.id = c.offer_id
     WHERE c.id = $1 AND c.user_id = $2 AND c.status = 'redeemed'`,
    [couponId, userId]
  );
  if (coupon.length === 0) {
    const err = new Error('You can only review a business after redeeming a coupon there.');
    err.status = 403;
    throw err;
  }

  const bizId = coupon[0].business_id;

  const { rows } = await pool.query(
    `INSERT INTO business_reviews (business_id, user_id, coupon_id, rating, comment)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [bizId, userId, couponId, rating, comment || null]
  );

  await updateBusinessRating(bizId);

  return rows[0];
}

async function updateBusinessRating(businessId) {
  const { rows } = await pool.query(
    `SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*)::int AS review_count
     FROM business_reviews WHERE business_id = $1 AND is_public = true`,
    [businessId]
  );

  const avg = rows[0].avg_rating ? parseFloat(rows[0].avg_rating) : null;
  const count = rows[0].review_count;
  const visible = count >= MIN_REVIEWS_FOR_PUBLIC;

  await pool.query(
    `UPDATE businesses SET avg_rating = $1, review_count = $2, rating_visible = $3, updated_at = NOW() WHERE id = $4`,
    [avg, count, visible, businessId]
  );

  return { avg_rating: avg, review_count: count, rating_visible: visible };
}

async function getBusinessReviews(businessId, { limit = 20, offset = 0 } = {}) {
  const { rows: stats } = await pool.query(
    `SELECT avg_rating, review_count, rating_visible FROM businesses WHERE id = $1`,
    [businessId]
  );

  const { rows } = await pool.query(
    `SELECT r.id, r.rating, r.comment, r.created_at,
            u.first_name, u.last_name
     FROM business_reviews r
     JOIN users u ON u.id = r.user_id
     WHERE r.business_id = $1 AND r.is_public = true
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [businessId, limit, offset]
  );

  return {
    avg_rating: stats[0]?.avg_rating ? parseFloat(stats[0].avg_rating) : null,
    review_count: stats[0]?.review_count || 0,
    rating_visible: stats[0]?.rating_visible || false,
    reviews: rows,
  };
}

async function canReview(userId, couponId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM business_reviews WHERE user_id = $1 AND coupon_id = $2`,
    [userId, couponId]
  );
  return rows.length === 0;
}

module.exports = { submitReview, getBusinessReviews, canReview, updateBusinessRating, MIN_REVIEWS_FOR_PUBLIC };
