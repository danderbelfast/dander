import React, { useEffect, useState } from 'react';
import { getProfile, updateProfile } from '../api/business';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';

const NOTIF_KEY = 'dander_biz_notif_prefs';
const DEFAULT_PREFS = { coupon_redeemed: true, daily_summary: true, footfall_alert: true };

function loadNotifPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(NOTIF_KEY)) }; }
  catch { return { ...DEFAULT_PREFS }; }
}

function saveNotifPrefs(prefs) {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(prefs));
}

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [staffCost, setStaffCost] = useState('');
  const [notifs, setNotifs]       = useState(loadNotifPrefs);

  useEffect(() => {
    getProfile()
      .then((d) => {
        setStaffCost(d.business?.avg_hourly_staff_cost_gbp || '');
      })
      .catch(() => {})
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
      saveNotifPrefs(next);
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

      <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ alignSelf: 'flex-start' }}>
        {saving ? <Spinner white /> : 'Save settings'}
      </button>
    </div>
  );
}
