import React, { createContext, useContext } from 'react';
import { usePwaInstall } from '../hooks/usePwaInstall';

const PwaInstallContext = createContext(null);

export function PwaInstallProvider({ children }) {
  const pwa = usePwaInstall();
  return (
    <PwaInstallContext.Provider value={pwa}>
      {children}
    </PwaInstallContext.Provider>
  );
}

export function usePwa() {
  const ctx = useContext(PwaInstallContext);
  if (!ctx) throw new Error('usePwa must be used inside <PwaInstallProvider>');
  return ctx;
}
