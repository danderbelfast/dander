import React, { useState } from 'react';
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

  if (loading) return <LoadingBlock label="Starting admin…" />;
  if (!isAuth) return <Navigate to="/login" replace />;

  const title = PAGE_TITLES[location.pathname] || 'Admin';

  return (
    <div className={`app-layout${collapsed ? ' collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />

      <header className="topbar">
        <span className="topbar-title">{title}</span>
        <div className="topbar-spacer" />
        <span style={{ fontSize: '0.72rem', fontFamily: 'var(--f-mono)', color: 'var(--c-text-muted)', background: 'var(--c-accent-muted)', padding: '3px 8px', borderRadius: 'var(--r-full)' }}>
          ADMIN
        </span>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
