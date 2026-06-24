import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyOffers, stitchActivations } from '../api/offers';
import { getAnonId } from '../services/anonId';
import { Spinner } from '../components/ui/Spinner';
import { resolveImageUrl } from '../utils/imageUrl';

// My Offers — the customer's activated offers (Lidl-style), to apply at the
// till. Replaces the retired Coupons tab. Activated offers auto-hide at offer
// expiry (server filters); expired rows are retained server-side for analytics.
export default function MyOffers() {
  const navigate = useNavigate();
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Stitch first so an offer just activated anonymously (then signed up for)
      // is owned by this user before we fetch — guarantees it shows on landing.
      // Idempotent with the login-time stitch.
      try { await stitchActivations(getAnonId()); } catch { /* ignore */ }
      try {
        const d = await getMyOffers();
        if (alive) setOffers(Array.isArray(d.offers) ? d.offers : []);
      } catch { if (alive) setError(true); }
    })();
    return () => { alive = false; };
  }, []);

  if (error) return (
    <div className="page" style={{ padding: 24, textAlign: 'center' }}>
      <div className="empty-state"><div className="empty-state-icon">😕</div>
        <div className="empty-state-title">Couldn't load your offers</div></div>
    </div>
  );
  if (offers === null) return (
    <div className="page" style={{ justifyContent: 'center', alignItems: 'center' }}><Spinner /></div>
  );

  return (
    <div className="page" style={{ padding: 16, overflowY: 'auto' }}>
      <h1 className="auth-title" style={{ marginBottom: 4 }}>My Offers</h1>
      <p className="text-muted" style={{ marginBottom: 16 }}>Activated offers — show up and ask staff to apply them at the till.</p>
      {offers.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <div className="empty-state-icon">🏷️</div>
          <div className="empty-state-title">No activated offers yet</div>
          <p className="text-muted">Activate offers from Discover and they'll appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {offers.map((o) => (
            <div key={o.id} className="offer-card" role="button" tabIndex={0}
              onClick={() => navigate(`/offer/${o.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/offer/${o.id}`); } }}>
              <div className="offer-card-img">
                {o.image_url ? <img src={resolveImageUrl(o.image_url)} alt={o.title} loading="lazy" />
                  : <div className="offer-card-img-placeholder">🏪</div>}
              </div>
              <div className="offer-card-body">
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>{o.business_name}</div>
                <div className="offer-card-title">{o.title}</div>
                <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: '0.8rem', fontWeight: 700, color: '#1f9d55' }}>
                  Activated ✓
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
