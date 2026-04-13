import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNotificationPreferences, saveNotificationPreferences } from '../api/preferences';
import { useToast } from '../context/ToastContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Spinner } from '../components/ui/Spinner';

const CATEGORIES = [
  { key: 'Food & Drink',          icon: '🍽' },
  { key: 'Beauty & Wellness',     icon: '💆' },
  { key: 'Health & Fitness',      icon: '🏋' },
  { key: 'Entertainment',         icon: '🎭' },
  { key: 'Retail & Shopping',     icon: '🛍' },
  { key: 'Services',              icon: '🔧' },
  { key: 'Experiences & Leisure', icon: '🎟' },
  { key: 'Other',                 icon: '📦' },
];

const RADIUS_OPTIONS = [
  { label: '250m',  value: 250  },
  { label: '500m',  value: 500  },
  { label: '1 km',  value: 1000 },
  { label: '2 km',  value: 2000 },
  { label: '5 km',  value: 5000 },
];

const NOTIF_TYPES = [
  { key: 'nearby_deals',    label: 'Nearby deal alerts',  sub: 'When a deal is within your set radius', default: true },
  { key: 'new_offers',      label: 'New offers',          sub: 'When a new offer is posted near you', default: true },
  { key: 'expiring_offers', label: 'Expiring offers',     sub: 'When a saved offer is about to expire', default: true },
  { key: 'coupon_reminders', label: 'Coupon reminders',   sub: 'When a claimed coupon is expiring soon', default: true },
];

function Toggle({ checked, onChange, disabled }) {
  return (
    <label className="toggle" style={disabled ? { opacity: 0.4, pointerEvents: 'none' } : {}}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      <div className="toggle-track" />
    </label>
  );
}

