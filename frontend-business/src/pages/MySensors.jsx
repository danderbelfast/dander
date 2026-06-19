import React, { useEffect, useState } from 'react';
import {
  getDevices, registerDevice, decommissionDevice,
  getFootfallDevices, registerFootfallDevice, getFootfallLive,
  getNodes, setNodeCommand, removeNode,
} from '../api/business';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';
import ComplianceGate from '../components/ComplianceGate';

// A FootfallCam device is "connected" if it reported within this window.
const FOOTFALL_ONLINE_MS = 5 * 60 * 1000;

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

  // ── FootfallCam state ─────────────────────────────────────
  const [ffDevices, setFfDevices] = useState([]);
  const [ffLoading, setFfLoading] = useState(true);
  const [ffSerial, setFfSerial]   = useState('');
  const [ffName, setFfName]       = useState('');
  const [ffAdding, setFfAdding]   = useState(false);
  const [ffLive, setFfLive]       = useState({});   // serial -> latest_reading | null
  const [ffLiveBusy, setFfLiveBusy] = useState(null); // serial currently loading

  // ── TapProve Node state ─────────────────────────────────────
  const [nodes, setNodes]               = useState([]);
  const [nodesLoading, setNodesLoading] = useState(true);
  const [nodeBusy, setNodeBusy]         = useState(null);  // device_id currently being toggled
  const [editingZone, setEditingZone]   = useState(null);  // device_id in inline-edit mode
  const [zoneDraft, setZoneDraft]       = useState({ name: '', type: '' });

  function loadNodes() {
    return getNodes()
      .then((d) => setNodes(d.nodes || []))
      .catch(() => toast({ message: 'Failed to load TapProve Node phones.', type: 'error' }))
      .finally(() => setNodesLoading(false));
  }

  async function handleToggleCounting(node) {
    setNodeBusy(node.device_id);
    try {
      await setNodeCommand(node.device_id, { counting_enabled: !node.counting_enabled });
      toast({
        message: `${node.counting_enabled ? 'Paused' : 'Resumed'} counting on ${node.zone_name || node.device_id}.`,
        type: 'success',
      });
      await loadNodes();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to update node.', type: 'error' });
    }
    setNodeBusy(null);
  }

  function startZoneEdit(node) {
    setEditingZone(node.device_id);
    setZoneDraft({ name: node.zone_name || '', type: node.zone_type || 'general' });
  }

  async function saveZoneEdit(node) {
    const name = zoneDraft.name.trim();
    const type = zoneDraft.type.trim();
    if (!name) { setEditingZone(null); return; }
    setNodeBusy(node.device_id);
    try {
      await setNodeCommand(node.device_id, { zone_name: name, zone_type: type || 'general' });
      toast({ message: 'Zone updated. Phone will pick it up on the next upload.', type: 'success' });
      setEditingZone(null);
      await loadNodes();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to update zone.', type: 'error' });
    }
    setNodeBusy(null);
  }

  async function handleRefreshGifs(node) {
    setNodeBusy(node.device_id);
    try {
      await setNodeCommand(node.device_id, { refresh_gifs: true });
      toast({ message: 'Refresh queued — the kiosk picks it up on its next upload.', type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to queue refresh.', type: 'error' });
    }
    setNodeBusy(null);
  }

  async function handleRemoveNode(node) {
    const label = node.zone_name || node.device_id;
    if (!window.confirm(`Remove ${label} from your nodes?\nHistorical data will be preserved.`)) return;
    try {
      await removeNode(node.device_id);
      setNodes((prev) => prev.filter((n) => n.device_id !== node.device_id));
      toast({ message: `Removed ${label}.`, type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to remove node.', type: 'error' });
    }
  }

  function load() {
    setLoading(true);
    getDevices()
      .then((d) => setDevices(d.devices || []))
      .catch(() => toast({ message: 'Failed to load devices.', type: 'error' }))
      .finally(() => setLoading(false));
  }

  function loadFootfall() {
    setFfLoading(true);
    getFootfallDevices()
      .then((d) => setFfDevices(d.devices || []))
      .catch(() => toast({ message: 'Failed to load FootfallCam devices.', type: 'error' }))
      .finally(() => setFfLoading(false));
  }

  useEffect(() => {
    load();
    loadFootfall();
    loadNodes();
    const t = setInterval(loadNodes, 30_000);
    return () => clearInterval(t);
  }, []);

  async function handleRegisterFootfall(e) {
    e.preventDefault();
    if (!ffSerial.trim()) return;
    setFfAdding(true);
    try {
      await registerFootfallDevice({
        device_serial: ffSerial.trim(),
        device_name:   ffName.trim() || null,
      });
      setFfSerial(''); setFfName('');
      toast({ message: 'FootfallCam device registered.', type: 'success' });
      loadFootfall();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to register device.', type: 'error' });
    }
    setFfAdding(false);
  }

  async function handleLiveData(serial) {
    setFfLiveBusy(serial);
    try {
      const res = await getFootfallLive();
      const match = (res.devices || []).find((d) => d.device_serial === serial);
      setFfLive((prev) => ({ ...prev, [serial]: match ? match.latest_reading : null }));
    } catch {
      toast({ message: 'Failed to load live data.', type: 'error' });
    }
    setFfLiveBusy(null);
  }

  function ffStatus(lastSeen) {
    if (!lastSeen) return 'disconnected';
    return (Date.now() - new Date(lastSeen).getTime()) <= FOOTFALL_ONLINE_MS
      ? 'connected'
      : 'disconnected';
  }

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
      {/*
        Non-skippable compliance gate. Self-mounts when the business
        hasn't accepted the current version of the privacy signage for
        their country. The gate fetches its own status, so this is a
        no-op for businesses that are up to date.
      */}
      <ComplianceGate />
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

      {/* ── FootfallCam ─────────────────────────────────────── */}
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '8px 0 0' }}>FootfallCam</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          Register a FootfallCam Pro2 camera by its serial number, then watch live counts.
        </p>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Add FootfallCam device</span></div>
        <div className="card-body">
          <form onSubmit={handleRegisterFootfall} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-grid">
              <div className="field">
                <label className="label label-required">Device serial number</label>
                <input className="input" value={ffSerial} onChange={(e) => setFfSerial(e.target.value)} placeholder="e.g. 15F010242750" required />
              </div>
              <div className="field">
                <label className="label">Device name</label>
                <input className="input" value={ffName} onChange={(e) => setFfName(e.target.value)} placeholder="e.g. Front entrance" />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={ffAdding} style={{ alignSelf: 'flex-start' }}>
              {ffAdding ? <Spinner white /> : 'Register Device'}
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          {ffLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
          ) : ffDevices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--c-text-muted)', fontSize: '0.88rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12, opacity: 0.3 }}>📷</div>
              No FootfallCam devices registered yet. Add one above using its serial number.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Serial</th><th>Last seen</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {ffDevices.map((d) => {
                    const status = ffStatus(d.last_seen);
                    const live   = ffLive[d.device_serial];
                    return (
                      <React.Fragment key={d.device_serial}>
                        <tr>
                          <td>{d.device_name || '—'}</td>
                          <td><code style={{ fontSize: '0.82rem' }}>{d.device_serial}</code></td>
                          <td style={{ color: 'var(--c-text-muted)', fontSize: '0.85rem' }}>{timeAgo(d.last_seen)}</td>
                          <td>
                            <span className={`badge ${status === 'connected' ? 'badge-active' : 'badge-expired'}`}>
                              {status}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleLiveData(d.device_serial)}
                              disabled={ffLiveBusy === d.device_serial}
                            >
                              {ffLiveBusy === d.device_serial ? 'Loading…' : 'Live Data'}
                            </button>
                          </td>
                        </tr>
                        {live !== undefined && (
                          <tr>
                            <td colSpan={5} style={{ background: 'var(--c-bg-subtle, #f7f7f8)', fontSize: '0.85rem' }}>
                              {live ? (
                                <span>
                                  <strong>Latest reading</strong> ({timeAgo(live.timestamp)}):{' '}
                                  In {live.count_in ?? 0} · Out {live.count_out ?? 0} ·
                                  Occupancy {live.occupancy ?? 0} · WiFi {live.wifi_devices ?? 0}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--c-text-muted)' }}>No readings received yet.</span>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── TapProve Nodes (phone-counter PoC) ───────────────── */}
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '8px 0 0' }}>TapProve Nodes</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          Repurposed Android phones running the TapProve Node app — counting people, scanning Bluetooth, listening to room noise.
          Toggle each node on or off from here; changes reach the phone on its next 60-second upload.
        </p>
      </div>

      <NodeUpdatesBanner nodes={nodes} />

      <div className="card">
        <div className="card-body">
          {nodesLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
          ) : nodes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--c-text-muted)', fontSize: '0.88rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12, opacity: 0.3 }}>📱</div>
              No TapProve Node phones paired yet. Download the app and enter your business code.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Zone</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Last seen</th>
                    <th>Counting</th>
                    <th>Version</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {nodes
                    .slice()
                    .sort((a, b) => {
                      // Active first, then recent, then inactive — by ageMs.
                      const aged = (n) => Date.now() - new Date(n.last_seen).getTime();
                      return aged(a) - aged(b);
                    })
                    .map((n) => {
                    const isEditing = editingZone === n.device_id;
                    const busy      = nodeBusy === n.device_id;
                    const ageMs     = Date.now() - new Date(n.last_seen).getTime();
                    const tier      = ageMs > 7 * 24 * 60 * 60 * 1000 ? 'inactive'
                                    : ageMs >     24 * 60 * 60 * 1000 ? 'recent'
                                    : ageMs <          2 * 60 * 1000  ? 'active'
                                    : 'recent';
                    const tierStyle = tier === 'inactive'
                      ? { opacity: 0.55, color: 'var(--c-text-muted)' }
                      : undefined;
                    return (
                      <tr key={n.device_id} style={tierStyle}>
                        <td>
                          {isEditing ? (
                            <input
                              className="input"
                              autoFocus
                              value={zoneDraft.name}
                              onChange={(e) => setZoneDraft({ ...zoneDraft, name: e.target.value })}
                              onBlur={() => saveZoneEdit(n)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveZoneEdit(n);
                                if (e.key === 'Escape') setEditingZone(null);
                              }}
                              style={{ maxWidth: 200 }}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => startZoneEdit(n)}
                              style={{
                                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                color: 'var(--c-text)', fontSize: '0.95rem', textAlign: 'left', textDecoration: 'underline dotted',
                              }}
                              title="Click to rename — phone picks it up on next upload"
                            >
                              {n.zone_name || '(unnamed)'}
                            </button>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <select
                              className="input"
                              value={zoneDraft.type}
                              onChange={(e) => setZoneDraft({ ...zoneDraft, type: e.target.value })}
                              style={{ maxWidth: 140 }}
                            >
                              <option value="entrance">entrance</option>
                              <option value="display">display</option>
                              <option value="till">till</option>
                              <option value="general">general</option>
                            </select>
                          ) : (
                            <span className="badge badge-scheduled" style={{ textTransform: 'capitalize' }}>
                              {n.zone_type || 'general'}
                            </span>
                          )}
                        </td>
                        <td>
                          {tier === 'active'   && <span className="badge badge-active">active</span>}
                          {tier === 'recent'   && <span className="badge badge-scheduled" style={{ background: '#FFE0B2', color: '#7E4500' }}>recent</span>}
                          {tier === 'inactive' && <span className="badge badge-expired" style={{ background: '#EEEEEE', color: '#757575' }}>inactive</span>}
                        </td>
                        <td style={{ color: 'var(--c-text-muted)', fontSize: '0.85rem' }}>{timeAgo(n.last_seen)}</td>
                        <td>
                          <label
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: busy ? 'wait' : 'pointer' }}
                            title={n.counting_enabled ? 'Counting is enabled' : 'Counting is paused remotely'}
                          >
                            <input
                              type="checkbox"
                              checked={!!n.counting_enabled}
                              disabled={busy}
                              onChange={() => handleToggleCounting(n)}
                            />
                            <span style={{ fontSize: '0.85rem', color: 'var(--c-text-muted)' }}>
                              {busy ? '…' : (n.counting_enabled ? 'enabled' : 'paused')}
                            </span>
                          </label>
                        </td>
                        <td title={n.update_available
                          ? `Running v${n.app_version || '?'} — v${n.latest_version} available`
                          : (n.app_version ? `v${n.app_version}` : 'unknown')}>
                          {n.update_available ? (
                            <span style={{
                              display: 'inline-block', padding: '3px 8px', borderRadius: 999,
                              background: '#FFF3CD', color: '#7E4500',
                              fontSize: '0.78rem', fontWeight: 700,
                            }}>
                              ⚠️ v{n.app_version || '?'} → v{n.latest_version}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--c-text-muted)', fontSize: '0.85rem' }}>
                              v{n.app_version || '—'}
                            </span>
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleRefreshGifs(n)}
                            disabled={busy}
                            style={{ marginRight: 4 }}
                            title="Tell the kiosk to re-download every GIF"
                          >
                            ↻ GIFs
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleRemoveNode(n)}
                            style={{
                              color: 'var(--c-danger)',
                              fontWeight: tier === 'inactive' ? 700 : 400,
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Yellow "X TapProve Nodes need updating" banner. Counts the rows where
// update_available is true and lets the operator dismiss for the session
// (sessionStorage so re-opening the page after a fresh upload shows it
// again if applicable).
// ---------------------------------------------------------------------------

function NodeUpdatesBanner({ nodes }) {
  const outdated = (nodes || []).filter((n) => n.update_available);
  const [dismissed, setDismissed] = React.useState(() => {
    try { return sessionStorage.getItem('tapprove_node_updates_dismissed') === '1'; }
    catch { return false; }
  });
  if (outdated.length === 0 || dismissed) return null;
  const latest = outdated[0].latest_version;
  return (
    <div style={{
      background: '#FFF3CD', border: '1px solid #FFB300',
      borderRadius: 10, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>⚠️</div>
      <div style={{ flex: 1, color: '#5C4400' }}>
        <strong>Updates available for {outdated.length} node{outdated.length === 1 ? '' : 's'}</strong>
        <div style={{ fontSize: '0.86rem', marginTop: 4 }}>
          Latest version is v{latest}. Staff can update via the long-press operator panel on each kiosk.
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          try { sessionStorage.setItem('tapprove_node_updates_dismissed', '1'); } catch {}
          setDismissed(true);
        }}
        style={{
          background: 'transparent', border: 'none', color: '#5C4400',
          cursor: 'pointer', fontSize: '1.1rem', padding: 4,
        }}
        title="Dismiss for this session"
      >
        ✕
      </button>
    </div>
  );
}
