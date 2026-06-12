import React, { useEffect, useState, useRef } from 'react';
import { getStaff, updateProfile, getProfile, getRota, saveRota as saveRotaApi } from '../api/business';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const ROTA_KEY = 'tapprove_biz_rota';

export default function StaffRota() {
  const { toast } = useToast();
  const [staff, setStaff]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [staffCost, setStaffCost] = useState('');
  const [savingCost, setSavingCost] = useState(false);
  const [rota, setRota]           = useState({});
  const debounceRef = useRef(null);

  useEffect(() => {
    Promise.all([getStaff(), getProfile(), getRota()])
      .then(([staffData, profData, rotaData]) => {
        setStaff(staffData.staff || []);
        setStaffCost(profData.business?.avg_hourly_staff_cost_gbp || '');
        const backend = rotaData.rota || {};
        if (Object.keys(backend).length > 0) {
          setRota(backend);
          localStorage.removeItem(ROTA_KEY);
        } else {
          try {
            const cached = JSON.parse(localStorage.getItem(ROTA_KEY));
            if (cached && Object.keys(cached).length > 0) setRota(cached);
          } catch {}
        }
      })
      .catch(() => {
        toast({ message: 'Failed to load data.', type: 'error' });
        try {
          const cached = JSON.parse(localStorage.getItem(ROTA_KEY));
          if (cached) setRota(cached);
        } catch {}
      })
      .finally(() => setLoading(false));
  }, []);

  function persistRota(nextRota) {
    localStorage.setItem(ROTA_KEY, JSON.stringify(nextRota));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveRotaApi(nextRota)
        .then(() => localStorage.removeItem(ROTA_KEY))
        .catch(() => {});
    }, 1000);
  }

  function toggleSlot(staffId, day, hour) {
    const key = `${staffId}-${day}-${hour}`;
    setRota((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      persistRota(next);
      return next;
    });
  }

  function isActive(staffId, day, hour) {
    return !!rota[`${staffId}-${day}-${hour}`];
  }

  async function handleSaveCost() {
    if (!staffCost) return;
    setSavingCost(true);
    try {
      const fd = new FormData();
      fd.append('avg_hourly_staff_cost_gbp', staffCost);
      await updateProfile(fd);
      toast({ message: 'Staff cost updated.', type: 'success' });
    } catch { toast({ message: 'Failed to save.', type: 'error' }); }
    setSavingCost(false);
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Staff Rota</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          Schedule shifts and set your average staff cost for ROI calculations.
        </p>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Average hourly staff cost</span></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className="field" style={{ maxWidth: 200 }}>
              <label className="label">Cost per hour (GBP)</label>
              <input className="input" type="number" min="0" step="0.01" value={staffCost}
                onChange={(e) => setStaffCost(e.target.value)} placeholder="e.g. 11.44" />
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleSaveCost} disabled={savingCost} style={{ marginBottom: 5 }}>
              {savingCost ? <Spinner white /> : 'Save'}
            </button>
          </div>
          <div className="field-hint" style={{ marginTop: 6 }}>Used to calculate staffing cost in your ROI reports.</div>
        </div>
      </div>

      {staff.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: 48, color: 'var(--c-text-muted)', fontSize: '0.88rem' }}>
            No staff members yet. Add staff in your Business Profile to use the rota.
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header"><span className="card-title">Weekly schedule</span></div>
          <div className="card-body" style={{ overflowX: 'auto' }}>
            {staff.filter(s => s.is_active).map((member) => (
              <div key={member.id} style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 8 }}>{member.name || member.email}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(24, 1fr)', gap: 1, fontSize: '0.65rem' }}>
                  <div style={{ padding: '4px 8px' }}></div>
                  {HOURS.map((h) => (
                    <div key={h} style={{ textAlign: 'center', color: 'var(--c-text-dim)', padding: '2px 0' }}>{h}</div>
                  ))}
                  {DAYS.map((day) => (
                    <React.Fragment key={day}>
                      <div style={{ padding: '4px 8px', fontWeight: 500, fontSize: '0.72rem', display: 'flex', alignItems: 'center' }}>{day}</div>
                      {HOURS.map((h) => (
                        <div
                          key={h}
                          onClick={() => toggleSlot(member.id, day, h)}
                          style={{
                            background: isActive(member.id, day, h) ? 'var(--c-primary)' : 'var(--c-bg-muted)',
                            borderRadius: 2,
                            cursor: 'pointer',
                            minHeight: 20,
                            transition: 'background 0.1s',
                          }}
                        />
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
            <div className="field-hint" style={{ marginTop: 8 }}>Click cells to toggle shifts. Changes save automatically.</div>
          </div>
        </div>
      )}
    </div>
  );
}
