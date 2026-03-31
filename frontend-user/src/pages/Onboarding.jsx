import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SLIDES = [
  {
    emoji: '📍',
    title: 'Deals right\nwhere you are.',
    body: "Belfast's best offers surface the moment you walk past. No searching, no scrolling — just the right deal at the right time.",
    cta: null,
  },
  {
    emoji: '⚡',
    title: 'Redeem in\nseconds.',
    body: "Show your unique code at the counter. That's it. No printing, no clipping, no awkward barcodes at the checkout.",
    cta: null,
  },
  {
    emoji: '🔥',
    title: 'Fresh offers,\nevery day.',
    body: 'Restaurants, bars, shops, and services push new deals daily. Be the first to know when something drops near you.',
    cta: 'Get started',
  },
];

export default function Onboarding() {
  const [slide, setSlide] = useState(0);
  const navigate = useNavigate();

  const next = () => {
    if (slide < SLIDES.length - 1) setSlide((s) => s + 1);
    else navigate('/register');
  };

  const skip = () => navigate('/login');

  return (
    <div className="onboarding">
      <div className="slides-wrapper">
        <div
          className="slides-track"
          style={{ transform: `translateX(calc(-${slide * 100}vw))` }}
        >
          {SLIDES.map((s, i) => (
            <div key={i} className="slide">
              <div className="slide-emoji">{s.emoji}</div>
              <h1 className="slide-title" style={{ whiteSpace: 'pre-line' }}>{s.title}</h1>
              <p className="slide-body">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="onboarding-footer">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px' }}>
          <div className="slide-dots">
            {SLIDES.map((_, i) => (
              <div key={i} className={`slide-dot ${i === slide ? 'active' : ''}`} />
            ))}
          </div>
          <button className="btn btn-ghost btn-sm text-muted" onClick={skip}>
            Skip
          </button>
        </div>

        <button className="btn btn-primary btn-block btn-lg" onClick={next}>
          {SLIDES[slide].cta || 'Next'}
        </button>

        {slide === SLIDES.length - 1 && (
          <button className="btn btn-ghost btn-block" onClick={() => navigate('/login')}>
            I already have an account
          </button>
        )}
      </div>
    </div>
  );
}
