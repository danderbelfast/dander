import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSavedOffers } from '../api/offers';
import { OfferCard } from '../components/offers/OfferCard';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../context/ToastContext';

export default function SavedOffers() {
  const navigate    = useNavigate();
  const { toast }   = useToast();
  const [offers, setOffers]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getSavedOffers();
      setOffers(data.offers || []);
    } catch {
      toast({ type: 'error', title: 'Error', message: 'Could not load saved offers.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginRight: 8 }}>←</button>
        Saved
      </div>

      {loading ? (
        <div className="loading-center"><Spinner size="lg" /></div>
      ) : offers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🤍</div>
          <div className="empty-state-title">Nothing saved yet</div>
          <p className="empty-state-body">
            Tap the heart icon on any offer to save it for later.
          </p>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => navigate('/home')}>
            Browse offers
          </button>
        </div>
      ) : (
        <div className="offer-list">
          {offers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              saved={true}
              onSaveToggle={(id) => {
                setOffers((prev) => prev.filter((o) => o.id !== id));
                toast({ type: 'success', title: 'Removed', message: 'Offer removed from saved.' });
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
