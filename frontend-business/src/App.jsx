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
import Analytics        from './pages/Analytics';
import Footfall          from './pages/Footfall';
import Zones             from './pages/Zones';
import SmartSpecials    from './pages/SmartSpecials';
import MySensors        from './pages/MySensors';
import StaffRota        from './pages/StaffRota';
import ApiKeys          from './pages/ApiKeys';
import Settings         from './pages/Settings';

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
          <Route path="/smart-specials"   element={<SmartSpecials />} />
          <Route path="/sensors"          element={<MySensors />} />
          <Route path="/reports"          element={<Reports />} />
          <Route path="/analytics"       element={<Analytics />} />
          <Route path="/footfall"         element={<Footfall />} />
          <Route path="/zones"            element={<Zones />} />
          <Route path="/rota"             element={<StaffRota />} />
          <Route path="/api-keys"         element={<ApiKeys />} />
          <Route path="/settings"         element={<Settings />} />
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
