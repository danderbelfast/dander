import React, { useEffect, useState } from 'react';
import {
  getProfile, updateProfile,
  getNotifPrefs, saveNotifPrefs as saveNotifPrefsApi,
  getSmartSpecialsSettings, saveSmartSpecialsSettings,
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

  useEffect(() => {
    Promise.all([getProfile(), getNotifPrefs()])
      .then(([profData, notifData]) => {
        setStaffCost(profData.business?.avg_hourly_staff_cost_gbp || '');
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
