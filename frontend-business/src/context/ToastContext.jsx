import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);
let _id = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    setToasts((p) => p.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(({ title, message, type = 'info', duration = 4000 }) => {
    const id = ++_id;
    setToasts((p) => [...p, { id, title, message, type }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const success = (title, message) => toast({ title, message, type: 'success' });
  const error   = (title, message) => toast({ title, message, type: 'error' });

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss, success, error }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
