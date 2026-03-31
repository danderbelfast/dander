import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPublicStats } from '../api/offers';

const STEPS = [
  {
    title: 'Open Dander when you\'re out',
    body: 'Dander uses your location to surface live deals within walking distance. No search needed — just open and see what\'s on.',
  },
  {
    title: 'Browse offers around you',
    body: 'See deals from restaurants, shops, bars, and services nearby. Filter by distance, expiry, or type to find exactly what you want.',
  },
  {
    title: 'Tap to claim your coupon',
    body: 'One tap generates a unique code tied to your account. Each code is single-use and expires with the offer — no double-dipping.',
  },
  {
    title: 'Show the code at the counter',
    body: 'Open the coupon screen and show the staff. They enter the code and the discount is applied instantly. No printing, no screenshots.',
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
        <div className="ex-hero-label">For shoppers</div>
        <div className="ex-hero-title">Save money<br />every day.</div>
        <div className="ex-hero-sub">
          Hyper-local deals from real businesses around you. Claimed in one tap, redeemed in seconds.
        </div>
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

      {/* ── CTA ── */}
      <div className="ex-cta">
        <button
          className="ex-cta-btn ex-cta-btn-user"
          onClick={() => navigate('/register')}
        >
          Create free account
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
        <div className="ex-cta-note">
          Already have an account?{' '}
          <span
            style={{ color: '#E85D26', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => navigate('/login')}
          >
            Log in
          </span>
        </div>
      </div>

    </div>
  );
}
