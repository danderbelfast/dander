import React, { useState } from 'react';

const SECTIONS = [
  {
    id: 'getting-started',
    title: 'Getting started',
    icon: '🚀',
    steps: [
      {
        heading: 'Create your account',
        body: 'Register at the sign-up page with your business email and a strong password. You\'ll be asked to set up two-factor authentication (2FA) using Google Authenticator — this keeps your account secure.',
      },
      {
        heading: 'Wait for approval',
        body: 'Once registered, your account is reviewed by the Dander team. You\'ll receive an email when you\'re approved and can start posting offers. This usually takes less than 24 hours.',
      },
      {
        heading: 'Complete your business profile',
        body: 'Head to Business Profile in the sidebar and fill in your name, address, category, logo, and a short description. A complete profile helps customers recognise you and trust your offers.',
      },
    ],
  },
  {
    id: 'creating-offers',
    title: 'Creating offers',
    icon: '🏷️',
    steps: [
      {
        heading: 'Go to Create Offer',
        body: 'Click Create Offer in the sidebar. Give your offer a clear title — customers see this first. Choose the right category so it appears in the right searches.',
      },
      {
        heading: 'Choose an offer type',
        body: 'Select from percentage off, fixed amount off, buy-one-get-one, free item, or a custom description. Set the value (e.g. 20% or £5 off) and add a description of exactly what the customer gets.',
      },
      {
        heading: 'Set your location and radius',
        body: 'Use the map to pin your exact location and drag the radius slider to control how close a customer needs to be before they can see and claim the offer. A smaller radius means more targeted foot traffic.',
      },
      {
        heading: 'Set a cap (optional)',
        body: 'Add a maximum number of coupons to limit how many times the offer can be claimed. Once the cap is reached the offer stops appearing to new customers. Leave it blank for unlimited.',
      },
      {
        heading: 'Set start and expiry times',
        body: 'Schedule when the offer goes live and when it expires. You can create offers in advance — great for planning weekend or lunchtime promotions.',
      },
      {
        heading: 'Upload a photo',
        body: 'Offers with a clear, appetising photo perform significantly better. Use a well-lit image of the product or dish being offered.',
      },
    ],
  },
  {
    id: 'redeeming',
    title: 'Redeeming coupons at the counter',
    icon: '🎟️',
    steps: [
      {
        heading: 'Ask the customer to show their coupon',
        body: 'When a customer arrives with an offer, they\'ll show you their coupon code on the Dander app. Each coupon has a unique code that can only be used once.',
      },
      {
        heading: 'Go to Redeem Coupon',
        body: 'Click Redeem Coupon in the sidebar. Type in the code the customer shows you, or ask them to read it out.',
      },
      {
        heading: 'Confirm and apply the discount',
        body: 'The system will verify the code is valid and unused. Once confirmed, apply the discount at your till. The coupon is marked as redeemed and cannot be used again.',
      },
      {
        heading: 'Invalid or already used',
        body: 'If a code is invalid or has already been redeemed, you\'ll see an error message. Do not honour the discount in this case — ask the customer to check the Dander app for a valid coupon.',
      },
    ],
  },
  {
    id: 'stats',
    title: 'Understanding your stats',
    icon: '📊',
    steps: [
      {
        heading: 'Dashboard overview',
        body: 'Your dashboard shows total views, how many coupons have been claimed (issued to customers), and how many have been redeemed (used at the counter). Use this to see how your offers are performing at a glance.',
      },
      {
        heading: 'Claimed vs Redeemed',
        body: 'Claimed means a customer has taken the coupon and intends to visit. Redeemed means they actually came in and used it at the counter. A high claimed-to-redeemed ratio may mean customers are claiming but not following through — try shortening expiry times or increasing urgency.',
      },
      {
        heading: 'Campaign Stats per offer',
        body: 'Click the stats icon on any offer in My Offers to see a full breakdown: daily views, daily claims, daily redemptions, and cap usage. Use this to understand peak days and times.',
      },
      {
        heading: 'Cap usage',
        body: 'The "Cap used" figure shows total coupons issued (claimed + redeemed) against your cap. Once issued, a coupon counts toward the cap whether or not it has been used at the counter yet.',
      },
    ],
  },
  {
    id: 'tips',
    title: 'Tips for better results',
    icon: '💡',
    steps: [
      {
        heading: 'Keep offers time-limited',
        body: 'Offers with a short window (2–4 hours) create urgency and drive immediate foot traffic. "Lunch deal until 2pm" converts better than a week-long promotion.',
      },
      {
        heading: 'Use a tight radius for busy areas',
        body: 'If you\'re on a busy high street, a 200–300m radius means only nearby shoppers see your offer — keeping redemptions realistic and manageable.',
      },
      {
        heading: 'Refresh offers regularly',
        body: 'Customers who see the same offer repeatedly stop engaging. Rotate your deals weekly to keep returning users interested.',
      },
      {
        heading: 'Set a cap to manage demand',
        body: 'For popular offers or limited stock, set a cap so you\'re never overwhelmed. The offer automatically deactivates when the cap is reached.',
      },
      {
        heading: 'Complete your profile',
        body: 'Businesses with a logo, cover photo, and full description get more clicks. Customers are more likely to trust and visit a business that looks established.',
      },
    ],
  },
];

function Section({ section, open, onToggle }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '1.3rem' }}>{section.icon}</span>
          <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--c-heading)' }}>{section.title}</span>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round"
          style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', color: 'var(--c-text-muted)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--c-border)', padding: '4px 20px 20px' }}>
          {section.steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, marginTop: 18 }}>
              <div style={{
                flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
                background: 'var(--c-primary)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.72rem', fontWeight: 700, marginTop: 1,
              }}>
                {i + 1}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4, color: 'var(--c-heading)' }}>
                  {step.heading}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--c-text-muted)', lineHeight: 1.65 }}>
                  {step.body}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Guide() {
  const [openId, setOpenId] = useState('getting-started');

  function toggle(id) {
    setOpenId((prev) => (prev === id ? null : id));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>

      <div className="page-header">
        <div>
          <div className="page-title">How to use Dander</div>
          <div className="page-sub">Everything you need to know to get started and make the most of your offers</div>
        </div>
      </div>

      {/* Quick-links row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`btn btn-sm ${openId === s.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => toggle(s.id)}
          >
            {s.icon} {s.title}
          </button>
        ))}
      </div>

      {SECTIONS.map((s) => (
        <Section
          key={s.id}
          section={s}
          open={openId === s.id}
          onToggle={() => toggle(s.id)}
        />
      ))}

      {/* Contact callout */}
      <div className="card" style={{ padding: '20px', background: 'var(--c-surface-raised)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: '1.5rem' }}>✉️</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Still need help?</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)', marginTop: 2 }}>
            Email us at{' '}
            <a href="mailto:support@dander.app" style={{ color: 'var(--c-primary)' }}>support@dander.app</a>
            {' '}and we'll get back to you within one business day.
          </div>
        </div>
      </div>

    </div>
  );
}
