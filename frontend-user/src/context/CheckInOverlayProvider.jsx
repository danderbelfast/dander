import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const CheckInOverlayContext = createContext(null);

export function CheckInOverlayProvider({ children }) {
  const [result, setResult] = useState(null);
  const [offer, setOfferState] = useState(null);

  const trigger = useCallback((checkinResult) => {
    setOfferState(null);
    setResult(checkinResult);
  }, []);

  const setOffer = useCallback((o) => setOfferState(o), []);

  const dismiss = useCallback(() => {
    setResult(null);
    setOfferState(null);
  }, []);

  const value = useMemo(
    () => ({ active: result != null, result, offer, trigger, setOffer, dismiss }),
    [result, offer, trigger, setOffer, dismiss]
  );

  return (
    <CheckInOverlayContext.Provider value={value}>
      {children}
    </CheckInOverlayContext.Provider>
  );
}

export function useCheckInOverlay() {
  const ctx = useContext(CheckInOverlayContext);
  if (!ctx) throw new Error('useCheckInOverlay must be used inside <CheckInOverlayProvider>');
  return ctx;
}
