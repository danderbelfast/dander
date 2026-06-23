import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStrangerDisplay, fireStrangerVisit } from '../../api/public';
import { setTapIntent } from '../../services/postAuthIntent';
import { Spinner } from '../ui/Spinner';
import tapproveLogoBlack from '../../assets/TapProve_Logo_Black.png';

// Landing for an unauthenticated NFC tapper. Earning requires a session, so we
// show who they tapped, preview today's offer, and route them to auth — stashing
// the tap context so it replays and awards after they log in / register.
export default function TapLanding({ node, business }) {
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getStrangerDisplay(business)
      .then((data) => { if (alive) setInfo(data); })
      .catch(() => { if (alive) setInfo(null); })
      .finally(() => { if (alive) setLoading(false); });
    // Best-effort kiosk "new visitor" display — never blocks the page.
    fireStrangerVisit({ node, business });
    return () => { alive = false; };
  }, [node, business]);

  function goAuth(path) {
    setTapIntent({ node, business });
    navigate(path);
  }

  if (loading) {
    return (
      <div className="auth-page page-full" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const name = info?.business_name ?? 'this business';
  const offer = info?.todays_offer ?? null;

  return (
    <div className="auth-page page-full" style={{ overflowY: 'auto' }}>
      <img src={tapproveLogoBlack} alt="TapProve" className="auth-logo" />
      <h1 className="auth-title">Welcome to {name}'s loyalty program.</h1>
      <p className="auth-subtitle">Powered by TapProve. Sign in or create an account to collect your points.</p>

      {offer && (
        <div className="card" style={{ margin: '12px 0', padding: 16, borderRadius: 12, background: 'rgba(255,107,53,0.08)' }}>
          <div style={{ fontWeight: 700, color: '#FF6B35' }}>Today's offer</div>
          <div style={{ fontWeight: 600 }}>{offer.title}</div>
          {offer.description && <div className="text-muted" style={{ fontSize: '0.9rem' }}>{offer.description}</div>}
        </div>
      )}

      <div className="auth-form">
        <button className="btn btn-primary btn-block btn-lg" onClick={() => goAuth('/login')}>
          Sign in to collect points
        </button>
        <button className="btn btn-secondary btn-block btn-lg" onClick={() => goAuth('/register')}>
          Create account
        </button>
      </div>
    </div>
  );
}
