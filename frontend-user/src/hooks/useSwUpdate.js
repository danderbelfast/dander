import { useState, useEffect, useRef } from 'react';

const SW_UPDATE_INTERVAL = 60 * 60 * 1000; // 60 minutes

export function useSwUpdate() {
  const [waitingWorker, setWaitingWorker] = useState(null);
  const regRef = useRef(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let intervalId;

    function trackInstalling(worker) {
      worker.addEventListener('statechange', () => {
        // 'installed' + existing controller = new version waiting, not first install
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          setWaitingWorker(worker);
        }
      });
    }

    function onUpdateFound() {
      const reg = regRef.current;
      if (reg?.installing) trackInstalling(reg.installing);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        regRef.current?.update().catch(() => {});
      }
    }

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        regRef.current = reg;

        // Check immediately on each page load
        reg.update().catch(() => {});

        // Check every 60 minutes while the app is open
        intervalId = setInterval(() => {
          reg.update().catch(() => {});
        }, SW_UPDATE_INTERVAL);

        // Check whenever the tab becomes visible (app re-opened)
        document.addEventListener('visibilitychange', onVisibilityChange);

        reg.addEventListener('updatefound', onUpdateFound);

        // Handle case where a new SW is already waiting (e.g. after a hard reload)
        if (reg.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(reg.waiting);
        }
      })
      .catch(() => {});

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      regRef.current?.removeEventListener('updatefound', onUpdateFound);
    };
  }, []);

  function applyUpdate() {
    if (!waitingWorker) return;
    setWaitingWorker(null);
    // Reload as soon as the new SW takes control
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => window.location.reload(),
      { once: true }
    );
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  }

  function dismiss() {
    setWaitingWorker(null);
    // waitingWorker is cleared from state but the SW stays waiting,
    // so the banner will reappear next time the app is opened.
  }

  return { hasUpdate: !!waitingWorker, applyUpdate, dismiss };
}
