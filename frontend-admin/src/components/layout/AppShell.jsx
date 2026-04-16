import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Sidebar } from './Sidebar';
import { LoadingBlock } from '../ui/Spinner';

const PAGE_TITLES = {
  '/dashboard':  'Dashboard',
  '/businesses': 'Businesses',
  '/offers':     'Offers',
  '/users':      'Users',
  '/reports':    'Reports',
  '/settings':   'Settings',
};

export function AppShell() {
  const { isAuth, loading } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  if (loading) return <LoadingBlock label="Starting admin…" />;
  if (!isAuth) return <Navigate to="/login" replace />;

  const title = PAGE_TITLES[location.pathname] || 'Admin';

  const classes = ['app-layout'];
  if (collapsed) classes.push('collapsed');
  if (mobileMenuOpen) classes.push('mobile-menu-open');

  return (
    <div className={classes.join(' ')}>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        onNavigate={() => setMobileMenuOpen(false)}
      />
      <div
        className="mobile-backdrop"
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />

      <header className="topbar">
        <span className="topbar-title">{title}</span>
        <div className="topbar-spacer" />
        <span style={{ fontSize: '0.72rem', fontFamily: 'var(--f-mono)', color: 'var(--c-text-muted)', background: 'var(--c-accent-muted)', padding: '3px 8px', borderRadius: 'var(--r-full)' }}>
          ADMIN
        </span>
        <button
          type="button"
          className="mobile-menu-btn"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((v) => !v)}
        >
          <span /><span /><span />
        </button>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
