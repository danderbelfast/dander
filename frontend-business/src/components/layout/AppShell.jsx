import React, { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getProfile } from '../../api/business';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '../ui/Toast';
import { LoadingBlock } from '../ui/Spinner';

const PAGE_TITLES = {
  '/dashboard':  'Dashboard',
  '/offers':     'My Offers',
  '/offers/new': 'Create Offer',
  '/redeem':     'Redeem Coupon',
  '/profile':    'Business Profile',
};

export function AppShell() {
  const { isAuth, loading, setBusiness } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!isAuth) return;
    getProfile()
      .then(({ business }) => setBusiness(business))
      .catch(() => {});
  }, [isAuth, setBusiness]);

  if (loading) return <LoadingBlock label="Starting up…" />;
  if (!isAuth) return <Navigate to="/login" replace />;

  const title = PAGE_TITLES[location.pathname]
    ?? (location.pathname.includes('/stats') ? 'Campaign Stats' : '')
    ?? (location.pathname.includes('/edit')  ? 'Edit Offer'    : '');

  return (
    <div className="app-layout">
      <ToastContainer />
      <Sidebar />
      <header className="topbar">
        <span className="topbar-title">{title}</span>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
