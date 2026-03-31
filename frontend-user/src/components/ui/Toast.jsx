import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { usePushNotifications } from '../../hooks/usePushNotifications';

const ICONS = {
  proximity: '📍',
  success:   '✓',
  error:     '✕',
  info:      'ℹ',
};

export function ToastContainer() {
  const { toasts, dismiss } = useToast();
  const { unsubscribeFromPush } = usePushNotifications();
  const navigate = useNavigate();

  async function handleTurnOff(id) {
    await unsubscribeFromPush();
    dismiss(id);
  }

  function handleView(id, offerId) {
    dismiss(id);
    navigate(`/offer/${offerId}`);
  }

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role="alert">
          <span className="toast-icon">{ICONS[t.type] || 'ℹ'}</span>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.message && <div className="toast-msg">{t.message}</div>}
            {t.type === 'proximity' && (
              <div className="toast-actions">
                {t.offerId && (
                  <button
                    className="toast-action toast-action-primary"
                    onClick={() => handleView(t.id, t.offerId)}
                  >
                    View offer
                  </button>
                )}
                <button
                  className="toast-action"
                  onClick={() => handleTurnOff(t.id)}
                >
                  Turn off alerts
                </button>
              </div>
            )}
          </div>
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}
