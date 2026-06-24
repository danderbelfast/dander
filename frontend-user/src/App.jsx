import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

import { AppShell }   from './components/layout/AppShell';
import { ToastContainer } from './components/ui/Toast';
import { UpdateBanner } from './components/ui/UpdateBanner';
import { InstallBanner } from './components/ui/InstallBanner';
import { useSwUpdate } from './hooks/useSwUpdate';
import { useFcmForeground } from './hooks/useFcmForeground';
import { usePwa } from './context/PwaInstallContext';

import SplashScreen       from './pages/SplashScreen';
import UserExplainer      from './pages/UserExplainer';
import BusinessExplainer  from './pages/BusinessExplainer';
import Onboarding   from './pages/Onboarding';
import Register     from './pages/Register';
import Login        from './pages/Login';
import Home         from './pages/Home';
import OfferDetail  from './pages/OfferDetail';
import MyOffers      from './pages/MyOffers';
import CouponClaimed  from './pages/CouponClaimed';
import SavedOffers  from './pages/SavedOffers';
import Settings                from './pages/Settings';
import NotificationPreferences from './pages/NotificationPreferences';
import Navigation              from './pages/Navigation';
import Privacy                 from './pages/Privacy';
import Tap from './pages/Tap';
import BusinessOffers from './pages/BusinessOffers';
import { CheckInOverlayProvider } from './context/CheckInOverlayProvider';
import { ActivatedOffersProvider } from './context/ActivatedOffersContext';
import PointsOverlay from './components/checkin/PointsOverlay';

function PublicRoute({ children }) {
  const { isAuth, loading } = useAuth();
  if (loading) return null;
  return isAuth ? <Navigate to="/home" replace /> : children;
}

export default function App() {
  const { hasUpdate, applyUpdate, dismiss } = useSwUpdate();
  const { showBanner, isIosDevice, promptInstall, dismissBanner } = usePwa();
  useFcmForeground();

  return (
    <CheckInOverlayProvider>
      {hasUpdate && <UpdateBanner onRefresh={applyUpdate} onDismiss={dismiss} />}
      {showBanner && <InstallBanner isIos={isIosDevice} onInstall={promptInstall} onDismiss={dismissBanner} />}
      <ToastContainer />
      <ActivatedOffersProvider>
      <Routes>
        {/* Public */}
        <Route path="/"             element={<PublicRoute><SplashScreen /></PublicRoute>} />
        <Route path="/for-users"    element={<PublicRoute><UserExplainer /></PublicRoute>} />
        <Route path="/for-business" element={<BusinessExplainer />} />
        <Route path="/privacy"      element={<Privacy />} />
        <Route path="/onboarding"   element={<PublicRoute><Onboarding /></PublicRoute>} />
        <Route path="/register"     element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/login"        element={<PublicRoute><Login /></PublicRoute>} />

        {/* Authenticated — wrapped in AppShell (bottom nav + location context) */}
        <Route element={<AppShell />}>
          <Route path="/home"                       element={<Home />} />
          <Route path="/my-offers"                element={<MyOffers />} />
          <Route path="/coupons"                  element={<Navigate to="/my-offers" replace />} />
          <Route path="/coupons/claimed"          element={<CouponClaimed />} />
          <Route path="/saved"                    element={<SavedOffers />} />
          <Route path="/settings"                 element={<Settings />} />
          <Route path="/notification-preferences" element={<NotificationPreferences />} />
        </Route>

        {/* Full-screen — no auth wrapper, no AppShell */}
        <Route path="/tap" element={<Tap />} />
        <Route path="/offer/:id" element={<OfferDetail />} />
        <Route path="/business/:id/offers" element={<BusinessOffers />} />

        {/* Full-screen navigation — no bottom nav */}
        <Route path="/navigate" element={<Navigation />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <PointsOverlay />
      </ActivatedOffersProvider>
    </CheckInOverlayProvider>
  );
}
