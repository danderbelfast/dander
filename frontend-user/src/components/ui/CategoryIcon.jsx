import React from 'react';

// ---------------------------------------------------------------------------
// SVG path definitions — 20×20 viewBox, orange stroke, stroke-width 1.8
// ---------------------------------------------------------------------------

const ICONS = {
  // Navigation arrow / send
  'Nearest to you': (
    <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
      strokeLinejoin="round"/>
  ),
  // Ending Soon — clock
  'Ending soon': (
    <>
      <circle cx="12" cy="12" r="9"/>
      <polyline points="12 7 12 12 15.5 15.5"/>
    </>
  ),
  // Food & Drink — coffee cup with steam
  'Food & Drink': (
    <>
      <path d="M6 2c0 0 0.5 1 0 2s-0.5 2 0 3"/>
      <path d="M10 2c0 0 0.5 1 0 2s-0.5 2 0 3"/>
      <path d="M14 2c0 0 0.5 1 0 2s-0.5 2 0 3"/>
      <path d="M4 9h16v3a8 8 0 01-16 0V9z"/>
      <path d="M20 9h2a2 2 0 010 4h-2"/>
      <line x1="2" y1="22" x2="22" y2="22"/>
    </>
  ),
  // Cafés & Coffee — viewfinder / lens
  'Cafés & Coffee': (
    <>
      <circle cx="12" cy="12" r="8"/>
      <circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="2" x2="12" y2="4"/>
      <line x1="12" y1="20" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="4" y2="12"/>
      <line x1="20" y1="12" x2="22" y2="12"/>
    </>
  ),
  // Bars & Nightlife — beer mug
  'Bars & Nightlife': (
    <>
      <path d="M5 3h11l-1.5 17H6.5L5 3z"/>
      <path d="M16 7h3a2 2 0 010 4h-3"/>
      <line x1="8" y1="8" x2="8" y2="14"/>
      <line x1="11" y1="8" x2="11" y2="14"/>
    </>
  ),
  // Retail & Shopping — shopping bag
  'Retail & Shopping': (
    <>
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 01-8 0"/>
    </>
  ),
  // Beauty & Wellness — heart
  'Beauty & Wellness': (
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
  ),
  // Health & Fitness — bar chart
  'Health & Fitness': (
    <>
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </>
  ),
  // Gifts & Experiences — credit card
  'Gifts & Experiences': (
    <>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </>
  ),
  // Experiences & Leisure — credit card (alias)
  'Experiences & Leisure': (
    <>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </>
  ),
  // Entertainment — broadcast / signal
  Entertainment: (
    <>
      <circle cx="12" cy="12" r="2"/>
      <path d="M16.24 7.76a6 6 0 010 8.49M7.76 7.76a6 6 0 000 8.49"/>
      <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>
    </>
  ),
  // Services — puzzle piece
  Services: (
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01"/>
  ),
  // Hotels & Stays — home
  'Hotels & Stays': (
    <>
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </>
  ),
  // Takeaway — shopping cart
  Takeaway: (
    <>
      <circle cx="9" cy="21" r="1"/>
      <circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.96-1.61L23 6H6"/>
    </>
  ),
  // Trades & Services — phone
  'Trades & Services': (
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
  ),
  // Featured — star
  Featured: (
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  ),
  // All Offers — list
  'All Offers': (
    <>
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/>
      <line x1="3" y1="18" x2="3.01" y2="18"/>
    </>
  ),
};

// ---------------------------------------------------------------------------
// SectionIcon — 36×36 rounded badge for category section headers
// ---------------------------------------------------------------------------

export function SectionIcon({ category }) {
  const icon = ICONS[category];
  if (!icon) return null;
  return (
    <div
      style={{
        width: 36, height: 36,
        borderRadius: 10,
        background: '#FFF0EA',
        border: '0.5px solid #FFD5C0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg
        width="20" height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#E85D26"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {icon}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategoryIcon — filled coloured badge used on offer cards (unchanged)
// ---------------------------------------------------------------------------

const CARD_PATHS = {
  'Food & Drink': (
    <>
      <path d="M4.5 10C4.5 7.2 8 5 12 5s7.5 2.2 7.5 5H4.5z" fill="currentColor"/>
      <rect x="3" y="11.5" width="18" height="3" rx="1.5" fill="currentColor"/>
      <rect x="3" y="16" width="18" height="3" rx="1.5" fill="currentColor"/>
    </>
  ),
  'Retail & Shopping': (
    <>
      <path d="M5 9h14l-1.5 12H6.5z" fill="currentColor"/>
      <path d="M9.5 9V7a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </>
  ),
  'Beauty & Wellness': (
    <path
      d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
      fill="currentColor"
    />
  ),
  Entertainment: (
    <>
      <ellipse cx="7.5" cy="18" rx="3" ry="2.2" fill="currentColor"/>
      <rect x="10.5" y="5" width="2" height="13" fill="currentColor"/>
      <rect x="10.5" y="5" width="8" height="3.5" rx="1" fill="currentColor"/>
    </>
  ),
  Services: (
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"
      fill="currentColor"/>
  ),
  'Health & Fitness': (
    <>
      <rect x="1" y="9" width="4.5" height="6" rx="1" fill="currentColor"/>
      <rect x="18.5" y="9" width="4.5" height="6" rx="1" fill="currentColor"/>
      <rect x="5.5" y="11" width="13" height="2" fill="currentColor"/>
      <rect x="5.5" y="9.5" width="3" height="5" rx="0.5" fill="currentColor"/>
      <rect x="15.5" y="9.5" width="3" height="5" rx="0.5" fill="currentColor"/>
    </>
  ),
  'Experiences & Leisure': (
    <>
      <path d="M2 8a2 2 0 012-2h16a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2a2 2 0 000-4V8z" fill="currentColor"/>
      <rect x="9.5" y="6" width="1.5" height="12" rx="0.75" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2"/>
    </>
  ),
  Other: (
    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="currentColor"/>
  ),
};

function iconColor(bg) {
  if (!bg) return '#ffffff';
  const light = ['#ffffff', '#fff', 'white', '#fafafa', '#f5f5f5', '#eab308', '#fde047'];
  return light.includes(bg.toLowerCase()) ? '#111111' : '#ffffff';
}

export function CategoryIcon({ category, bg = '#000000', size = 40 }) {
  const paths = CARD_PATHS[category];
  if (!paths) return null;
  const fg = iconColor(bg);
  return (
    <div
      className="offer-cat-icon"
      style={{ background: bg, width: size, height: size, color: fg }}
      title={category}
    >
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} aria-hidden>
        {paths}
      </svg>
    </div>
  );
}
