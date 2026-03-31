import React from 'react';
import { useToast } from '../../context/ToastContext';

const ICONS = { success: '✓', error: '✕', info: 'ℹ' };

export function ToastContainer() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>{ICONS[t.type]}</span>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.message && <div className="toast-msg">{t.message}</div>}
          </div>
          <button className="toast-close" onClick={() => dismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
