import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppShell } from './components/layout/AppShell';

import Login      from './pages/Login';
import Dashboard  from './pages/Dashboard';
import Businesses from './pages/Businesses';
import Offers     from './pages/Offers';
import Users      from './pages/Users';
import Reports    from './pages/Reports';
import Settings   from './pages/Settings';

function PublicRoute({ children }) {
  const { isAuth, loading } = useAuth();
  if (loading) return null;
  return isAuth ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Public ── */}
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

        {/* ── Protected ── */}
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"  element={<Dashboard />} />
          <Route path="/businesses" element={<Businesses />} />
          <Route path="/offers"     element={<Offers />} />
          <Route path="/users"      element={<Users />} />
          <Route path="/reports"    element={<Reports />} />
          <Route path="/settings"   element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
