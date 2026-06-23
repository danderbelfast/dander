import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export const CheckInOverlayContext = createContext(null);

export function CheckInOverlayProvider({ children }) {
  const [result, setResult] = useState(null);
  const [offersBusinessId, setOffersBusinessIdState] = useState(null);

  const trigger = useCallback((checkinResult) => {
    setOffersBusinessIdState(null);
    setResult(checkinResult);
  }, []);

  const setOffersBusinessId = useCallback((businessId) => setOffersBusinessIdState(businessId), []);

  const dismiss = useCallback(() => {
    setResult(null);
    setOffersBusinessIdState(null);
  }, []);

  const value = useMemo(
    () => ({ active: result != null, result, offersBusinessId, trigger, setOffersBusinessId, dismiss }),
    [result, offersBusinessId, trigger, setOffersBusinessId, dismiss]
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
