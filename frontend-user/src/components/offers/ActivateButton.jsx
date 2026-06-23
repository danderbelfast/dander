import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { activateOffer, deactivateOffer } from '../../api/offers';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getAnonId } from '../../services/anonId';
import { setReturnPath } from '../../services/returnPath';
import { resolveActivationChannel } from '../../utils/activationChannel';

// Capture-first activation control. Authed → toggles activation. Anon →
// captures the intent against anon_id (the funnel signal) then nudges sign-in
// to persist into My Offers (stitched on login). Channel from the URL (?src).
export default function ActivateButton({ offerId, initialActivated = false, className = '', returnTo }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuth } = useAuth();
  const { toast } = useToast();
  const [activated, setActivated] = useState(initialActivated);
  const [busy, setBusy] = useState(false);

  async function onClick(e) {
    e.preventDefault(); e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const channel = resolveActivationChannel(params);
    try {
      if (isAuth) {
        if (activated) { await deactivateOffer(offerId); setActivated(false); }
        else           { await activateOffer(offerId, { channel }); setActivated(true); }
      } else {
        await activateOffer(offerId, { channel, anonId: getAnonId() });
        setActivated(true);
        // Toast has no action button (see ToastContext) — plain nudge; the
        // persistent "Sign in to save" link below is the real affordance.
        toast({ type: 'success', title: 'Activated!', message: 'Sign in to save it to My Offers.' });
      }
    } catch {
      toast({ type: 'error', title: 'Something went wrong', message: 'Could not activate this offer.' });
    } finally {
      setBusy(false);
    }
  }

  function goSignIn() {
    setReturnPath(returnTo || '/my-offers');
    navigate('/login');
  }

  return (
    <>
      <button
        className={`btn ${activated ? 'btn-secondary' : 'btn-primary'} ${className}`.trim()}
        onClick={onClick}
        disabled={busy}
        aria-pressed={activated}
      >
        {activated ? 'Activated ✓' : 'Activate'}
      </button>
      {!isAuth && activated && (
        <button type="button" className="btn btn-ghost" style={{ marginTop: 6 }} onClick={goSignIn}>
          Sign in to save
        </button>
      )}
    </>
  );
}
