import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNotificationPreferences, saveNotificationPreferences } from '../api/preferences';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';

const CATEGORIES = [
  { key: 'Food & Drink',          icon: '🍽' },
  { key: 'Beauty & Wellness',     icon: '💆' },
  { key: 'Health & Fitness',      icon: '🏋' },
  { key: 'Entertainment',         icon: '🎭' },
  { key: 'Retail & Shopping',     icon: '🛍' },
  { key: 'Services',              icon: '🔧' },
  { key: 'Experiences & Leisure', icon: '🎟' },
];

const RADIUS_OPTIONS = [
  { label: '250m',  value: 250  },
  { label: '500m',  value: 500  },
  { label: '1 km',  value: 1000 },
  { label: '2 km',  value: 2000 },
  { label: '5 km',  value: 5000 },
];

function Toggle({ checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <div className="toggle-track" />
    </label>
  );
}

export default function NotificationPreferences() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [globalOn, setGlobalOn] = useState(true);
  const [prefs, setPrefs]       = useState(
    CATEGORIES.map((c) => ({ category: c.key, enabled: true, radius_meters: 1000 }))
  );

  useEffect(() => {
    getNotificationPreferences()
      .then((data) => {
        setGlobalOn(data.notifications_enabled ?? true);
        // Merge saved prefs with defaults for any missing categories
        setPrefs(CATEGORIES.map((c) => {
          const saved = data.preferences?.find((p) => p.category === c.key);
          return saved || { category: c.key, enabled: true, radius_meters: 1000 };
        }));
      })
      .catch(() => {
        toast({ type: 'error', title: 'Could not load preferences' });
      })
      .finally(() => setLoading(false));
  }, []);

  function setEnabled(cat, val) {
    setPrefs((prev) => prev.map((p) => p.category === cat ? { ...p, enabled: val } : p));
  }

  function setRadius(cat, val) {
    setPrefs((prev) => prev.map((p) => p.category === cat ? { ...p, radius_meters: val } : p));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveNotificationPreferences({ notifications_enabled: globalOn, preferences: prefs });
      toast({ type: 'success', title: 'Preferences saved' });
      navigate(-1);
    } catch {
      toast({ type: 'error', title: 'Could not save preferences' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', color: 'var(--c-text)', display: 'flex', alignItems: 'center' }}
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        Notification Preferences
      </div>

      {/* Global toggle */}
      <div className="settings-section">
        <div className="settings-section-title">All notifications</div>
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span className="settings-row-label">Enable notifications</span>
            <span className="settings-row-value">Turn off to stop all deal alerts</span>
          </div>
          <Toggle checked={globalOn} onChange={(e) => setGlobalOn(e.target.checked)} />
        </div>
      </div>

      {/* Per-category preferences */}
      <div className="settings-section">
        <div className="settings-section-title">By category</div>
        <div style={{ opacity: globalOn ? 1 : 0.4, pointerEvents: globalOn ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
          {CATEGORIES.map((cat, i) => {
            const pref = prefs.find((p) => p.category === cat.key) || { enabled: true, radius_meters: 1000 };
            const isFirst = i === 0;
            const isLast  = i === CATEGORIES.length - 1;
            return (
              <div
                key={cat.key}
                style={{
                  background: 'var(--c-surface)',
                  border: '1px solid var(--c-border)',
                  borderRadius: isFirst
                    ? 'var(--r-md) var(--r-md) 0 0'
                    : isLast
                    ? '0 0 var(--r-md) var(--r-md)'
                    : 0,
                  borderTop: isFirst ? undefined : 'none',
                  padding: '14px 16px',
                }}
              >
                {/* Category row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: pref.enabled ? 'var(--c-primary-dim)' : 'var(--c-surface-raised)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.1rem', transition: 'background 0.2s',
                    }}>
                      {cat.icon}
                    </div>
                    <span style={{ fontWeight: 500, fontSize: '0.92rem' }}>{cat.key}</span>
                  </div>
                  <Toggle
                    checked={pref.enabled}
                    onChange={(e) => setEnabled(cat.key, e.target.checked)}
                  />
                </div>

                {/* Radius chips — only show when enabled */}
                {pref.enabled && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                      Notify me within
                    </div>
                    <div className="radius-chips">
                      {RADIUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          className={`radius-chip ${pref.radius_meters === opt.value ? 'active' : ''}`}
                          onClick={() => setRadius(cat.key, opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '0 16px 32px' }}>
        <button
          className="btn btn-primary btn-block btn-lg"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Spinner size="sm" /> : 'Save preferences'}
        </button>
      </div>
    </>
  );
}
