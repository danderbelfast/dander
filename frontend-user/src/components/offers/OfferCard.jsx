import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCountdown } from '../../hooks/useCountdown';
import { CategoryIcon } from '../ui/CategoryIcon';
import { saveOffer, unsaveOffer } from '../../api/offers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDistance(m) {
  if (m == null) return null;
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

const TINY_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'at', 'to', 'by', 'in', 'of', 'up', 'as', 'via']);

function toTitleCase(str) {
  if (!str) return str;
  return str.toLowerCase().replace(/(?:^|\s)\S/g, (ch, idx) => {
    const word = str.toLowerCase().slice(idx).split(/\s/)[0];
    if (idx > 0 && TINY_WORDS.has(word)) return ch;
    return ch.toUpperCase();
  });
}

const CATEGORY_EMOJI = {
  'food & drink': '🍽', food: '🍽', drinks: '🍺', restaurant: '🍽', café: '☕', bakery: '🥖', 'bar & pub': '🍺',
  'beauty & wellness': '💆', 'health & beauty': '💆', beauty: '💆',
  'health & fitness': '🏋', fitness: '🏋', health: '💚',
  entertainment: '🎭',
  'retail & shopping': '🛍', retail: '🛍',
  services: '🔧',
  'experiences & leisure': '🎟',
};

function getEmoji(category = '') {
  return CATEGORY_EMOJI[category.toLowerCase()] || '🏪';
}

function HeartIcon({ filled }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24"
      fill={filled ? '#FF385C' : 'none'}
      stroke={filled ? '#FF385C' : '#999'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// OfferCardH — compact horizontal card for swipeable rows
// ---------------------------------------------------------------------------

export function OfferCardH({ offer, saved, onSaveToggle }) {
  const navigate  = useNavigate();
  const countdown = useCountdown(offer.expires_at);

  const discountLabel = offer.discount_percent
    ? `${Math.round(offer.discount_percent)}% OFF`
    : offer.offer_price != null
    ? `£${parseFloat(offer.offer_price).toFixed(2)}`
    : null;

  const distLabel = formatDistance(offer.distance_meters);

  async function handleSave(e) {
    e.stopPropagation();
    try {
      if (saved) await unsaveOffer(offer.id);
      else       await saveOffer(offer.id);
      onSaveToggle?.(offer.id, !saved);
    } catch {}
  }

  return (
    <div
      className="offer-card-h"
      onClick={() => navigate(`/offer/${offer.id}`)}
      role="button"
      tabIndex={0}
    >
      <div className="offer-card-h-img">
        {offer.image_url
          ? <img src={offer.image_url} alt={offer.title} loading="lazy" />
          : <div className="offer-card-h-placeholder">{getEmoji(offer.category)}</div>
        }

        {/* Top-left: discount badge */}
        {discountLabel && (
          <div className="offer-card-h-discount">{discountLabel}</div>
        )}

        {/* Top-right: save button */}
        <button className="offer-card-h-save" onClick={handleSave} aria-label={saved ? 'Unsave' : 'Save'}>
          <HeartIcon filled={saved} />
        </button>

        {/* Bottom-left: distance pill */}
        {distLabel && (
          <span className="offer-pill offer-pill-left">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 8 14 8 14s8-8.6 8-14a8 8 0 0 0-8-8z"/>
            </svg>
            {distLabel}
          </span>
        )}

        {/* Bottom-right: expiry pill */}
        {countdown && !countdown.expired && (
          <span className={`offer-pill offer-pill-right${countdown.urgent ? ' offer-pill-urgent' : ''}`}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {countdown.label}
          </span>
        )}
      </div>

      <div className="offer-card-h-body">
        <div className="offer-card-h-biz">{offer.business_name}</div>
        <div className="offer-card-h-title">{toTitleCase(offer.title)}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OfferCard — full-width card for list / filtered views
// ---------------------------------------------------------------------------

export function OfferCard({ offer, saved, onSaveToggle }) {
  const navigate  = useNavigate();
  const countdown = useCountdown(offer.expires_at);

  const discountLabel = offer.discount_percent
    ? `${Math.round(offer.discount_percent)}% OFF`
    : offer.offer_price != null
    ? `£${parseFloat(offer.offer_price).toFixed(2)}`
    : null;

  const distLabel = formatDistance(offer.distance_meters);

  async function handleSave(e) {
    e.stopPropagation();
    try {
      if (saved) await unsaveOffer(offer.id);
      else       await saveOffer(offer.id);
      onSaveToggle?.(offer.id, !saved);
    } catch {}
  }

  return (
    <div className="offer-card" onClick={() => navigate(`/offer/${offer.id}`)} role="button" tabIndex={0}>
      <div className="offer-card-img">
        {offer.image_url
          ? <img src={offer.image_url} alt={offer.title} loading="lazy" />
          : <div className="offer-card-img-placeholder">{getEmoji(offer.category)}</div>
        }

        <div className="offer-card-logo">
          {offer.business_logo_url
            ? <img src={offer.business_logo_url} alt={offer.business_name} />
            : <span style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                {getEmoji(offer.category)}
              </span>
          }
        </div>

        {offer.category && <CategoryIcon category={offer.category} bg={offer.icon_color || '#000000'} />}

        {/* Top-left: discount badge */}
        {discountLabel && (
          <div className="offer-card-discount">{discountLabel}</div>
        )}

        {/* Top-right: save button */}
        <button className="offer-card-h-save" onClick={handleSave} aria-label={saved ? 'Unsave' : 'Save'}
          style={{ position: 'absolute', top: 10, right: 10, zIndex: 5 }}
        >
          <HeartIcon filled={saved} />
        </button>

        {/* Bottom-left: distance pill */}
        {distLabel && (
          <span className="offer-pill offer-pill-left">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 8 14 8 14s8-8.6 8-14a8 8 0 0 0-8-8z"/>
            </svg>
            {distLabel}
          </span>
        )}

        {/* Bottom-right: expiry pill */}
        {countdown && !countdown.expired && (
          <span className={`offer-pill offer-pill-right${countdown.urgent ? ' offer-pill-urgent' : ''}`}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {countdown.label}
          </span>
        )}
      </div>

      <div className="offer-card-body">
        <div className="offer-card-biz truncate">{offer.business_name}</div>
        <div className="offer-card-title">{toTitleCase(offer.title)}</div>

        <div className="offer-card-meta">
          {distLabel && (
            <span className="offer-card-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 8 14 8 14s8-8.6 8-14a8 8 0 0 0-8-8z"/>
              </svg>
              {distLabel}
            </span>
          )}

          {countdown && !countdown.expired && (
            <span className={`offer-card-meta-item ${countdown.urgent ? 'offer-card-expiry-urgent' : ''}`}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              {countdown.label}
            </span>
          )}

          {countdown?.expired && (
            <span className="offer-card-meta-item text-dim">Expired</span>
          )}
        </div>
      </div>
    </div>
  );
}
