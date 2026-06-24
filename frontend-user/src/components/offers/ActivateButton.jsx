import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { activateOffer, deactivateOffer } from '../../api/offers';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getAnonId } from '../../services/anonId';
import { setReturnIntent } from '../../services/postAuthIntent';
import { setAuthPrompt } from '../../services/authPrompt';
import { resolveActivationChannel } from '../../utils/activationChannel';
import { useActivatedOffers } from '../../context/ActivatedOffersContext';

// Activate = the attribution intent event. Authed → save to My Offers, stay put.
// Anon → capture the intent (funnel signal) THEN route to a value-framed register
// (the acquisition journey); after signup the offer is stitched onto the account
// and they land on My Offers. Channel from the URL (?src).
export default function ActivateButton({ offerId, offerTitle, className = '' }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuth } = useAuth();
  const { toast } = useToast();
  // Displayed state comes from the shared store (single source of truth), so an
  // already-activated offer reads "Activated ✓" everywhere it appears.
  const { isActivated, markActivated, markDeactivated } = useActivatedOffers();
  const activated = isActivated(offerId);
  const [busy, setBusy] = useState(false);

  async function onClick(e) {
    e.preventDefault(); e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const channel = resolveActivationChannel(params);
    try {
      if (isAuth) {
        if (activated) { await deactivateOffer(offerId); markDeactivated(offerId); }
        else {
          await activateOffer(offerId, { channel });
          markActivated(offerId);
          toast({ type: 'success', title: 'Saved to My Offers', message: 'Show it at the till to redeem.' });
        }
      } else {
        // Capture the anon intent first (funnel signal), then route to the
        // value-framed acquisition journey → register → stitch → My Offers.
        await activateOffer(offerId, { channel, anonId: getAnonId() });
        setAuthPrompt({ offerTitle: offerTitle ?? null });
        setReturnIntent('/my-offers');
        navigate('/register');
      }
    } catch {
      toast({ type: 'error', title: 'Something went wrong', message: 'Could not activate this offer.' });
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <button
      className={`btn ${activated ? 'btn-secondary' : 'btn-primary'} ${className}`.trim()}
      onClick={onClick}
      disabled={busy}
      aria-pressed={activated}
    >
      {activated ? 'Activated ✓' : 'Activate'}
    </button>
  );
}