export default function NotificationPreferences() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { permission, isSubscribed, initialized, subscribeToPush, unsubscribeFromPush } = usePushNotifications();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [togglingGlobal, setTogglingGlobal] = useState(false);
  const [globalOn, setGlobalOn] = useState(false);

  // Notification types
  const [notifTypes, setNotifTypes] = useState(
    Object.fromEntries(NOTIF_TYPES.map(t => [t.key, t.default]))
  );

  // Per-category
  const [prefs, setPrefs] = useState(
    CATEGORIES.map((c) => ({ category: c.key, enabled: true, radius_meters: 1000 }))
  );

  // Quiet hours
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietFrom, setQuietFrom]       = useState('22:00');
  const [quietUntil, setQuietUntil]     = useState('08:00');

  useEffect(() => {
    getNotificationPreferences()
      .then((data) => {
        setPrefs(CATEGORIES.map((c) => {
          const saved = data.preferences?.find((p) => p.category === c.key);
          return saved || { category: c.key, enabled: true, radius_meters: 1000 };
        }));
        if (data.notification_types) {
          setNotifTypes(prev => ({ ...prev, ...data.notification_types }));
        }
        if (data.quiet_hours) {
          setQuietEnabled(data.quiet_hours.enabled ?? false);
          if (data.quiet_hours.from)  setQuietFrom(data.quiet_hours.from);
          if (data.quiet_hours.until) setQuietUntil(data.quiet_hours.until);
        }
      })
      .catch(() => {
        toast({ type: 'error', title: 'Could not load preferences' });
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialized) setGlobalOn(isSubscribed);
  }, [isSubscribed, initialized]);

  async function handleGlobalToggle(enabled) {
    if (togglingGlobal) return;
    setTogglingGlobal(true);
    try {
      if (enabled) {
        if (permission === 'denied') {
          toast({ type: 'error', title: 'Notifications blocked', message: 'Allow notifications in your browser settings, then try again.' });
          return;
        }
        const ok = await subscribeToPush();
        if (ok) {
          setGlobalOn(true);
          await saveNotificationPreferences({ notifications_enabled: true, preferences: prefs, notification_types: notifTypes, quiet_hours: { enabled: quietEnabled, from: quietFrom, until: quietUntil } }).catch(() => {});
          toast({ type: 'success', title: 'Notifications on', message: "You'll be notified when deals are close." });
        } else {
          toast({ type: 'error', title: 'Could not enable', message: 'Please allow notifications when prompted.' });
        }
      } else {
        await unsubscribeFromPush();
        setGlobalOn(false);
        await saveNotificationPreferences({ notifications_enabled: false, preferences: prefs, notification_types: notifTypes, quiet_hours: { enabled: quietEnabled, from: quietFrom, until: quietUntil } }).catch(() => {});
        toast({ type: 'info', title: 'Notifications off' });
      }
    } finally {
      setTogglingGlobal(false);
    }
  }

  function setEnabled(cat, val) {
    setPrefs((prev) => prev.map((p) => p.category === cat ? { ...p, enabled: val } : p));
  }

  function setRadius(cat, val) {
    setPrefs((prev) => prev.map((p) => p.category === cat ? { ...p, radius_meters: val } : p));
  }

  function toggleNotifType(key) {
    setNotifTypes(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveNotificationPreferences({
        notifications_enabled: globalOn,
        preferences: prefs,
        notification_types: notifTypes,
        quiet_hours: { enabled: quietEnabled, from: quietFrom, until: quietUntil },
      });
      toast({ type: 'success', title: 'Preferences saved' });
      navigate(-1);
    } catch {
      toast({ type: 'error', title: 'Could not save preferences' });
    } finally {
      setSaving(false);
    }
  }

  const denied = permission === 'denied';
  const disabledSection = { opacity: globalOn ? 1 : 0.4, pointerEvents: globalOn ? 'auto' : 'none', transition: 'opacity 0.2s' };

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
        Notifications
      </div>

      {/* Master toggle */}
      <div className="settings-section">
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span className="settings-row-label">Enable notifications</span>
            <span className="settings-row-value">
              {denied
                ? 'Blocked in browser settings'
                : globalOn ? 'On — you\'ll receive deal alerts' : 'Off — no alerts will be sent'}
            </span>
          </div>
          <Toggle checked={globalOn} onChange={(e) => handleGlobalToggle(e.target.checked)} />
        </div>
        {denied && (
          <div style={{ padding: '10px 16px 0', fontSize: '0.78rem', color: 'var(--c-text-muted)', lineHeight: 1.5 }}>
            Notifications are blocked for this site. Open your browser settings and allow notifications for Dander, then reload.
          </div>
        )}
      </div>

      {/* Notification types */}
      <div className="settings-section" style={disabledSection}>
        <div className="settings-section-title">Notification types</div>
        <div>
          {NOTIF_TYPES.map((t, i) => (
            <div key={t.key} className="settings-row" style={{ cursor: 'default' }}>
              <div className="settings-row-left" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span className="settings-row-label">{t.label}</span>
                <span className="settings-row-value">{t.sub}</span>
              </div>
              <Toggle checked={notifTypes[t.key] ?? true} onChange={() => toggleNotifType(t.key)} />
            </div>
          ))}
        </div>
      </div>

      {/* Per-category preferences */}
      <div className="settings-section" style={disabledSection}>
        <div className="settings-section-title">By category</div>
        <div>
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
                  <Toggle checked={pref.enabled} onChange={(e) => setEnabled(cat.key, e.target.checked)} />
                </div>
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

      {/* Quiet hours */}
      <div className="settings-section" style={disabledSection}>
        <div className="settings-section-title">Quiet hours</div>
        <div>
          <div className="settings-row" style={{ cursor: 'default' }}>
            <div className="settings-row-left" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <span className="settings-row-label">Enable quiet hours</span>
              <span className="settings-row-value">We won't send any alerts during these hours</span>
            </div>
            <Toggle checked={quietEnabled} onChange={(e) => setQuietEnabled(e.target.checked)} />
          </div>
          {quietEnabled && (
            <div style={{
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
              borderTop: 'none', borderRadius: '0 0 var(--r-md) var(--r-md)',
              padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '0.88rem', color: 'var(--c-text-muted)' }}>Don't notify me between</span>
              <input type="time" className="input" style={{ width: 110, padding: '6px 10px', fontSize: '0.85rem' }}
                value={quietFrom} onChange={(e) => setQuietFrom(e.target.value)} />
              <span style={{ fontSize: '0.88rem', color: 'var(--c-text-muted)' }}>and</span>
              <input type="time" className="input" style={{ width: 110, padding: '6px 10px', fontSize: '0.85rem' }}
                value={quietUntil} onChange={(e) => setQuietUntil(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {/* Save */}
      <div style={{ padding: '0 16px 16px' }}>
        <button
          className="btn btn-primary btn-block btn-lg"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Spinner size="sm" /> : 'Save preferences'}
        </button>
      </div>

      {/* Info note */}
      <div style={{ padding: '0 16px 32px', textAlign: 'center' }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--c-text-dim)', lineHeight: 1.6 }}>
          You'll only be notified about each deal once every 24 hours
        </p>
      </div>
    </>
  );
}
