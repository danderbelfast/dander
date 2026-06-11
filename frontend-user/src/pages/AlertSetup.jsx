// WIP — not yet routed; wire up or delete during Prompt 17 (dopamine pass).
/**
 * Alert Setup Screen
 * Onboarding screen for sound/haptic preferences after location permission
 * Users can select their preferred alert style (sound+vibration, vibration only, notifications only)
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as alertService from '../services/alertService';
import * as soundService from '../services/soundService';
import * as hapticService from '../services/hapticService';

const ALERT_STYLES = [
  {
    id: 'sound_haptic',
    title: 'Sound + Vibration',
    subtitle: 'Hear and feel nearby deals',
    icon: '🔊',
    sounds: true,
    haptics: true,
    recommended: true,
  },
  {
    id: 'haptic_only',
    title: 'Vibration only',
    subtitle: 'Silent alerts — feel deals nearby',
    icon: '📳',
    sounds: false,
    haptics: true,
    recommended: false,
  },
  {
    id: 'notifications_only',
    title: 'Notifications only',
    subtitle: 'Visual alerts only',
    icon: '🔔',
    sounds: false,
    haptics: false,
    recommended: false,
  },
];

export default function AlertSetup() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState('sound_haptic');
  const [saving, setSaving] = useState(false);
  const [lastPlayedId, setLastPlayedId] = useState(null);

  async function handleCardSelect(styleId) {
    setSelected(styleId);
    setLastPlayedId(styleId);

    // Play preview based on selection
    const style = ALERT_STYLES.find((s) => s.id === styleId);
    if (!style) return;

    try {
      if (style.sounds && style.haptics) {
        // Play sound + haptic
        await alertService.testAlerts();
      } else if (style.sounds) {
        // Play sound only
        await soundService.newOffer();
      } else if (style.haptics) {
        // Haptic only
        hapticService.dealNearby();
      }
    } catch (err) {
      console.warn('[AlertSetup] Preview error:', err.message);
    }
  }

  async function handleContinue() {
    setSaving(true);
    try {
      const style = ALERT_STYLES.find((s) => s.id === selected);
      if (!style) return;

      // Save preferences locally - they'll be synced to API later
      const prefs = {
        sounds_enabled: style.sounds,
        haptics_enabled: style.haptics,
        alert_volume: 0.7,
      };

      localStorage.setItem('tapprove_sound_prefs', JSON.stringify(prefs));

      // Make API call to save preferences
      const preferencesModule = await import('../api/preferences');
      await preferencesModule.saveNotificationPreferences(prefs).catch(() => {
        // Silently fail - preferences are cached locally anyway
      });

      navigate('/');
    } catch (err) {
      console.error('[AlertSetup] Error saving preferences:', err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--c-bg)',
    }}>
      {/* Header */}
      <div style={{
        padding: '24px 16px 12px',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '1.6rem',
          fontWeight: 700,
          margin: '0 0 8px',
          color: 'var(--c-text)',
        }}>
          How would you like to be alerted?
        </h1>
        <p style={{
          fontSize: '0.9rem',
          color: 'var(--c-text-muted)',
          margin: 0,
        }}>
          You can change this any time in your settings
        </p>
      </div>

      {/* Alert style cards */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        {ALERT_STYLES.map((style) => {
          const isSelected = selected === style.id;
          const wasPlayed = lastPlayedId === style.id;

          return (
            <button
              key={style.id}
              onClick={() => handleCardSelect(style.id)}
              style={{
                all: 'unset',
                background: isSelected ? 'var(--c-primary-dim)' : 'var(--c-surface)',
                border: isSelected
                  ? '2px solid var(--c-primary)'
                  : '1px solid var(--c-border)',
                borderRadius: 'var(--r-md)',
                padding: '16px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'var(--c-surface-raised)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'var(--c-surface)';
                }
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                {/* Icon */}
                <div style={{
                  fontSize: '1.8rem',
                  minWidth: 40,
                }}>
                  {style.icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 4,
                  }}>
                    <h3 style={{
                      margin: 0,
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: 'var(--c-text)',
                    }}>
                      {style.title}
                    </h3>
                    {style.recommended && (
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        background: 'var(--c-primary)',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        Recommended
                      </span>
                    )}
                  </div>
                  <p style={{
                    margin: 0,
                    fontSize: '0.85rem',
                    color: 'var(--c-text-muted)',
                  }}>
                    {style.subtitle}
                  </p>
                </div>

                {/* Checkmark */}
                {isSelected && (
                  <div style={{
                    color: 'var(--c-primary)',
                    fontSize: '1.3rem',
                    fontWeight: 700,
                  }}>
                    ✓
                  </div>
                )}
              </div>

              {/* Playing indicator */}
              {wasPlayed && (
                <div style={{
                  fontSize: '0.75rem',
                  color: 'var(--c-text-muted)',
                  marginTop: 8,
                  marginLeft: 52,
                }}>
                  ▶ Preview playing...
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: '16px',
        borderTop: '1px solid var(--c-border)',
        background: 'var(--c-bg)',
      }}>
        <button
          className="btn btn-primary btn-block btn-lg"
          onClick={handleContinue}
          disabled={saving}
          style={{ marginBottom: 8 }}
        >
          {saving ? 'Saving...' : 'Continue'}
        </button>
        <button
          className="btn btn-ghost btn-block"
          onClick={() => navigate('/')}
          disabled={saving}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
