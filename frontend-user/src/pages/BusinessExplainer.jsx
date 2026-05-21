import React from 'react';
import { useNavigate } from 'react-router-dom';

const BUSINESS_PORTAL_URL = import.meta.env.VITE_BUSINESS_PORTAL_URL || '';

const FEATURES = [
  {
    icon: '📊',
    title: 'Real-time footfall analytics',
    body: 'See who walks in, when they come, how long they stay, and where they go inside your space. Updated every 30 seconds.',
  },
  {
    icon: '🧠',
    title: 'AI-powered daily insights',
    body: "\"Rain drove 18% more visitors indoors today.\" \"Your 2pm offer brought an estimated 12 extra customers.\" Automated cause-and-effect, not just charts.",
  },
  {
    icon: '🎯',
    title: 'Targeted offers that convert',
    body: 'Quiet afternoon? Push a deal to people within walking distance. Track every claim and redemption. Know your ROI to the penny.',
  },
  {
    icon: '📡',
    title: 'IoT sensor integration',
    body: 'Connect Kilo footfall sensors for zone-level tracking: entrance, seating, counter. Demographics, dwell time, and capacity alerts — all automatic.',
  },
  {
    icon: '📈',
    title: 'Weather × footfall correlation',
    body: 'We overlay Met Office weather data with your footfall. See exactly how rain, sun, and cold affect your business — then plan around it.',
  },
  {
    icon: '🔗',
    title: 'Open API & webhooks',
    body: 'Connect to your POS, CRM, or BI tools. Real-time webhook events for every offer, redemption, and footfall alert. Full developer docs.',
  },
];

const TIERS = [
  {
    name: 'Free',
    price: '£0',
    sub: 'forever',
    features: ['1 offer per day', 'Basic redemption tracking', 'Coupon system', 'Business profile'],
    cta: 'Get started',
    accent: false,
  },
  {
    name: 'Starter',
    price: '£29',
    sub: '/month',
    features: ['Everything in Free', '5 offers per day', 'Daily insights', 'Social share images', 'Priority support'],
    cta: 'Start free trial',
    accent: false,
  },
  {
    name: 'Growth',
    price: '£79',
    sub: '/month',
    features: ['Everything in Starter', 'Unlimited offers', 'Full analytics dashboard', 'Weather correlation', 'API access', 'Webhook integrations'],
    cta: 'Start free trial',
    accent: true,
  },
  {
    name: 'Pro',
    price: '£149',
    sub: '/month',
    features: ['Everything in Growth', 'Kilo IoT sensors included', 'Zone-level tracking', 'Demographics & dwell time', 'Smart Specials AI', 'Dedicated account manager'],
    cta: 'Book a demo',
    accent: false,
  },
];

const STATS = [
  { value: '4.2x', label: 'avg ROI on offers' },
  { value: '23%', label: 'footfall increase' },
  { value: '< 2min', label: 'to post a deal' },
  { value: '30s', label: 'real-time updates' },
];

