/**
 * ActivatedOffersContext — single client-side source of truth for "has THIS
 * user activated this offer". Mirrors frontend-user's web context: seeded from
 * getMyOffers on auth, so the Activate control reads "Activated ✓" consistently
 * across offer detail, cards, and My Offers. IDs normalised via String().
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMyOffers } from '../api/offers';
import { useAuth } from './AuthContext';

interface Ctx {
  isActivated: (id: number | string) => boolean;
  markActivated: (id: number | string) => void;
  markDeactivated: (id: number | string) => void;
}

const NOOP: Ctx = { isActivated: () => false, markActivated: () => {}, markDeactivated: () => {} };
const ActivatedOffersContext = createContext<Ctx | null>(null);

export function ActivatedOffersProvider({ children }: { children: React.ReactNode }) {
  const { isAuth } = useAuth();
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let alive = true;
    if (!isAuth) { setIds(new Set()); return; }
    getMyOffers()
      .then((offers) => {
        if (alive) setIds(new Set((offers || []).map((o) => String(o.id))));
      })
      .catch(() => { /* keep whatever we have; transient until next seed */ });
    return () => { alive = false; };
  }, [isAuth]);

  const isActivated = useCallback((id: number | string) => ids.has(String(id)), [ids]);
  const markActivated = useCallback((id: number | string) => {
    setIds((prev) => { const next = new Set(prev); next.add(String(id)); return next; });
  }, []);
  const markDeactivated = useCallback((id: number | string) => {
    setIds((prev) => { const next = new Set(prev); next.delete(String(id)); return next; });
  }, []);

  return (
    <ActivatedOffersContext.Provider value={{ isActivated, markActivated, markDeactivated }}>
      {children}
    </ActivatedOffersContext.Provider>
  );
}

export function useActivatedOffers(): Ctx {
  return useContext(ActivatedOffersContext) ?? NOOP;
}
