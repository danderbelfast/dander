import React, { useEffect, useState } from 'react';
import { getSettings, saveSettings, createAdminUser } from '../api/admin';
import { useToast } from '../context/ToastContext';
import { Spinner, LoadingBlock } from '../components/ui/Spinner';

function Toggle({ checked, onChange }) {
  return (
    <label className="toggle-switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
    </label>
  );
}

export default function Settings() {
  const { addToast } = useToast();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  // Platform settings
  const [platformName, setPlatformName]     = useState('');
  const [supportEmail, setSupportEmail]     = useState('');
  const [maintenanceMode, setMaintenance]   = useState(false);
  const [defaultRadius, setDefaultRadius]   = useState(500);

  // Email settings
  const [adminNotificationEmail, setAdminNotificationEmail] = useState('');
  const [welcomeEmailSubject,    setWelcomeEmailSubject]    = useState('');
  const [welcomeEmailBody,       setWelcomeEmailBody]       = useState('');

  // Create admin form
  const [newEmail, setNewEmail]           = useState('');
  const [newFirstName, setNewFirstName]   = useState('');
  const [newLastName, setNewLastName]     = useState('');
  const [newPassword, setNewPassword]     = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError]     = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  useEffect(() => {
    getSettings()
      .then((s) => {
        setPlatformName(s.platformName || 'Dander');
        setSupportEmail(s.supportEmail || '');
        setMaintenance(s.maintenanceMode || false);
        setDefaultRadius(s.defaultRadius || 500);
        setAdminNotificationEmail(s.adminNotificationEmail || '');
        setWelcomeEmailSubject(s.welcomeEmailSubject || '');
        setWelcomeEmailBody(s.welcomeEmailBody || '');
      })
      .catch(() => addToast('Failed to load settings.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveSettings(e) {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      await saveSettings({ platformName, supportEmail, maintenanceMode, defaultRadius,
                           adminNotificationEmail, welcomeEmailSubject, welcomeEmailBody });
      addToast('Settings saved.', 'success');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save settings.');
    } finally { setSaving(false); }
  }

  async function handleCreateAdmin(e) {
    e.preventDefault();
    setCreateError(''); setCreateSuccess(''); setCreateLoading(true);
    try {
      await createAdminUser({ email: newEmail, firstName: newFirstName, lastName: newLastName, password: newPassword });
      setCreateSuccess(`Admin account created for ${newEmail}. They'll need to set up 2FA on first login.`);
      setNewEmail(''); setNewFirstName(''); setNewLastName(''); setNewPassword('');
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create admin user.');
    } finally { setCreateLoading(false); }
  }

  if (loading) return <LoadingBlock label="Loading settings…" />;

  return (
    <div className="settings-layout">

      {/* Platform settings */}
      <div className="card">
        <div className="card-header"><span className="card-title">Platform settings</span></div>
        <div className="card-body">
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && <div className="form-error-box">{error}</div>}

            <div className="form-grid">
              <div className="field">
                <label className="label label-required">Platform name</label>
                <input className="input" value={platformName} onChange={(e) => setPlatformName(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label label-required">Support email</label>
                <input className="input" type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} required />
              </div>
            </div>

            <div className="field">
              <label className="label">Default offer radius (metres)</label>
              <select className="select" value={defaultRadius} onChange={(e) => setDefaultRadius(Number(e.target.value))} style={{ maxWidth: 200 }}>
                <option value={100}>100 m</option>
                <option value={250}>250 m</option>
                <option value={500}>500 m (recommended)</option>
                <option value={1000}>1 km</option>
                <option value={2000}>2 km</option>
              </select>
              <div className="field-hint">Used as the pre-selected radius when businesses create new offers.</div>
            </div>

            <div className="toggle-row">
              <div className="toggle-info">
                <div className="label">Maintenance mode</div>
                <div className="field-hint">When enabled, the user app shows a maintenance screen. Business and admin logins still work.</div>
              </div>
              <Toggle checked={maintenanceMode} onChange={setMaintenance} />
            </div>

            {maintenanceMode && (
              <div style={{ background: 'var(--c-warning-bg)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: '0.78rem', color: 'var(--c-warning)' }}>
                ⚠️ Maintenance mode is active — the user-facing app is currently offline.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" type="submit" style={{ minWidth: 120 }} disabled={saving}>
                {saving ? <Spinner white /> : 'Save settings'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Email notifications */}
      <div className="card">
        <div className="card-header"><span className="card-title">Email notifications</span></div>
        <div className="card-body">
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className="field">
              <label className="label">Admin notification email</label>
              <input
                className="input"
                type="email"
                value={adminNotificationEmail}
                onChange={(e) => setAdminNotificationEmail(e.target.value)}
                placeholder="admin@yourdomain.com"
              />
              <div className="field-hint">When a new business registers, an alert is sent to this address.</div>
            </div>

            <div className="field">
              <label className="label">Welcome email subject</label>
              <input
                className="input"
                value={welcomeEmailSubject}
                onChange={(e) => setWelcomeEmailSubject(e.target.value)}
                placeholder="Welcome to Dander! Your business is approved 🎉"
              />
              <div className="field-hint">Sent to business owners when you approve their application. Leave blank to use the default.</div>
            </div>

            <div className="field">
              <label className="label">Welcome email body</label>
              <textarea
                className="input"
                rows={6}
                value={welcomeEmailBody}
                onChange={(e) => setWelcomeEmailBody(e.target.value)}
                placeholder="Write a friendly welcome message here. Each line becomes a paragraph. Leave blank to use the default message."
                style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
              />
              <div className="field-hint">You can use {'{businessName}'} and {'{ownerName}'} as placeholders.</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" type="submit" style={{ minWidth: 120 }} disabled={saving}>
                {saving ? <Spinner white /> : 'Save settings'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Create admin user */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Create admin user</span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
            New admin accounts are created with the provided credentials. The user will need to configure
            two-factor authentication before they can sign in.
          </p>
          <form onSubmit={handleCreateAdmin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {createError   && <div className="form-error-box">{createError}</div>}
            {createSuccess && (
              <div style={{ background: 'var(--c-success-bg)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: '0.78rem', color: 'var(--c-success)' }}>
                ✓ {createSuccess}
              </div>
            )}

            <div className="form-grid">
              <div className="field">
                <label className="label label-required">First name</label>
                <input className="input" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">Last name</label>
                <input className="input" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label className="label label-required">Email address</label>
              <input className="input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
            </div>

            <div className="field">
              <label className="label label-required">Temporary password</label>
              <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters" minLength={8} required />
              <div className="field-hint">The new admin should change this on first login.</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" type="submit" disabled={createLoading} style={{ minWidth: 140 }}>
                {createLoading ? <Spinner white /> : 'Create admin account'}
              </button>
            </div>
          </form>
        </div>
      </div>

    </div>
  );
}
