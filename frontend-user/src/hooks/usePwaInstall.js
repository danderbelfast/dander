import { useState, useEffect, useRef, useCallback } from 'react';

const LS_KEY = 'dander_pwa_install';
const DISMISS_DAYS = 7;

function getStore() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function setStore(data) {
  localStorage.setItem(LS_KEY, JSON.stringify({ ...getStore(), ...data }));
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         navigator.standalone === true;
}

export function usePwaInstall() {
  const deferredPrompt = useRef(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) { setInstalled(true); return; }
    setIsIosDevice(isIos());

    // Capture the beforeinstallprompt event (Android/Chrome)
    function onBeforeInstall(e) {
      e.preventDefault();
      deferredPrompt.current = e;
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setShowBanner(false);
      setStore({ installed: true });
    });

    // Record today's visit
    const store = getStore();
    const today = new Date().toISOString().slice(0, 10);
    const days = new Set(store.visitDays || []);
    days.add(today);
    setStore({ visitDays: [...days] });

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  // Check if conditions are met to show banner
  const checkTrigger = useCallback(() => {
    if (isStandalone()) return;
    const store = getStore();
    if (store.installed) return;

    // Don't show if dismissed recently
    if (store.dismissedAt) {
      const dismissed = new Date(store.dismissedAt);
      const diff = (Date.now() - dismissed.getTime()) / (1000 * 60 * 60 * 24);
      if (diff < DISMISS_DAYS) return;
    }

    const offersViewed = store.offersViewed || 0;
    const hasClaimed   = store.hasClaimed || false;
    const visitDays    = (store.visitDays || []).length;

    if (offersViewed >= 3 || hasClaimed || visitDays >= 2) {
      setShowBanner(true);
    }
  }, []);

  // Track an offer view
  const trackOfferView = useCallback(() => {
    const store = getStore();
    setStore({ offersViewed: (store.offersViewed || 0) + 1 });
    checkTrigger();
  }, [checkTrigger]);

  // Track a coupon claim
  const trackCouponClaim = useCallback(() => {
    setStore({ hasClaimed: true });
    checkTrigger();
  }, [checkTrigger]);

  // Trigger install (Android)
  const promptInstall = useCallback(async () => {
    if (deferredPrompt.current) {
      deferredPrompt.current.prompt();
      const result = await deferredPrompt.current.userChoice;
      if (result.outcome === 'accepted') {
        setInstalled(true);
        setShowBanner(false);
        setStore({ installed: true });
      }
      deferredPrompt.current = null;
    }
  }, []);

  // Dismiss banner
  const dismissBanner = useCallback(() => {
    setShowBanner(false);
    setStore({ dismissedAt: new Date().toISOString() });
  }, []);

  // Check trigger on mount (for returning users)
  useEffect(() => { checkTrigger(); }, [checkTrigger]);

  return {
    showBanner,
    isIosDevice,
    installed,
    canPrompt: !!deferredPrompt.current,
    promptInstall,
    dismissBanner,
    trackOfferView,
    trackCouponClaim,
  };
}
