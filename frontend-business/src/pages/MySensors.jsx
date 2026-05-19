import React, { useEffect, useState } from 'react';
import { getDevices, registerDevice, decommissionDevice } from '../api/business';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';

const STATUS_BADGE = {
  assigned: 'badge-scheduled',
  active: 'badge-active',
  offline: 'badge-expired',
  decommissioned: 'badge-expired',
};

export default function MySensors() {
  const { toast } = useToast();
  const [devices, setDevices]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [label, setLabel]       = useState('');
  const [adding, setAdding]     = useState(false);

  function load() {
    setLoading(true);
    getDevices()
      .then((d) => setDevices(d.devices || []))
      .catch(() => toast({ message: 'Failed to load devices.', type: 'error' }))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleRegister(e) {
    e.preventDefault();
    if (!deviceId.trim()) return;
    setAdding(true);
    try {
      await registerDevice({ device_id: deviceId.trim(), label: label.trim() || null });
      setDeviceId(''); setLabel(''); setShowAdd(false);
      toast({ message: 'Device registered.', type: 'success' });
      load();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to register device.', type: 'error' });
    }
    setAdding(false);
  }

  async function handleDecommission(id) {
    if (!window.confirm('Decommission this device? It will no longer receive readings.')) return;
    try {
      await decommissionDevice(id);
      toast({ message: 'Device decommissioned.', type: 'success' });
      load();
    } catch { toast({ message: 'Failed to decommission device.', type: 'error' }); }
  }

  function timeAgo(ts) {
    if (!ts) return 'Never';
    const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>My Sensors</h2>
          <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
            Manage your Kilo IoT footfall sensors.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Register device'}
        </button>
      </div>

      {showAdd && (
        <div className="card">
          <div className="card-header"><span className="card-title">Register new device</span></div>
          <div className="card-body">
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-grid">
                <div className="field">
                  <label className="label label-required">Device ID</label>
                  <input className="input" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="e.g. kilo_bel_0042" required />
                </div>
                <div className="field">
                  <label className="label">Label</label>
                  <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Front door counter" />
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={adding} style={{ alignSelf: 'flex-start' }}>
                {adding ? <Spinner white /> : 'Register'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
          ) : devices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--c-text-muted)', fontSize: '0.88rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12, opacity: 0.3 }}>📡</div>
              No sensors registered yet. Click "Register device" to add your first Kilo sensor.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Device</th><th>Label</th><th>Status</th><th>Last reading</th><th></th></tr></thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.id}>
                      <td><code style={{ fontSize: '0.82rem' }}>{d.device_id}</code></td>
                      <td>{d.label || '—'}</td>
                      <td><span className={`badge ${STATUS_BADGE[d.status] || ''}`}>{d.status}</span></td>
                      <td style={{ color: 'var(--c-text-muted)', fontSize: '0.85rem' }}>{timeAgo(d.last_reading_at)}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--c-danger)' }} onClick={() => handleDecommission(d.id)}>
                          Decommission
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
