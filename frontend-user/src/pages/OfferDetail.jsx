import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getOffer, recordView, saveOffer, unsaveOffer, trackShare } from '../api/offers';
import { useOptionalLocation } from '../context/LocationContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useCountdown } from '../hooks/useCountdown';
import { ExpandableSection } from '../components/ui/ExpandableSection';
import { Spinner } from '../components/ui/Spinner';
import { PUBLIC_APP_URL } from '../config';
import { usePwa } from '../context/PwaInstallContext';
import { resolveImageUrl } from '../utils/imageUrl';
import ActivateButton from '../components/offers/ActivateButton';

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

const OFFER_TYPE_LABELS = {
  free_item:  'Free item',
  percentage: '% off',
  fixed:      'Price deal',
};

function offerTypeLabel(type) {
  return OFFER_TYPE_LABELS[type] || (type ? toTitleCase(type.replace(/_/g, ' ')) : null);
}

function fmt(price) {
  return price != null ? `£${parseFloat(price).toFixed(2)}` : null;
}

function formatDistance(m) {
  if (m == null) return null;
  return m < 1000 ? `${Math.round(m)}m away` : `${(m / 1000).toFixed(1)}km away`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OfferDetail() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const locationCtx = useOptionalLocation();
  const location = locationCtx?.location ?? null;
  const { toast }    = useToast();
  const { isAuth }   = useAuth();
  const { trackOfferView } = usePwa();

  const [offer, setOffer]             = useState(null);
  const [loading, setLoading]         = useState(true);
  const [saved, setSaved]             = useState(false);
  const [savingState, setSavingState] = useState(false);
  const [showDirections, setShowDirections] = useState(false);

  const countdown = useCountdown(offer?.expires_at);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getOffer(id);
        if (!cancelled) {
          setOffer(data.offer);
          setSaved(data.offer.is_saved ?? false);
        }
        recordView(id).catch(() => {});
        trackOfferView();
      } catch {
        // leave offer null → "Offer not found" UI below
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  async function toggleSave() {
    if (savingState) return;
    setSavingState(true);
    try {
      if (saved) { await unsaveOffer(id); setSaved(false); }
      else       { await saveOffer(id);   setSaved(true);  }
    } catch {
      toast({ type: 'error', title: 'Something went wrong', message: 'Could not save this offer.' });
    } finally {
      setSavingState(false);
    }
  }

  async function handleShare() {
    const shareUrl = `${PUBLIC_APP_URL}/o/${id}`;
    const shareText = `Check out this deal: ${offer.title} at ${offer.business_name}`;
    trackShare(id).catch(() => {});
    if (navigator.share) {
      try {
        await navigator.share({ title: offer.title, text: shareText, url: shareUrl });
      } catch {}
    } else {
      await navigator.clipboard.writeText(shareUrl).catch(() => {});
      toast({ type: 'success', title: 'Link copied', message: 'Share link copied to clipboard.' });
    }
  }

  const openNavigation = useCallback((mode) => {
    const destLat = offer?.business_lat ?? offer?.lat;
    const destLng = offer?.business_lng ?? offer?.lng;
    if (!destLat || !destLng) return;
    setShowDirections(false);
    navigate('/navigate', {
      state: { destLat, destLng, businessName: offer.business_name, mode, startLat: location?.lat, startLng: location?.lng },
    });
  }, [offer, navigate, location]);

  if (loading) return (
    <div className="page-full" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <Spinner size="lg" />
    </div>
  );

  if (!offer) return (
    <div className="page-full" style={{ padding: 24 }}>
      <button className="btn btn-ghost" onClick={() => navigate(-1)}>← Back</button>
      <div className="empty-state">
        <div className="empty-state-icon">😕</div>
        <div className="empty-state-title">Offer not found</div>
      </div>
    </div>
  );

  const isUrgent   = countdown && !countdown.expired && countdown.urgent;
  const isExpired  = countdown?.expired;

  const saveAmount = (offer.original_price != null && offer.offer_price != null)
    ? parseFloat(offer.original_price) - parseFloat(offer.offer_price)
    : null;

  const typeLabel = offerTypeLabel(offer.offer_type);
  const distLabel = formatDistance(offer.distance_meters);

  return (
    <div className="page-full" style={{ paddingBottom: 0 }}>

      {/* ── Fixed floating buttons ── */}
      <button className="detail-back" onClick={() => navigate(-1)} aria-label="Back">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>

      <div style={{ position: 'fixed', top: 'calc(var(--safe-top, 0px) + 12px)', right: 16, zIndex: 50, display: 'flex', gap: 8 }}>
        <button className="detail-share-btn" onClick={handleShare} aria-label="Share">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>
        {isAuth && (
          <button className="detail-save-btn" onClick={toggleSave} aria-label={saved ? 'Unsave' : 'Save'} style={{ position: 'static' }}>
            <svg width="18" height="18" viewBox="0 0 24 24"
              fill={saved ? 'var(--c-primary)' : 'none'}
              stroke={saved ? 'var(--c-primary)' : '#999'}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── Hero image ── */}
      <div className="detail-cover">
        {offer.image_url
          ? <img src={resolveImageUrl(offer.image_url)} alt={offer.title} />
          : <div className="detail-cover-placeholder">🏪</div>
        }
        {typeLabel && (
          <span className="detail-type-badge">{typeLabel}</span>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div className="detail-body">

        {/* Business row: small logo + name */}
        <div className="detail-biz-row">
          <div className="detail-biz-logo">
            {offer.business_logo_url
              ? <img src={resolveImageUrl(offer.business_logo_url)} alt={offer.business_name} />
              : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '1rem' }}>🏪</span>
            }
          </div>
          <span className="detail-biz">{offer.business_name}</span>
        </div>

        {/* Title */}
        <h1 className="detail-title">{toTitleCase(offer.title)}</h1>

        {/* Price row */}
        {(offer.offer_price != null || offer.original_price != null || offer.discount_percent != null) && (
          <div className="detail-price-row">
            {/* Original price struck through */}
            {offer.original_price != null && (
              <span className="detail-original">{fmt(offer.original_price)}</span>
            )}
            {/* New / offer price */}
            {offer.offer_price != null && (
              <span className="detail-price">{fmt(offer.offer_price)}</span>
            )}
            {/* Saving pill */}
            {saveAmount != null && saveAmount > 0 && (
              <span className="detail-save-pill">Save {fmt(saveAmount)}</span>
            )}
            {offer.discount_percent != null && saveAmount == null && (
              <span className="detail-save-pill">{Math.round(offer.discount_percent)}% OFF</span>
            )}
          </div>
        )}

        {/* Stat boxes */}
        <div className="detail-stats-row">
          {countdown && (
            <div className={`detail-stat${isUrgent ? ' detail-stat-urgent' : ''}`}>
              <div className="detail-stat-icon">⏱</div>
              <div className="detail-stat-label">Expires</div>
              <div className="detail-stat-value">{isExpired ? 'Expired' : countdown.label}</div>
            </div>
          )}
          {distLabel && (
            <div className="detail-stat">
              <div className="detail-stat-icon">📍</div>
              <div className="detail-stat-label">Distance</div>
              <div className="detail-stat-value">{distLabel}</div>
            </div>
          )}
        </div>

        {/* Description callout */}
        {offer.description && (
          <div className="detail-desc-callout">
            {offer.description}
          </div>
        )}

        {/* Directions */}
        {(offer.business_lat ?? offer.lat) && (
          <button className="btn-directions" onClick={() => setShowDirections(true)}>
            <span>📍</span> Get directions to {offer.business_name}
          </button>
        )}

        {/* Expandable sections */}
        <div style={{ marginTop: 4 }}>
          {offer.terms && (
            <ExpandableSection title="Terms & conditions">
              {offer.terms}
            </ExpandableSection>
          )}
<ExpandableSection title={`About ${offer.business_name}`}>
            <p>{offer.business_name} · {offer.business_address && `${offer.business_address}, `}{offer.business_city}</p>
            {offer.business_phone   && <p style={{ marginTop: 6 }}>📞 {offer.business_phone}</p>}
            {offer.business_website && <p style={{ marginTop: 6 }}>🌐 {offer.business_website}</p>}
          </ExpandableSection>
        </div>

      </div>

      {/* ── Fixed bottom CTA — offers redeem at the till (no in-app claim) ── */}
      <div className="detail-cta">
        <ActivateButton offerId={offer.id} offerTitle={offer.title} className="btn-block btn-lg" />
        <div style={{ width: '100%', marginTop: 10 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>🏪 Redeem in store</div>
          <div style={{ fontSize: '0.9rem', color: 'var(--c-text-muted)' }}>
            Visit {offer.business_name} and ask staff for this offer at the till — they'll apply the discount in person.
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)', marginTop: 6 }}>
            Tap in with TapProve to earn loyalty points on your spend.
          </div>
        </div>
      </div>

      {/* ── Directions sheet ── */}
      {showDirections && (
        <div className="sheet-overlay" onClick={() => setShowDirections(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title">Get directions to {offer.business_name}</div>
            <p className="sheet-subtitle">{offer.business_address}{offer.business_city ? `, ${offer.business_city}` : ''}</p>
            <button className="directions-btn" onClick={() => openNavigation('driving')}>
              <span className="directions-btn-icon">🚗</span>
              <div>
                <div className="directions-btn-label">Driving</div>
                <div className="directions-btn-sub">Turn-by-turn with voice</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button className="directions-btn" onClick={() => openNavigation('walking')}>
              <span className="directions-btn-icon">🚶</span>
              <div>
                <div className="directions-btn-label">Walking</div>
                <div className="directions-btn-sub">Step-by-step directions</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => setShowDirections(false)}>Cancel</button>
          </div>
        </div>
      )}

    </div>
  );
}
