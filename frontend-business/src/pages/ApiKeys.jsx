import React, { useEffect, useState } from 'react';
import { getApiKeys, createApiKey, revokeApiKey } from '../api/business';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';

const AVAILABLE_SCOPES = [
  { value: 'stats:read', label: 'Stats (read)' },
  { value: 'sensors:read', label: 'Sensors (read)' },
  { value: 'sensors:write', label: 'Sensors (write)' },
  { value: 'smart_specials:read', label: 'Smart Specials (read)' },
  { value: 'webhooks:write', label: 'Webhooks (write)' },
];

export default function ApiKeys() {
  const { toast } = useToast();
  const [keys, setKeys]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel]       = useState('');
  const [scopes, setScopes]     = useState([]);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey]     = useState(null);

  function load() {
    setLoading(true);
    getApiKeys()
      .then((d) => setKeys(d.api_keys || []))
      .catch(() => toast({ message: 'Failed to load API keys.', type: 'error' }))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function toggleScope(scope) {
    setScopes((prev) => prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (scopes.length === 0) { toast({ message: 'Select at least one scope.', type: 'error' }); return; }
    setCreating(true);
    try {
      const data = await createApiKey({ label: label.trim() || 'default', scopes });
      setNewKey(data.api_key.key);
      setLabel(''); setScopes([]); setShowCreate(false);
      toast({ message: 'API key created.', type: 'success' });
      load();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to create key.', type: 'error' });
    }
    setCreating(false);
  }

  async function handleRevoke(id) {
    if (!window.confirm('Revoke this API key? It will immediately stop working.')) return;
    try {
      await revokeApiKey(id);
      toast({ message: 'Key revoked.', type: 'success' });
      load();
    } catch { toast({ message: 'Failed to revoke key.', type: 'error' }); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>API Keys</h2>
          <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
            Manage API keys for external integrations.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowCreate(!showCreate); setNewKey(null); }}>
          {showCreate ? 'Cancel' : '+ Create key'}
        </button>
      </div>

      {newKey && (
        <div style={{ background: 'var(--c-success-light, #D1FAE5)', border: '1px solid var(--c-success, #16a34a)', borderRadius: 'var(--r-md)', padding: '14px 18px' }}>
          <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: 6 }}>Your new API key (copy now — it won't be shown again):</div>
          <code style={{ fontSize: '0.82rem', wordBreak: 'break-all', display: 'block', background: '#fff', padding: '10px 14px', borderRadius: 'var(--r-sm)' }}>{newKey}</code>
        </div>
      )}

      {showCreate && (
        <div className="card">
          <div className="card-header"><span className="card-title">Create API key</span></div>
          <div className="card-body">
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label className="label">Label</label>
                <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Kilo IoT integration" />
              </div>
              <div className="field">
                <label className="label label-required">Scopes</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  {AVAILABLE_SCOPES.map((s) => (
                    <label key={s.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={scopes.includes(s.value)} onChange={() => toggleScope(s.value)} />
                      <code style={{ fontSize: '0.8rem' }}>{s.value}</code> — {s.label}
                    </label>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={creating} style={{ alignSelf: 'flex-start' }}>
                {creating ? <Spinner white /> : 'Create key'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
          ) : keys.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--c-text-muted)', fontSize: '0.88rem' }}>
              No API keys yet. Create one to connect external services.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Key prefix</th><th>Label</th><th>Scopes</th><th>Status</th><th>Last used</th><th></th></tr></thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id}>
                      <td><code style={{ fontSize: '0.8rem' }}>{k.key_prefix}...</code></td>
                      <td>{k.label}</td>
                      <td style={{ fontSize: '0.78rem' }}>{(k.scopes || []).join(', ')}</td>
                      <td>{k.is_active ? <span className="badge badge-active">Active</span> : <span className="badge badge-expired">Revoked</span>}</td>
                      <td style={{ color: 'var(--c-text-muted)', fontSize: '0.82rem' }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</td>
                      <td>
                        {k.is_active && (
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--c-danger)' }} onClick={() => handleRevoke(k.id)}>Revoke</button>
                        )}
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
