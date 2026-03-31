import React from 'react';

/* Simple filled SVG icons — each fits a 24×24 viewBox */
const PATHS = {
  'Food & Drink': (
    <>
      {/* Fork and drink glass side by side */}
      <path d="M4.5 10C4.5 7.2 8 5 12 5s7.5 2.2 7.5 5H4.5z" fill="currentColor"/>
      <rect x="3" y="11.5" width="18" height="3" rx="1.5" fill="currentColor"/>
      <rect x="3" y="16" width="18" height="3" rx="1.5" fill="currentColor"/>
    </>
  ),
  'Retail & Shopping': (
    <>
      {/* Shopping bag */}
      <path d="M5 9h14l-1.5 12H6.5z" fill="currentColor"/>
      <path d="M9.5 9V7a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </>
  ),
  'Beauty & Wellness': (
    <>
      {/*
        Technique: evenodd fills the hair silhouette but punches a
        face-shaped hole through it — the badge background colour
        shows through as the face skin tone.
      */}
      {/* Hair silhouette + face cutout */}
      <path
        fillRule="evenodd"
        fill="currentColor"
        d={
          /* Outer: head + medium-length hair flowing past jaw */
          'M12 1.5 C18 1.5 21.5 5.5 21.5 11 C21.5 16 19.5 21 17.5 23 H6.5 C4.5 21 2.5 16 2.5 11 C2.5 5.5 6 1.5 12 1.5 Z ' +
          /* Inner: soft feminine face — wide at cheeks, gently tapered chin */
          'M12 6.5 C15.5 6.5 17 8.5 17 12 C17 16.5 14.8 20.5 12 21.5 C9.2 20.5 7 16.5 7 12 C7 8.5 8.5 6.5 12 6.5 Z'
        }
      />
      {/* Left eyebrow — thin high arch */}
      <path d="M8.5 10.5 C9.5 8.5 11 8 12 8.5"
        fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      {/* Right eyebrow */}
      <path d="M12 8.5 C13 8 14.5 8.5 15.5 10.5"
        fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      {/* Left eye — wide almond with slight taper */}
      <path d="M8 12.5 C9 11 11 11 12 12.5 C11 14 9 14 8 12.5 Z"
        fill="currentColor"/>
      {/* Right eye */}
      <path d="M12 12.5 C13 11 15 11 16 12.5 C15 14 13 14 12 12.5 Z"
        fill="currentColor"/>
      {/* Nose — gentle tip curve */}
      <path d="M10.5 16 Q12 17.2 13.5 16"
        fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      {/* Lips — cupid's bow top, full lower */}
      <path d="M9 18.5 Q10.2 17.2 12 17.8 Q13.8 17.2 15 18.5 Q12 21 9 18.5 Z"
        fill="currentColor"/>
    </>
  ),
  Entertainment: (
    <>
      {/* Music note */}
      <ellipse cx="7.5" cy="18" rx="3" ry="2.2" fill="currentColor"/>
      <rect x="10.5" y="5" width="2" height="13" fill="currentColor"/>
      <rect x="10.5" y="5" width="8" height="3.5" rx="1" fill="currentColor"/>
    </>
  ),
  Services: (
    <>
      {/* Wrench */}
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"
        fill="currentColor"/>
    </>
  ),
  'Health & Fitness': (
    <>
      {/* Dumbbell */}
      <rect x="1" y="9" width="4.5" height="6" rx="1" fill="currentColor"/>
      <rect x="18.5" y="9" width="4.5" height="6" rx="1" fill="currentColor"/>
      <rect x="5.5" y="11" width="13" height="2" fill="currentColor"/>
      <rect x="5.5" y="9.5" width="3" height="5" rx="0.5" fill="currentColor"/>
      <rect x="15.5" y="9.5" width="3" height="5" rx="0.5" fill="currentColor"/>
    </>
  ),
  'Experiences & Leisure': (
    <>
      {/* Ticket */}
      <path d="M2 8a2 2 0 012-2h16a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2a2 2 0 000-4V8z" fill="currentColor"/>
      <rect x="9.5" y="6" width="1.5" height="12" rx="0.75" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2"/>
    </>
  ),
  Other: (
    <>
      {/* Star */}
      <polygon
        points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
        fill="currentColor"
      />
    </>
  ),
};

function iconColor(bg) {
  /* White/very-light backgrounds get a dark icon */
  if (!bg) return '#ffffff';
  const light = ['#ffffff', '#fff', 'white', '#fafafa', '#f5f5f5', '#eab308', '#fde047'];
  return light.includes(bg.toLowerCase()) ? '#111111' : '#ffffff';
}

export function CategoryIcon({ category, bg = '#000000', size = 40 }) {
  const paths = PATHS[category];
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
