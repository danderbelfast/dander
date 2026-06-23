import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getBusinessOffers } from '../api/public';
import { Spinner } from '../components/ui/Spinner';
import { resolveImageUrl } from '../utils/imageUrl';
import ActivateButton from '../components/offers/ActivateButton';

function fmt(p) { return p != null ? `£${parseFloat(p).toFixed(2)}` : null; }

// Public per-business offers page. Reached from the window sticker
// (/business/:id/offers) and the post-earning overlay. No auth required to view.
export default function BusinessOffers() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    getBusinessOffers(id)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="page-full" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-full" style={{ padding: 24, textAlign: 'center' }}>
        <div className="empty-state">
          <div className="empty-state-icon">😕</div>
          <div className="empty-state-title">Couldn't load offers</div>
          <p className="text-muted">Please try again.</p>
        </div>
      </div>
    );
  }

  const name = data.business_name || 'this business';
  const offers = Array.isArray(data.offers) ? data.offers : [];

  return (
    <div className="page-full" style={{ overflowY: 'auto', padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px' }}>
        {data.business_logo_url
          ? <img src={resolveImageUrl(data.business_logo_url)} alt={name} style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover' }} />
          : <div style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1f29', fontSize: '1.4rem' }}>🏪</div>}
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>{name}</div>
          <div className="text-muted" style={{ fontSize: '0.9rem' }}>Latest offers</div>
        </div>
      </header>

      {offers.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <div className="empty-state-icon">🏷️</div>
          <div className="empty-state-title">No Offers Currently Available for {name}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {offers.map((o) => (
            <div
              key={o.id}
              className="offer-card"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/offer/${o.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/offer/${o.id}`); } }}
            >
              <div className="offer-card-img">
                {o.image_url
                  ? <img src={resolveImageUrl(o.image_url)} alt={o.title} loading="lazy" />
                  : <div className="offer-card-img-placeholder">🏪</div>}
              </div>
              <div className="offer-card-body">
                <div className="offer-card-title">{o.title}</div>
                {o.description && (
                  <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>{o.description}</div>
                )}
                {(o.offer_price != null || o.discount_percent != null) && (
                  <div style={{ marginTop: 6, fontWeight: 700, color: '#FF6B35' }}>
                    {o.offer_price != null ? fmt(o.offer_price) : `${Math.round(o.discount_percent)}% off`}
                  </div>
                )}
                <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                  <ActivateButton offerId={o.id} returnTo={`/business/${id}/offers`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
