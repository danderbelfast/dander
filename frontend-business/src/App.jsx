import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppShell } from './components/layout/AppShell';

// Pages
import Login            from './pages/Login';
import RegisterBusiness from './pages/RegisterBusiness';
import Dashboard        from './pages/Dashboard';
import CreateOffer      from './pages/CreateOffer';
import EditOffer        from './pages/EditOffer';
import MyOffers         from './pages/MyOffers';
import CampaignStats    from './pages/CampaignStats';
import RedeemCoupon     from './pages/RedeemCoupon';
import BusinessProfile  from './pages/BusinessProfile';
import Guide            from './pages/Guide';
import Reports          from './pages/Reports';

// Redirects logged-in users away from public pages
function PublicRoute({ children }) {
  const { isAuth, loading } = useAuth();
  if (loading) return null;
  return isAuth ? <Navigate to="/dashboard" replace /> : children;
}

function PrivateRoute({ children }) {
  const { isAuth, loading } = useAuth();
  if (loading) return null;
  return isAuth ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Public ── */}
        <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterBusiness /></PublicRoute>} />

        {/* ── Protected (business dashboard) ── */}
        <Route element={<PrivateRoute><AppShell /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"        element={<Dashboard />} />
          <Route path="/offers"           element={<MyOffers />} />
          <Route path="/offers/new"       element={<CreateOffer />} />
          <Route path="/offers/:id/edit"  element={<EditOffer />} />
          <Route path="/offers/:id/stats" element={<CampaignStats />} />
          <Route path="/reports"          element={<Reports />} />
          <Route path="/redeem"           element={<RedeemCoupon />} />
          <Route path="/profile"          element={<BusinessProfile />} />
          <Route path="/guide"            element={<Guide />} />
        </Route>

        {/* ── Catch-all ── */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
