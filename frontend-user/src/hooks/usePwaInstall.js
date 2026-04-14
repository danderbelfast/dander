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
  const [canPrompt, setCanPrompt]   = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [installed, setInstalled]   = useState(false);

  useEffect(() => {
    if (isStandalone()) { setInstalled(true); return; }
    setIsIosDevice(isIos());

    function onBeforeInstall(e) {
      e.preventDefault();
      deferredPrompt.current = e;
      setCanPrompt(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setShowBanner(false);
      setCanPrompt(false);
      setStore({ installed: true });
    });

    // Record today's visit
    const today = new Date().toISOString().slice(0, 10);
    const days = new Set(getStore().visitDays || []);
    days.add(today);
    setStore({ visitDays: [...days] });

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  // Check if engagement conditions are met
  const checkTrigger = useCallback(() => {
    if (isStandalone()) return;
    const store = getStore();
    if (store.installed) return;

    if (store.dismissedAt) {
      const diff = (Date.now() - new Date(store.dismissedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (diff < DISMISS_DAYS) return;
    }

    const offersViewed = store.offersViewed || 0;
    const hasClaimed   = store.hasClaimed || false;
    const visitDays    = (store.visitDays || []).length;

    if (offersViewed >= 3 || hasClaimed || visitDays >= 2) {
      setShowBanner(true);
    }
  }, []);

  // Re-check trigger when canPrompt changes (prompt just became available)
  useEffect(() => { checkTrigger(); }, [canPrompt, checkTrigger]);

  const trackOfferView = useCallback(() => {
    setStore({ offersViewed: (getStore().offersViewed || 0) + 1 });
    checkTrigger();
  }, [checkTrigger]);

  const trackCouponClaim = useCallback(() => {
    setStore({ hasClaimed: true });
    checkTrigger();
  }, [checkTrigger]);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt.current) return;
    deferredPrompt.current.prompt();
    const result = await deferredPrompt.current.userChoice;
    if (result.outcome === 'accepted') {
      setInstalled(true);
      setShowBanner(false);
      setStore({ installed: true });
    }
    deferredPrompt.current = null;
    setCanPrompt(false);
  }, []);

  const dismissBanner = useCallback(() => {
    setShowBanner(false);
    setStore({ dismissedAt: new Date().toISOString() });
  }, []);

  // Only show banner when we can actually do something:
  // Android: need the deferred prompt available
  // iOS: always show (instructions only)
  const shouldShow = showBanner && (canPrompt || isIosDevice);

  return {
    showBanner: shouldShow,
    isIosDevice,
    installed,
    canPrompt,
    promptInstall,
    dismissBanner,
    trackOfferView,
    trackCouponClaim,
  };
}
