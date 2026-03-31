import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function SplashScreen() {
  const navigate = useNavigate();

  return (
    <div className="sp-root">

      {/* ── User half (dark) ── */}
      <div className="sp-half sp-half-user" onClick={() => navigate('/for-users')}>
        <div className="sp-logo">
          <div className="sp-logo-mark">🐾</div>
          <span className="sp-logo-text">Dander</span>
        </div>
        <div className="sp-label">For shoppers</div>
        <div className="sp-headline">Deals right<br />where you are.</div>
        <div className="sp-sub">
          Belfast's best offers the moment you walk past.
        </div>
        <div className="sp-arrow">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </div>
      </div>

      {/* ── "or" badge ── */}
      <div className="sp-divider">or</div>

      {/* ── Business half (orange) ── */}
      <div className="sp-half sp-half-business" onClick={() => navigate('/for-business')}>
        <div className="sp-logo">
          <div className="sp-logo-mark">🏪</div>
          <span className="sp-logo-text">Dander</span>
        </div>
        <div className="sp-label">For businesses</div>
        <div className="sp-headline">Grow your<br />foot traffic.</div>
        <div className="sp-sub">
          Put your offer in front of people already nearby.
        </div>
        <div className="sp-arrow">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </div>
      </div>

    </div>
  );
}
