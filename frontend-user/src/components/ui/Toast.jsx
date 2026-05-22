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
  const [mutedUntil, setMutedUntil] = React.useState(null);

  React.useEffect(() => {
    const muted = localStorage.getItem('dander_sound_mute_until');
    if (muted && new Date(muted) > new Date()) {
      setMutedUntil(new Date(muted));
    }
  }, []);

  async function handleTurnOff(id) {
    await unsubscribeFromPush();
    dismiss(id);
  }

  function handleView(id, offerId) {
    dismiss(id);
    navigate(`/offer/${offerId}`);
  }

  function handleMuteSounds(e) {
    e.stopPropagation();
    const oneHourFromNow = new Date();
    oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);
    setMutedUntil(oneHourFromNow);
    localStorage.setItem('dander_sound_mute_until', oneHourFromNow.toISOString());
  }

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role="alert" style={{ position: 'relative' }}>
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
          
          {/* Speaker icon to mute sounds */}
          {t.type === 'proximity' && (
            <button
              onClick={handleMuteSounds}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.2rem',
                padding: '4px 8px',
                opacity: 0.6,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
              title={mutedUntil && new Date(mutedUntil) > new Date() ? 'Sounds muted' : 'Mute sounds for 1 hour'}
            >
              {mutedUntil && new Date(mutedUntil) > new Date() ? '🔇' : '🔊'}
            </button>
          )}
          
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}
