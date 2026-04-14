import React, { useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCountdown } from '../hooks/useCountdown';
import { useToast } from '../context/ToastContext';
import { resolveImageUrl } from '../utils/imageUrl';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TINY_WORDS = new Set(['a','an','the','and','but','or','for','nor','at','to','by','in','of','up','as','via']);

function toTitleCase(str) {
  if (!str) return str;
  return str.toLowerCase().replace(/(?:^|\s)\S/g, (ch, idx) => {
    const word = str.toLowerCase().slice(idx).split(/\s/)[0];
    if (idx > 0 && TINY_WORDS.has(word)) return ch;
    return ch.toUpperCase();
  });
}

function fmt(price) {
  if (price == null) return null;
  return `£${parseFloat(price).toFixed(2)}`;
}

function formatExpiryFull(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  const now   = new Date();
  const pad   = (n) => String(n).padStart(2, '0');
  const h     = date.getHours();
  const min   = pad(date.getMinutes());
  const ampm  = h >= 12 ? 'pm' : 'am';
  const hr    = h % 12 || 12;
  const time  = min === '00' ? `${hr}${ampm}` : `${hr}:${min}${ampm}`;

  const isToday = date.toDateString() === now.toDateString();
  const tom     = new Date(now); tom.setDate(now.getDate() + 1);
  const isTom   = date.toDateString() === tom.toDateString();

  if (isToday) {
    const period = h < 12 ? 'this morning' : h < 17 ? 'this afternoon' : 'tonight';
    return `Expires ${period} at ${time}`;
  }
  if (isTom) return `Expires tomorrow at ${time}`;
  const d = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  return `Expires ${d} at ${time}`;
}

// ---------------------------------------------------------------------------
// Fullscreen code overlay
// ---------------------------------------------------------------------------

