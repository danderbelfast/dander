import React, {
  createContext, useContext, useState, useEffect, useRef, useCallback,
} from 'react';
import { getNearby } from '../api/offers';
import { updateLocation } from '../api/push';
import { getAccessToken } from '../api/client';
import { useToast } from './ToastContext';

const LocationContext = createContext(null);

const POLL_INTERVAL = 60_000; // 1 minute
const DEFAULT_RADIUS = 2000;  // 2 km

export function LocationProvider({ children }) {
  const [location, setLocation]       = useState(null);  // { lat, lng, accuracy }
  const [permission, setPermission]   = useState('prompt'); // prompt | granted | denied
  const [nearbyOffers, setNearbyOffers] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [category, setCategory]       = useState('All');

  const seenOfferIds    = useRef(new Set(
    JSON.parse(sessionStorage.getItem('dander_seen_offers') || '[]')
  ));
  const pollTimer       = useRef(null);
  const watchId         = useRef(null);
  const lastLocationPost = useRef(0);
  const { proximity: proximityToast } = useToast();

  // ── Fetch nearby + trigger proximity toasts ─────────────────────────────
  const fetchNearby = useCallback(async (lat, lng, filters = {}) => {
    setLoadingOffers(true);
    try {
      const data = await getNearby({ lat, lng, radius: DEFAULT_RADIUS, ...filters });
      const offers = data.offers || [];
      setNearbyOffers(offers);

      // Proximity notifications for offers not yet seen this session
      const newOffers = offers.filter((o) => !seenOfferIds.current.has(o.id));
      if (newOffers.length > 0) {
        const first = newOffers[0];
        proximityToast(first.business_name, first.title, first.id);
        newOffers.forEach((o) => seenOfferIds.current.add(o.id));
        sessionStorage.setItem(
          'dander_seen_offers',
          JSON.stringify([...seenOfferIds.current])
        );
      }
    } catch {
      // Silently fail polling; user still sees cached results
    } finally {
      setLoadingOffers(false);
    }
  }, [proximityToast]);

  // ── Start foreground polling ─────────────────────────────────────────────
  const startPolling = useCallback((lat, lng) => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    fetchNearby(lat, lng);
    pollTimer.current = setInterval(() => fetchNearby(lat, lng), POLL_INTERVAL);
  }, [fetchNearby]);

  // Hand off to / from SW on visibility change
  useEffect(() => {
    const onHidden = () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      // Tell SW to start background polling
      if (location && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type:  'START_BACKGROUND_POLL',
          lat:   location.lat,
          lng:   location.lng,
          token: getAccessToken(),
        });
      }
    };
    const onVisible = () => {
      // Tell SW to stop (foreground takes over)
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'STOP_BACKGROUND_POLL' });
      }
      if (location && !document.hidden) startPolling(location.lat, location.lng);
    };

    document.addEventListener('visibilitychange', () =>
      document.hidden ? onHidden() : onVisible()
    );
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [location, startPolling]);

  // ── Request geolocation ──────────────────────────────────────────────────
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setPermission('denied');
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setLocation(loc);
        setPermission('granted');
        startPolling(loc.lat, loc.lng);
        // Post location to backend for server-side push (throttled to 1/min)
        const now = Date.now();
        if (now - lastLocationPost.current > 60_000) {
          lastLocationPost.current = now;
          updateLocation(loc.lat, loc.lng).catch(() => {});
        }
      },
      () => { setPermission('denied'); },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 }
    );
  }, [startPolling]);

  // Auto-start if the browser already has permission granted
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.permissions?.query({ name: 'geolocation' }).then((result) => {
      if (result.state === 'granted') requestLocation();
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop watching on unmount
  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  // ── Re-fetch when category filter changes ────────────────────────────────
  useEffect(() => {
    if (!location) return;
    fetchNearby(location.lat, location.lng, { category: category !== 'All' ? category : undefined });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  return (
    <LocationContext.Provider value={{
      location, permission, requestLocation,
      nearbyOffers, loadingOffers,
      category, setCategory,
      refresh: () => location && fetchNearby(location.lat, location.lng),
    }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used inside <LocationProvider>');
  return ctx;
}