export default function BusinessExplainer() {
  const navigate = useNavigate();
  const portalRegister = BUSINESS_PORTAL_URL ? `${BUSINESS_PORTAL_URL}/register` : '#';

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
        <div className="ex-hero-label"><span className="ex-label-pill">For Businesses</span></div>
        <div className="ex-hero-title">Google Analytics<br />for your physical location.</div>
        <div className="ex-hero-sub">
          You use analytics for your website. Now do the same for your shop floor. Real-time footfall, AI insights, and targeted offers — all from one dashboard.
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <a className="ex-hero-cta" href={portalRegister} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            List my business free
          </a>
          <button className="ex-hero-cta" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}
            onClick={() => window.open('mailto:hello@dander.io?subject=Demo request', '_blank')}>
            Book a demo
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 32, padding: '28px 20px', background: 'var(--c-surface)', flexWrap: 'wrap' }}>
        {STATS.map((s, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#E85D26' }}>{s.value}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="ex-body">

        {/* Value prop */}
        <div style={{ textAlign: 'center', maxWidth: 580, margin: '0 auto 16px' }}>
          <div className="ex-section-title" style={{ fontSize: '1.3rem' }}>Stop guessing. Start measuring.</div>
          <p style={{ fontSize: '0.9rem', color: 'var(--c-text-muted)', lineHeight: 1.65 }}>
            Every high street business makes decisions based on gut feel. Dander gives you the data to make them with confidence.
          </p>
        </div>

        {/* Feature grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginTop: 24 }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '24px 20px' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--c-text-muted)', lineHeight: 1.55 }}>{f.body}</div>
            </div>
          ))}
        </div>

        {/* Positioning statement */}
        <div style={{ textAlign: 'center', padding: '40px 20px', margin: '32px 0' }}>
          <div style={{ fontSize: '1.15rem', fontWeight: 700, maxWidth: 520, margin: '0 auto', lineHeight: 1.5 }}>
            "We built Dander because every shop deserves the same data advantage that online stores have had for 20 years."
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)', marginTop: 8 }}>— Dander team</div>
        </div>

        {/* Pricing */}
        <div style={{ marginTop: 16 }}>
          <div className="ex-section-title" style={{ textAlign: 'center', fontSize: '1.2rem' }}>Simple pricing, serious tools</div>
          <p style={{ textAlign: 'center', fontSize: '0.88rem', color: 'var(--c-text-muted)', marginBottom: 24 }}>Start free. Upgrade when you need more data.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {TIERS.map((t, i) => (
              <div key={i} style={{
                background: 'var(--c-surface)', border: t.accent ? '2px solid #E85D26' : '1px solid var(--c-border)',
                borderRadius: 12, padding: '24px 18px', display: 'flex', flexDirection: 'column',
                position: 'relative',
              }}>
                {t.accent && (
                  <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: '#E85D26', color: '#fff', fontSize: '0.68rem', fontWeight: 700, padding: '2px 10px', borderRadius: 'var(--r-full)' }}>
                    POPULAR
                  </div>
                )}
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 }}>{t.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 14 }}>
                  <span style={{ fontSize: '1.6rem', fontWeight: 800 }}>{t.price}</span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)' }}>{t.sub}</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {t.features.map((f, j) => (
                    <li key={j} style={{ fontSize: '0.8rem', color: 'var(--c-text-muted)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <span style={{ color: '#16A34A', flexShrink: 0 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <a href={t.name === 'Pro' ? 'mailto:hello@dander.io?subject=Pro demo request' : portalRegister}
                  target="_blank" rel="noopener noreferrer"
                  className={t.accent ? 'ex-cta-btn ex-cta-btn-business' : 'ex-cta-btn'}
                  style={{ marginTop: 16, textAlign: 'center', display: 'block', textDecoration: 'none', padding: '10px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, background: t.accent ? '#E85D26' : 'transparent', color: t.accent ? '#fff' : '#E85D26', border: t.accent ? 'none' : '1px solid #E85D26' }}>
                  {t.cta}
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Who is this for */}
        <div style={{ marginTop: 40 }}>
          <div className="ex-section-title" style={{ textAlign: 'center', fontSize: '1.1rem' }}>Built for business intelligence</div>
          <p style={{ textAlign: 'center', fontSize: '0.88rem', color: 'var(--c-text-muted)', maxWidth: 520, margin: '0 auto 20px', lineHeight: 1.6 }}>
            Cafés, restaurants, bars, salons, retail shops, gyms — any business with a physical location and customers who walk through a door. Join the growing number of businesses using Dander to understand their footfall, optimize operations, and drive more customers through the door.
          </p>
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="ex-cta">
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a className="ex-cta-btn ex-cta-btn-business" href={portalRegister} target="_blank" rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}>
            List My Business Free
          </a>
          <a className="ex-cta-btn" href="mailto:hello@dander.io?subject=Demo request" style={{ textDecoration: 'none', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>
            Book a Demo
          </a>
        </div>
        <div className="ex-cta-note" style={{ marginTop: 12 }}>
          Dander Ads and Merchant Center launching Q3–Q4 2026. Analytics available now with Pro tier.
        </div>
      </div>

    </div>
  );
}
