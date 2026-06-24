import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMyOffers } from '../api/offers';
import { useAuth } from './AuthContext';

// Single client-side source of truth for "has THIS user activated this offer".
// Seeded from getMyOffers (the user's live activated offers) on auth, so the
// Activate control shows "Activated ✓" consistently everywhere an offer appears
// — not just momentarily on click. IDs normalized via String() so number/string
// callers match. Anon users keep an empty set (anon activate routes to register;
// post-signup the store re-seeds from My Offers with the stitched offer).
const ActivatedOffersContext = createContext(null);

const NOOP = {
  isActivated: () => false,
  markActivated: () => {},
  markDeactivated: () => {},
};

export function ActivatedOffersProvider({ children }) {
  const { isAuth } = useAuth();
  const [ids, setIds] = useState(() => new Set());

  useEffect(() => {
    let alive = true;
    if (!isAuth) { setIds(new Set()); return; }
    getMyOffers()
      .then((d) => {
        if (!alive) return;
        const list = Array.isArray(d?.offers) ? d.offers : [];
        setIds(new Set(list.map((o) => String(o.id))));
      })
      .catch(() => { /* keep whatever we have; transient until next seed */ });
    return () => { alive = false; };
  }, [isAuth]);

  const isActivated = useCallback((id) => ids.has(String(id)), [ids]);
  const markActivated = useCallback((id) => {
    setIds((prev) => { const next = new Set(prev); next.add(String(id)); return next; });
  }, []);
  const markDeactivated = useCallback((id) => {
    setIds((prev) => { const next = new Set(prev); next.delete(String(id)); return next; });
  }, []);

  return (
    <ActivatedOffersContext.Provider value={{ isActivated, markActivated, markDeactivated }}>
      {children}
    </ActivatedOffersContext.Provider>
  );
}

// Graceful no-op when no provider is mounted, so any surface (or test) rendering
// an Activate control without the provider doesn't crash.
export function useActivatedOffers() {
  return useContext(ActivatedOffersContext) ?? NOOP;
}
