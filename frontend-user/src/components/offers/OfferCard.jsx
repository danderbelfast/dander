import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCountdown } from '../../hooks/useCountdown';
import { resolveImageUrl } from '../../utils/imageUrl';
import { saveOffer, unsaveOffer } from '../../api/offers';
import { StoryOverlay } from '../ui/StoryOverlay';
import { StarDisplay, NewBadge } from '../ui/StarRating';
import ActivateButton from './ActivateButton';
import ShareSheet from './ShareSheet';

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
      fill={filled ? '#E85D26' : 'none'}
      stroke={filled ? '#E85D26' : '#999'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function BizAvatar({ offer, onClick }) {
  const hasStory = offer.has_story && offer.business_is_open !== false;
  const initial = (offer.business_name || '?')[0].toUpperCase();

  function handleClick(e) {
    if (!hasStory) return;
    e.stopPropagation();
    onClick?.();
  }

  return (
    <div
      className={`biz-avatar${hasStory ? ' biz-avatar-story' : ''}`}
      onClick={handleClick}
      style={hasStory ? { cursor: 'pointer' } : undefined}
    >
      {offer.business_logo_url
        ? <img src={resolveImageUrl(offer.business_logo_url)} alt={offer.business_name} />
        : <span>{initial}</span>
      }
    </div>
  );
}

// ---------------------------------------------------------------------------
// OfferCardH — compact horizontal card for swipeable rows
// ---------------------------------------------------------------------------

export function OfferCardH({ offer, saved, onSaveToggle }) {
  const navigate  = useNavigate();
  const countdown = useCountdown(offer.expires_at);
  const distLabel = formatDistance(offer.distance_meters);
  const [showStory, setShowStory] = useState(false);

  async function handleSave(e) {
    e.stopPropagation();
    try {
      if (saved) await unsaveOffer(offer.id);
      else       await saveOffer(offer.id);
      onSaveToggle?.(offer.id, !saved);
    } catch {}
  }

  return (
    <>
      <div
        className="offer-card-h"
        onClick={() => navigate(`/offer/${offer.id}`)}
        role="button"
        tabIndex={0}
      >
        <div className="offer-card-h-img">
          {offer.image_url
            ? <img src={resolveImageUrl(offer.image_url)} alt={offer.title} loading="lazy" />
            : <div className="offer-card-h-placeholder">{getEmoji(offer.category)}</div>
          }

          {/* Top-right: save button */}
          <button className="offer-card-h-save" onClick={handleSave} aria-label={saved ? 'Unsave' : 'Save'}>
            <HeartIcon filled={saved} />
          </button>
        </div>

        <div className="offer-card-h-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <BizAvatar offer={offer} onClick={() => setShowStory(true)} />
            <div className="offer-card-h-biz">{offer.business_name}</div>
          </div>
          <div className="offer-card-h-title">{toTitleCase(offer.title)}</div>
        </div>
      </div>

      {showStory && (
        <StoryOverlay
          businessId={offer.business_id}
          businessName={offer.business_name}
          onClose={() => setShowStory(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// OfferCard — full-width card for list / filtered views
// ---------------------------------------------------------------------------

export function OfferCard({ offer, saved, onSaveToggle }) {
  const navigate  = useNavigate();
  const countdown = useCountdown(offer.expires_at);
  const distLabel = formatDistance(offer.distance_meters);
  const [showStory, setShowStory] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  async function handleSave(e) {
    e.stopPropagation();
    try {
      if (saved) await unsaveOffer(offer.id);
      else       await saveOffer(offer.id);
      onSaveToggle?.(offer.id, !saved);
    } catch {}
  }

  const isClosed = offer.business_is_open === false;

  return (
    <>
      <div className="offer-card" onClick={() => navigate(`/offer/${offer.id}`)} role="button" tabIndex={0}
        style={isClosed ? { opacity: 0.65, filter: 'saturate(0.5)' } : undefined}>
        <div className="offer-card-img">
          {offer.image_url
            ? <img src={resolveImageUrl(offer.image_url)} alt={offer.title} loading="lazy" />
            : <div className="offer-card-img-placeholder">{getEmoji(offer.category)}</div>
          }

          {/* Top-right: save button */}
          <button className="offer-card-h-save" onClick={handleSave} aria-label={saved ? 'Unsave' : 'Save'}
            style={{ position: 'absolute', top: 10, right: 10, zIndex: 5 }}
          >
            <HeartIcon filled={saved} />
          </button>
        </div>

        <div className="offer-card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <BizAvatar offer={offer} onClick={() => setShowStory(true)} />
            <div className="offer-card-biz truncate">{offer.business_name}</div>
            {offer.business_rating_visible
              ? <StarDisplay rating={parseFloat(offer.business_avg_rating)} count={offer.business_review_count} visible={true} size={11} />
              : offer.business_review_count < 5 && <NewBadge />
            }
          </div>
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

            {isClosed ? (
              <span className="offer-card-meta-item" style={{ color: 'var(--c-text-dim)' }}>
                {offer.business_next_open ? `Opens ${offer.business_next_open}` : 'Closed'}
              </span>
            ) : offer.countdown_label && offer.show_countdown !== false ? (
              <span className={`offer-card-meta-item ${offer.countdown_urgency === 'red' || offer.countdown_urgency === 'pulse' ? 'offer-card-expiry-urgent' : ''}`}>
                {offer.countdown_label}
              </span>
            ) : countdown && !countdown.expired ? (
              <span className={`offer-card-meta-item ${countdown.urgent ? 'offer-card-expiry-urgent' : ''}`}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                {countdown.label}
              </span>
            ) : countdown?.expired ? (
              <span className="offer-card-meta-item text-dim">Expired</span>
            ) : null}

            <button className="offer-card-share-btn" onClick={(e) => {
              e.stopPropagation();
              setShareOpen(true);
            }} aria-label="Share">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
          </div>
          <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
            <ActivateButton offerId={offer.id} offerTitle={offer.title} />
          </div>
        </div>
      </div>

      {showStory && (
        <StoryOverlay
          businessId={offer.business_id}
          businessName={offer.business_name}
          onClose={() => setShowStory(false)}
        />
      )}

      <ShareSheet offerId={offer.id} title={offer.title}
        text={`Check out this deal: ${offer.title} at ${offer.business_name}`}
        open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  );
}
