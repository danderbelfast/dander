import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPublicStats } from '../api/offers';
import { usePwa } from '../context/PwaInstallContext';

const STEPS = [
  {
    title: 'Just open the app',
    body: "No searching, no scrolling through irrelevant results. Dander knows where you are and shows you what's live right now within walking distance. The deal comes to you.",
  },
  {
    title: "See what's on around you",
    body: "Restaurants, cafés, bars, shops, salons — whatever's nearby has something on. Filter by distance, category or what's ending soonest. Or just let Dander surprise you.",
  },
  {
    title: 'Claim it in one tap',
    body: "Tap the offer and your unique code is generated instantly. It's tied to your account, single use, and expires when the offer does. Nobody else gets your code.",
  },
  {
    title: 'Show and save',
    body: "Open your coupon screen at the counter and show the staff. They enter the code, the discount applies, and you're done. No printing, no screenshots, no awkward moments at the till.",
  },
];

function formatStat(raw) {
  if (raw == null) return '—';
  const n = Number(raw);
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k+`;
  return `${n}+`;
}

function formatAvgSaving(raw) {
  if (raw == null) return '—';
  return `£${Math.round(Number(raw))}`;
}

export default function UserExplainer() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const { canPrompt, promptInstall, isIosDevice, installed } = usePwa();

  function handleInstall() {
    if (canPrompt) {
      promptInstall();
    } else {
      navigate('/register');
    }
  }

  useEffect(() => {
    getPublicStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="ex-page ex-page-user">

      {/* ── Hero ── */}
      <div className="ex-hero ex-hero-user">
        <button className="ex-back ex-back-user" onClick={() => navigate('/')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div className="ex-hero-label"><span className="ex-label-pill">For Shoppers</span></div>
        <div className="ex-hero-title">Don't walk past<br />the best deal for today.</div>
        <div className="ex-hero-sub">
          Real offers from real businesses, surfaced the moment you're close enough to use them.
        </div>
        <button className="ex-hero-cta" onClick={handleInstall}>
          {installed ? 'Open Dander' : 'Get the app free'}
        </button>
      </div>

      {/* ── Body ── */}
      <div className="ex-body">

        {/* Steps */}
        <div>
          <div className="ex-section-title">How it works</div>
          <div className="ex-steps">
            {STEPS.map((s, i) => (
              <div key={i} className="ex-step">
                <div className="ex-step-num">{i + 1}</div>
                <div className="ex-step-content">
                  <div className="ex-step-title">{s.title}</div>
                  <div className="ex-step-text">{s.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div>
          <div className="ex-section-title">By the numbers</div>
          <div className="ex-stats">
            <div className="ex-stat">
              <div className="ex-stat-value">{formatStat(stats?.active_offers)}</div>
              <div className="ex-stat-label">active offers</div>
            </div>
            <div className="ex-stat">
              <div className="ex-stat-value">{formatStat(stats?.active_businesses)}</div>
              <div className="ex-stat-label">local businesses</div>
            </div>
            <div className="ex-stat">
              <div className="ex-stat-value">{formatAvgSaving(stats?.avg_saving)}</div>
              <div className="ex-stat-label">avg saving</div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Final CTA ── */}
      <div className="ex-final-cta">
        <div className="ex-final-cta-heading">Ready to start saving?</div>
        <div className="ex-final-cta-sub">Free to download. No catches.</div>
        <button className="ex-cta-btn ex-cta-btn-user" onClick={handleInstall}>
          {installed ? 'Open Dander' : 'Download Dander'}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
        <div className="ex-cta-note">
          Already have an account?{' '}
          <span style={{ color: '#E85D26', cursor: 'pointer', fontWeight: 600 }} onClick={() => navigate('/login')}>
            Log in
          </span>
        </div>
      </div>

    </div>
  );
}
