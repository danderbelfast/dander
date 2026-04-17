import React from 'react';
import { useNavigate } from 'react-router-dom';

const STEPS = [
  {
    title: "You're open for business in minutes",
    body: "Add your name, location, logo and a quick description. The moment you hit publish, you're on the map and visible to everyone nearby.",
  },
  {
    title: 'Post a deal before your next coffee goes cold',
    body: 'Pick your offer type — free item, percentage off, fixed price deal. Set how many you want to give out. Hit publish. Done. It takes less time than updating your Facebook page.',
  },
  {
    title: 'Watch them walk through the door',
    body: 'Dander puts your offer in front of real people who are already nearby. They claim a unique code on their phone and get directions straight to you. No printing. No vouchers. No faff.',
  },
  {
    title: "Know exactly what's working",
    body: "Every redemption is tracked. See how many people viewed your offer, how many claimed it, when your busiest periods are, and how much you've saved customers. Real numbers, not guesswork.",
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

const BUSINESS_PORTAL_URL = import.meta.env.VITE_BUSINESS_PORTAL_URL || '';

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
        <div className="ex-hero-title">Let deals work<br />as hard as you.</div>
        <div className="ex-hero-sub">
          They're already walking past. Give them a reason to stop.
        </div>
      </div>

      {/* ── Body ── */}
      <div className="ex-body">

        {/* Steps */}
        <div>
          <div className="ex-section-title">Rewrite Your Rush Hour</div>
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
          href={BUSINESS_PORTAL_URL ? `${BUSINESS_PORTAL_URL}/register` : '#'}
          target="_blank"
          rel="noopener noreferrer"
        >
          Your next customer is already walking past. Get listed free.
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
