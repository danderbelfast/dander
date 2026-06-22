import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCheckInOverlay } from '../context/CheckInOverlayProvider';
import { nfcCheckin } from '../api/proximity';
import { getStrangerDisplay } from '../api/public';
import { clearPendingTap } from '../services/tapContext';
import TapLanding from '../components/checkin/TapLanding';
import { Spinner } from '../components/ui/Spinner';

// Transient /tap route. Authed users earn immediately and bounce to /home with
// the overlay over the top; unauthenticated users see the landing screen.
export default function Tap() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isAuth, loading } = useAuth();
  const { trigger, setOffer } = useCheckInOverlay();

  const node = params.get('node');
  const business = Number(params.get('business'));
  const validParams = !!node && Number.isFinite(business);

  const [error, setError] = useState(false);
  const fired = useRef(false); // guard against double check-in (StrictMode / re-render)

  useEffect(() => {
    if (loading) return;                  // wait for session restore
    if (!validParams) { navigate('/', { replace: true }); return; }
    if (!isAuth) return;                  // unauthenticated → render landing below
    if (fired.current) return;
    fired.current = true;

    nfcCheckin({ node, business })
      .then((result) => {
        trigger(result);
        clearPendingTap();
        navigate('/home', { replace: true });
        // Resolve the conditional "Browse offers" button after the reward shows.
        getStrangerDisplay(business)
          .then((info) => { if (info?.todays_offer) setOffer(info.todays_offer); })
          .catch(() => {});
      })
      .catch(() => { setError(true); });
  }, [loading, isAuth, validParams, node, business, navigate, trigger, setOffer]);

  if (loading || !validParams || (isAuth && validParams && !error)) {
    return (
      <div className="auth-page page-full" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-page page-full" style={{ justifyContent: 'center', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem' }}>&#128543;</div>
        <h2 className="font-head">Couldn&apos;t collect your points</h2>
        <p className="text-muted">Please try tapping again.</p>
        <button className="btn btn-primary btn-lg" onClick={() => { fired.current = false; setError(false); }}>
          Retry
        </button>
      </div>
    );
  }

  // Unauthenticated and params valid → landing.
  return <TapLanding node={node} business={business} />;
}
