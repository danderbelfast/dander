import React, { useEffect, useState } from 'react';
import {
  getProfile, updateProfile,
  getNotifPrefs, saveNotifPrefs as saveNotifPrefsApi,
  getSmartSpecialsSettings, saveSmartSpecialsSettings,
  saveOpeningHours,
} from '../api/business';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';

const NOTIF_KEY = 'dander_biz_notif_prefs';
const DEFAULT_PREFS = { coupon_redeemed: true, daily_summary: true, footfall_alert: true };

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [staffCost, setStaffCost] = useState('');
  const [notifs, setNotifs]       = useState({ ...DEFAULT_PREFS });
  const [businessCode, setBusinessCode] = useState('');
  const [codeCopied, setCodeCopied]     = useState(false);

  useEffect(() => {
    Promise.all([getProfile(), getNotifPrefs()])
      .then(([profData, notifData]) => {
        setStaffCost(profData.business?.avg_hourly_staff_cost_gbp || '');
        setBusinessCode(profData.business?.business_code || '');
        const backend = notifData.prefs || {};
        if (Object.keys(backend).length > 0) {
          setNotifs({ ...DEFAULT_PREFS, ...backend });
          localStorage.removeItem(NOTIF_KEY);
        } else {
          try {
            const cached = JSON.parse(localStorage.getItem(NOTIF_KEY));
            if (cached) setNotifs({ ...DEFAULT_PREFS, ...cached });
          } catch {}
        }
      })
      .catch(() => {
        try {
          const cached = JSON.parse(localStorage.getItem(NOTIF_KEY));
          if (cached) setNotifs({ ...DEFAULT_PREFS, ...cached });
        } catch {}
      })
      .finally(() => setLoading(false));

    const pending = localStorage.getItem('dander_reg_staff_cost');
    if (pending) {
      setStaffCost(pending);
      localStorage.removeItem('dander_reg_staff_cost');
    }
  }, []);

  function toggleNotif(key) {
    setNotifs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(NOTIF_KEY, JSON.stringify(next));
      saveNotifPrefsApi(next)
        .then(() => localStorage.removeItem(NOTIF_KEY))
        .catch(() => {});
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const fd = new FormData();
      if (staffCost) fd.append('avg_hourly_staff_cost_gbp', staffCost);
      await updateProfile(fd);
      toast({ message: 'Settings saved.', type: 'success' });
    } catch { toast({ message: 'Failed to save settings.', type: 'error' }); }
    setSaving(false);
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Settings</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          Account and business configuration.
        </p>
      </div>

      {businessCode && (
        <div className="card">
          <div className="card-header"><span className="card-title">Business code</span></div>
          <div className="card-body">
            <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 0 }}>
              Give this 4-digit code to staff installing a Dander Node phone. They&apos;ll enter it on
              first launch to link the phone to your business.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                fontFamily: 'monospace', fontSize: '2rem', fontWeight: 700,
                letterSpacing: 6, color: 'var(--c-text)',
                padding: '6px 14px',
                background: 'var(--c-bg-subtle, #f7f7f8)', borderRadius: 8,
              }}>
                {businessCode}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(businessCode);
                    setCodeCopied(true);
                    setTimeout(() => setCodeCopied(false), 1500);
                  } catch {
                    toast({ message: 'Could not copy to clipboard.', type: 'error' });
                  }
                }}
              >
                {codeCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      <QueueAlertSettings />

      <OpeningHoursEditor />

      <div className="card">
        <div className="card-header"><span className="card-title">Account</span></div>
        <div className="card-body">
          <div className="field">
            <label className="label">Email</label>
            <input className="input" value={user?.email || ''} disabled />
            <div className="field-hint">Contact support to change your email address.</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Business costs</span></div>
        <div className="card-body">
          <div className="field">
            <label className="label">Average hourly staff cost (GBP)</label>
            <input className="input" type="number" min="0" step="0.01" value={staffCost}
              onChange={(e) => setStaffCost(e.target.value)} placeholder="e.g. 11.44" />
            <div className="field-hint">Used in ROI reports and daily insights to calculate staffing costs against revenue.</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Notifications</span></div>
        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={notifs.coupon_redeemed} onChange={() => toggleNotif('coupon_redeemed')} />
              Email me when a coupon is redeemed
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={notifs.daily_summary} onChange={() => toggleNotif('daily_summary')} />
              Email me daily footfall summaries
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={notifs.footfall_alert} onChange={() => toggleNotif('footfall_alert')} />
              Alert me when footfall drops below threshold
            </label>
          </div>
          <div className="field-hint" style={{ marginTop: 10 }}>Notification preferences are saved automatically.</div>
        </div>
      </div>

      <SmartSpecialsSection />

      <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ alignSelf: 'flex-start' }}>
        {saving ? <Spinner white /> : 'Save settings'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Smart Specials defaults section
// ---------------------------------------------------------------------------

function formatTime(t) {
  if (!t) return '';
  return String(t).slice(0, 5);
}

function SmartSpecialsSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const [offerType, setOfferType] = useState('discount');
  const [pct,       setPct]       = useState(15);
  const [dur,       setDur]       = useState(24);
  const [start,     setStart]     = useState('08:00');
  const [end,       setEnd]       = useState('20:00');

  useEffect(() => {
    getSmartSpecialsSettings()
      .then((d) => {
        const s = d.settings || {};
        setOfferType(s.ss_default_offer_type || 'discount');
        setPct(s.ss_default_discount_pct ?? 15);
        setDur(s.ss_default_duration_hours ?? 24);
        setStart(formatTime(s.ss_active_hours_start) || '08:00');
        setEnd(formatTime(s.ss_active_hours_end) || '20:00');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await saveSmartSpecialsSettings({
        ss_default_offer_type:     offerType,
        ss_default_discount_pct:   parseInt(pct, 10),
        ss_default_duration_hours: parseInt(dur, 10),
        ss_active_hours_start:     start,
        ss_active_hours_end:       end,
      });
      toast({ message: 'Smart Specials defaults saved.', type: 'success' });
    } catch {
      toast({ message: 'Failed to save Smart Specials defaults.', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Smart Specials defaults</span></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: '0.86rem', color: 'var(--c-text-muted)', marginTop: 0 }}>
          These pre-fill the Smart Specials wizard every time you open it. You can change them in the wizard too.
        </p>

        {loading ? (
          <Spinner />
        ) : (
          <>
            <div className="field">
              <label className="label">Default offer type</label>
              <select className="input" value={offerType} onChange={(e) => setOfferType(e.target.value)}>
                <option value="discount">Discount</option>
                <option value="freebie">Freebie</option>
                <option value="urgency">Urgency</option>
              </select>
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="label">Default discount %</label>
                <input className="input" type="number" min="1" max="100"
                  value={pct} onChange={(e) => setPct(e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Default duration (hours)</label>
                <input className="input" type="number" min="1" max="168"
                  value={dur} onChange={(e) => setDur(e.target.value)} />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="label">Active hours from</label>
                <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Active hours to</label>
                <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={save} disabled={saving} style={{ alignSelf: 'flex-start' }}>
              {saving ? <Spinner white /> : 'Save Smart Specials defaults'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue Alert Settings — local-only stub for the PoC. Threshold is currently
// authoritative on the phone (Settings → "Alert when queue reaches X people");
// this card mirrors a future server-side default + delivery channels. Email
// and push are intentionally inactive toggles for now.
// ---------------------------------------------------------------------------

function QueueAlertSettings() {
  const [threshold, setThreshold] = React.useState(() => {
    const v = parseInt(window.localStorage.getItem('dander_queue_threshold_default') || '', 10);
    return Number.isFinite(v) && v > 0 ? v : 3;
  });
  const [emailOn, setEmailOn] = React.useState(false);
  const [pushOn,  setPushOn]  = React.useState(false);

  function persistThreshold(v) {
    const n = Math.max(1, Math.min(99, parseInt(v, 10) || 3));
    setThreshold(n);
    try { window.localStorage.setItem('dander_queue_threshold_default', String(n)); } catch {}
  }

  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Queue Alert Settings</span></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.86rem', marginTop: 0 }}>
          Default threshold for till zones that don&apos;t override it on the phone. The bell in the top
          bar fires whenever a till zone&apos;s live queue passes this number.
        </p>

        <div className="field" style={{ maxWidth: 200 }}>
          <label className="label">Default threshold</label>
          <input
            className="input"
            type="number"
            min="1"
            max="99"
            value={threshold}
            onChange={(e) => persistThreshold(e.target.value)}
          />
          <div className="field-hint">Alert when queue reaches this many people.</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem', opacity: 0.75 }}>
            <input type="checkbox" checked={emailOn} onChange={() => setEmailOn((v) => !v)} />
            Email me when a queue alert fires
            <span style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)' }}>(coming soon)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem', opacity: 0.75 }}>
            <input type="checkbox" checked={pushOn} onChange={() => setPushOn((v) => !v)} />
            Push notifications on this device
            <span style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)' }}>(coming soon)</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opening Hours — per-day weekly schedule editor. Saves to
// businesses.opening_hours AND pushes to every paired Dander Node via the
// existing remote-command channel.
// ---------------------------------------------------------------------------

const DAY_LIST = [
  { key: 'monday',    label: 'Monday'    },
  { key: 'tuesday',   label: 'Tuesday'   },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday',  label: 'Thursday'  },
  { key: 'friday',    label: 'Friday'    },
  { key: 'saturday',  label: 'Saturday'  },
  { key: 'sunday',    label: 'Sunday'    },
];

const DEFAULT_HOURS = {
  monday:    { open: '09:00', close: '17:30', closed: false },
  tuesday:   { open: '09:00', close: '17:30', closed: false },
  wednesday: { open: '09:00', close: '17:30', closed: false },
  thursday:  { open: '09:00', close: '17:30', closed: false },
  friday:    { open: '09:00', close: '17:30', closed: false },
  saturday:  { open: '10:00', close: '16:00', closed: false },
  sunday:    { open: '09:00', close: '17:30', closed: true  },
};

function OpeningHoursEditor() {
  const { toast } = useToast();
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProfile()
      .then(({ business }) => {
        if (business?.opening_hours) {
          // Merge incoming with defaults so a missing day doesn't blank the editor.
          const merged = { ...DEFAULT_HOURS };
          for (const d of DAY_LIST) {
            if (business.opening_hours[d.key]) {
              merged[d.key] = { ...DEFAULT_HOURS[d.key], ...business.opening_hours[d.key] };
            }
          }
          setHours(merged);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function updateDay(key, patch) {
    setHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function copyMondayToWeekdays() {
    const mon = hours.monday;
    setHours((prev) => ({
      ...prev,
      tuesday:   { ...mon },
      wednesday: { ...mon },
      thursday:  { ...mon },
      friday:    { ...mon },
    }));
    toast({ message: 'Applied Monday hours to Tue-Fri.', type: 'success' });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await saveOpeningHours(hours);
      const n = res.nodes_updated ?? 0;
      toast({
        message: n === 0
          ? 'Opening hours saved.'
          : `Hours saved and pushed to ${n} Dander Node${n === 1 ? '' : 's'}.`,
        type: 'success',
      });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save hours.', type: 'error' });
    }
    setSaving(false);
  }

  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Opening Hours</span></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.86rem', marginTop: 0 }}>
          The schedule below applies to every Dander Node paired to your business — saved here, pushed out on the next 60-second upload.
        </p>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner /></div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 8 }}>
              {DAY_LIST.map((d) => {
                const day = hours[d.key];
                const dim = day.closed ? 0.4 : 1;
                return (
                  <div
                    key={d.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '110px 100px 100px 100px',
                      gap: 10,
                      alignItems: 'center',
                      padding: '6px 0',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{d.label}</div>
                    <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.82rem' }}>
                      <input
                        type="checkbox"
                        checked={!!day.closed}
                        onChange={(e) => updateDay(d.key, { closed: e.target.checked })}
                      />
                      Closed
                    </label>
                    <input
                      className="input"
                      type="time"
                      value={day.open}
                      disabled={day.closed}
                      style={{ opacity: dim }}
                      onChange={(e) => updateDay(d.key, { open: e.target.value })}
                    />
                    <input
                      className="input"
                      type="time"
                      value={day.close}
                      disabled={day.closed}
                      style={{ opacity: dim }}
                      onChange={(e) => updateDay(d.key, { close: e.target.value })}
                    />
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              <button className="btn btn-secondary" type="button" onClick={copyMondayToWeekdays}>
                Apply Monday hours to Tue–Fri
              </button>
              <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
                {saving ? <Spinner white /> : 'Save Opening Hours'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
