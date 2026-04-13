import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import danderLogoWhite from '../../assets/Dander_Logo_White.png';

const NAV = [
  {
    section: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
      )},
    ],
  },
  {
    section: 'Offers',
    items: [
      { to: '/offers', label: 'My Offers', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
      )},
      { to: '/offers/new', label: 'Create Offer', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      )},
    ],
  },
  {
    section: 'Analytics',
    items: [
      { to: '/reports', label: 'Reports', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
      )},
    ],
  },
  {
    section: 'Help',
    items: [
      { to: '/guide', label: 'How it works', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      )},
    ],
  },
  {
    section: 'Operations',
    items: [
      { to: '/redeem', label: 'Redeem Coupon', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/>
          <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
        </svg>
      )},
      { to: '/profile', label: 'Business Profile', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      )},
    ],
  },
];

export function Sidebar() {
  const { user, business, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() { logout(); navigate('/login', { replace: true }); }

  const initials = user
    ? `${(user.firstName || user.email)?.[0]?.toUpperCase() || '?'}`
    : '?';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src={danderLogoWhite} alt="Dander" style={{ width: 140, height: 'auto' }} />
        <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400, fontSize: '0.9rem' }}>Biz</span>
      </div>

      {NAV.map(({ section, items }) => (
        <div key={section}>
          <div className="sidebar-section-label">{section}</div>
          {items.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {icon}
              {label}
            </NavLink>
          ))}
        </div>
      ))}

      <div className="sidebar-footer">
        {business && <div className="biz-name">{business.name}</div>}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <span>{user?.email}</span>
          <button
            onClick={handleLogout}
            style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', padding: '2px 6px', borderRadius: 4 }}
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
