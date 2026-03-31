import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

let _nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(({ title, message, type = 'info', duration = 4500, offerId }) => {
    const id = ++_nextId;
    setToasts((prev) => [...prev, { id, title, message, type, offerId }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const proximity = useCallback((businessName, offerTitle, offerId) => {
    toast({
      type:    'proximity',
      title:   `📍 ${businessName}`,
      message: offerTitle,
      offerId,
      duration: 6000,
    });
  }, [toast]);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss, proximity }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
