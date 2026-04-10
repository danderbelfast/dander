import React from 'react';
import { useNavigate } from 'react-router-dom';

const STEPS = [
  {
    title: 'Create your business profile',
    body: 'Set up in minutes. Add your name, location, logo, and a description. Your business appears on the map the moment you go live.',
  },
  {
    title: 'Post an offer in seconds',
    body: 'Choose a deal type — free item, percentage off, or fixed price — set a redemption cap, and publish. Offers go live instantly.',
  },
  {
    title: 'Customers walk through your door',
    body: 'Dander shows your offer to nearby users in real time. When they claim it, they get a unique code and directions to you.',
  },
  {
    title: 'Track every redemption',
    body: 'Staff scan or enter the code via the business portal. You see live redemption counts, peak times, and savings data — all free.',
  },
];

const COMPARE = [
  { feature: 'No upfront cost',        dander: true,  groupon: false, flyers: false  },
  { feature: 'Geo-targeted reach',     dander: true,  groupon: false, flyers: false  },
  { feature: 'Live redemption data',   dander: true,  groupon: 'partial', flyers: false },
  { feature: 'You set the deal terms', dander: true,  groupon: false, flyers: true   },
  { feature: 'No commission per sale', dander: true,  groupon: false, flyers: true   },
  { feature: 'Instant updates',        dander: true,  groupon: false, flyers: false  },
];

const BUSINESS_PORTAL_URL = import.meta.env.VITE_BUSINESS_PORTAL_URL || 'http://localhost:3001';

function CompareCell({ val }) {
  if (val === true)      return <span className="ex-table-yes ex-col-dander">✓</span>;
  if (val === false)     return <span className="ex-table-no">✗</span>;
  if (val === 'partial') return <span className="ex-table-partial">Partial</span>;
  return null;
}

export default function BusinessExplainer() {
  const navigate = useNavigate();

  return (
    <div className="ex-page ex-page-business">

      {/* ── Hero ── */}
      <div className="ex-hero ex-hero-business">
        <button className="ex-back ex-back-business" onClick={() => navigate('/')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div className="ex-hero-label">For businesses</div>
        <div className="ex-hero-title">Off Peak Deals,<br />On Time Results.</div>
        <div className="ex-hero-sub">
          Put your offer in front of people already nearby. Pay nothing until you choose to.
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

        {/* Comparison table */}
        <div>
          <div className="ex-section-title">Dander vs the alternatives</div>
          <div className="ex-table">
            <div className="ex-table-head">
              <div className="ex-table-head-cell">Feature</div>
              <div className="ex-table-head-cell ex-col-dander">Dander</div>
              <div className="ex-table-head-cell">Groupon / flyers</div>
            </div>
            {COMPARE.map((row, i) => (
              <div key={i} className="ex-table-row">
                <div className="ex-table-cell">{row.feature}</div>
                <div className="ex-table-cell ex-col-dander"><CompareCell val={row.dander} /></div>
                <div className="ex-table-cell"><CompareCell val={row.groupon || row.flyers} /></div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── CTA ── */}
      <div className="ex-cta">
        <a
          className="ex-cta-btn ex-cta-btn-business"
          href={BUSINESS_PORTAL_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Register your business
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </a>
        <div className="ex-cta-note">
          Opens the Dander Business Portal — free to join
        </div>
      </div>

    </div>
  );
}
