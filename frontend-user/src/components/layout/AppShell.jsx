import React, { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LocationProvider } from '../../context/LocationContext';
import { BottomNav } from './BottomNav';
import { ToastContainer } from '../ui/Toast';
import { LoadingCenter } from '../ui/Spinner';

export function AppShell() {
  const { isAuth, loading } = useAuth();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  if (loading) return <LoadingCenter label="Starting up…" />;
  if (!isAuth) return <Navigate to="/login" replace />;

  return (
    <LocationProvider>
      <div className="app-container">
        <ToastContainer />
        <main className="page">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </LocationProvider>
  );
}