function FullscreenCode({ code, onClose }) {
  return (
    <div className="cc-fullscreen" onClick={onClose}>
      <div className="cc-fullscreen-inner">
        <div className="cc-fullscreen-label">Show this to staff</div>
        <div className="cc-fullscreen-code">{code}</div>
        <div className="cc-fullscreen-hint">Tap anywhere to close</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CouponClaimed() {
  const { state } = useLocation();
  const navigate  = useNavigate();
  const { toast } = useToast();

  const [copied, setCopied]         = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Guard — direct navigation without state
  if (!state?.coupon) {
    navigate('/coupons', { replace: true });
    return null;
  }

  const { coupon, offer, business, businessLat, businessLng } = state;

  const countdown = useCountdown(offer?.expires_at);
  const expiryFull = formatExpiryFull(offer?.expires_at);

  const saveAmount = (offer.original_price != null && offer.offer_price != null)
    ? parseFloat(offer.original_price) - parseFloat(offer.offer_price)
    : null;

  const savingLabel = saveAmount != null && saveAmount > 0
    ? fmt(saveAmount)
    : offer.discount_percent != null
    ? `${Math.round(offer.discount_percent)}% off`
    : offer.offer_price != null
    ? fmt(offer.offer_price)
    : 'Free';

  function handleCopy() {
    navigator.clipboard?.writeText(coupon.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast({ type: 'error', title: 'Copy failed', message: 'Tap and hold the code to copy manually.' });
    });
  }

  const openDirections = useCallback(() => {
    if (!businessLat || !businessLng) return;
    navigate('/navigate', {
      state: { destLat: businessLat, destLng: businessLng, businessName: business.name, mode: 'walking' },
    });
  }, [businessLat, businessLng, business, navigate]);

  return (
    <>
      {fullscreen && <FullscreenCode code={coupon.code} onClose={() => setFullscreen(false)} />}

      <div className="cc-page">

        {/* ── Success banner ── */}
        <div className="cc-banner">
          <div className="cc-banner-tick">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div>
            <div className="cc-banner-title">Offer claimed!</div>
            <div className="cc-banner-sub">Your coupon is ready to use</div>
          </div>
        </div>

        {/* ── Ticket card ── */}
        <div className="cc-card-wrap">
          <div className="cc-card">

            {/* Top: business + offer */}
            <div className="cc-card-top">
              <div className="cc-logo-row">
                <div className="cc-logo-wrap">
                  {business.logo_url
                    ? <img src={resolveImageUrl(business.logo_url)} alt={business.name} />
                    : <div className="cc-logo-placeholder">🏪</div>
                  }
                </div>
                <div>
                  <div className="cc-card-biz">{business.name}</div>
                  <div className="cc-card-title">{toTitleCase(offer.title)}</div>
                </div>
              </div>

              {/* Stats row inside the ticket top */}
              <div className="cc-ticket-stats">
                {countdown && (
                  <div className={`cc-ticket-stat cc-ticket-stat-expiry${countdown.urgent ? ' cc-ticket-stat-urgent' : ''}`}>
                    <span className="cc-ticket-stat-icon">⏱</span>
                    <span className="cc-ticket-stat-label">Expires</span>
                    <span className="cc-ticket-stat-value">
                      {countdown.expired ? 'Expired' : countdown.label}
                    </span>
                  </div>
                )}
                <div className="cc-ticket-stat">
                  <span className="cc-ticket-stat-icon">💰</span>
                  <span className="cc-ticket-stat-label">Saving</span>
                  <span className="cc-ticket-stat-value">{savingLabel}</span>
                </div>
                <div className="cc-ticket-stat">
                  <span className="cc-ticket-stat-icon">🔒</span>
                  <span className="cc-ticket-stat-label">Use</span>
                  <span className="cc-ticket-stat-value">Single</span>
                </div>
              </div>
            </div>

            {/* Tear-line */}
            <div className="cc-tear">
              <div className="cc-tear-notch cc-tear-notch-left" />
              <div className="cc-tear-line" />
              <div className="cc-tear-notch cc-tear-notch-right" />
            </div>

            {/* Bottom: code */}
            <div className="cc-card-bottom">
              <div className="cc-code-label">Your coupon code</div>
              <div className="cc-code-box">
                <span className="cc-code">{coupon.code}</span>
                <button
                  className={`cc-copy-btn${copied ? ' cc-copied' : ''}`}
                  onClick={handleCopy}
                  aria-label="Copy code"
                >
                  {copied
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  }
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              {/* Tap to enlarge */}
              <button className="cc-enlarge-btn" onClick={() => setFullscreen(true)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                  <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
                Tap to enlarge for staff
              </button>
            </div>

          </div>
        </div>

        {/* ── Expiry warning strip ── */}
        {expiryFull && (
          <div className={`cc-expiry-strip${countdown?.urgent ? ' cc-expiry-urgent' : ''}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {expiryFull}
          </div>
        )}

        {/* ── How to redeem ── */}
        <div className="cc-section">
          <div className="cc-section-title">How to redeem</div>
          <div className="cc-steps">
            {[
              'Go to the business and open this screen',
              'Show your unique code to a member of staff',
              'Staff enter the code and the offer is applied',
            ].map((text, i) => (
              <div key={i} className="cc-step">
                <div className="cc-step-num">{i + 1}</div>
                <div className="cc-step-text">{text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Get directions ── */}
        {businessLat && businessLng && (
          <div className="cc-section" style={{ paddingTop: 0 }}>
            <button className="cc-directions-btn" onClick={openDirections}>
              <span>📍</span>
              <div>
                <div className="cc-directions-label">Get directions to {business.name}</div>
                {(business.address || business.city) && (
                  <div className="cc-directions-sub">
                    {[business.address, business.city].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        )}

        {/* ── Single-use warning ── */}
        <div className="cc-warning">
          <span>⚠️</span>
          <span className="cc-warning-text">
            Single use only — this code expires once redeemed and cannot be used again.
          </span>
        </div>

        <div style={{ height: 20 }} />
      </div>
    </>
  );
}
