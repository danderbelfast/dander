import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import client from '../api/client';

export default function Settings() {
  const { user, logout, updateUser } = useAuth();
  const { toast }        = useToast();
  const navigate         = useNavigate();

  // Password change state
  const [changingPwd, setChangingPwd] = useState(false);
  const [oldPwd, setOldPwd]           = useState('');
  const [newPwd, setNewPwd]           = useState('');
  const [pwdLoading, setPwdLoading]   = useState(false);

  const initials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || '?'
    : '?';

  const avatarInputRef = useRef(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const res = await client.put('/api/users/me/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      updateUser({ avatarUrl: res.data.avatar_url });
      toast({ type: 'success', title: 'Photo updated' });
    } catch {
      toast({ type: 'error', title: 'Upload failed', message: 'Could not update profile photo.' });
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    if (newPwd.length < 8) { toast({ type: 'error', title: 'Password too short', message: 'Min. 8 characters.' }); return; }
    setPwdLoading(true);
    try {
      await client.put('/api/users/me/password', { currentPassword: oldPwd, newPassword: newPwd });
      toast({ type: 'success', title: 'Password updated', message: 'Your new password is active.' });
      setChangingPwd(false); setOldPwd(''); setNewPwd('');
    } catch (err) {
      toast({ type: 'error', title: 'Error', message: err.response?.data?.message || 'Password change failed.' });
    } finally {
      setPwdLoading(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  return (
    <>
      <div className="page-header">Profile</div>

      {/* Avatar + name */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '8px 0 32px' }}>
        <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
        <button
          onClick={() => avatarInputRef.current?.click()}
          disabled={avatarUploading}
          style={{
            position: 'relative', width: 80, height: 80, borderRadius: '50%', padding: 0,
            background: 'var(--c-primary-dim)', border: '2.5px solid var(--c-primary)',
            overflow: 'hidden', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Change profile photo"
        >
          {user?.avatarUrl
            ? <img src={user.avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '1.6rem', fontFamily: 'var(--f-head)', fontWeight: 700, color: 'var(--c-primary)' }}>{initials}</span>
          }
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'rgba(0,0,0,0.45)', fontSize: '0.6rem', color: '#fff',
            textAlign: 'center', padding: '3px 0', letterSpacing: '0.03em',
          }}>
            {avatarUploading ? '…' : 'Edit'}
          </div>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--f-head)', fontWeight: 700, fontSize: '1.1rem' }}>
            {user?.firstName} {user?.lastName}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--c-text-muted)' }}>{user?.email}</div>
        </div>
      </div>

      {/* Account */}
      <div className="settings-section">
        <div className="settings-section-title">Account</div>
        <div>
          <div className="settings-row" onClick={() => setChangingPwd((v) => !v)}>
            <div className="settings-row-left">
              <div className="settings-row-icon">🔑</div>
              <span className="settings-row-label">Change password</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>

          {changingPwd && (
            <form onSubmit={handlePasswordChange} style={{ padding: '16px', background: 'var(--c-surface)', borderTop: '1px solid var(--c-border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Current password</label>
                <input className="input" type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} required />
              </div>
              <div className="input-group">
                <label className="input-label">New password</label>
                <input className="input" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required />
              </div>
              <button className="btn btn-primary btn-sm" type="submit" disabled={pwdLoading}>
                {pwdLoading ? 'Saving…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Notifications */}
      <div className="settings-section">
        <div className="settings-section-title">Notifications</div>
        <div>
          <div className="settings-row" onClick={() => navigate('/notification-preferences')}>
            <div className="settings-row-left">
              <div className="settings-row-icon">🔔</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span className="settings-row-label">Nearby deal alerts</span>
                <span className="settings-row-value">Manage alerts and per-category preferences</span>
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
      </div>

      {/* App info */}
      <div className="settings-section">
        <div className="settings-section-title">App</div>
        <div>
          <div className="settings-row" style={{ cursor: 'default' }}>
            <div className="settings-row-left">
              <div className="settings-row-icon">ℹ️</div>
              <span className="settings-row-label">Version</span>
            </div>
            <span className="settings-row-value">1.0.0</span>
          </div>
          <div className="settings-row" onClick={() => window.open('mailto:support@dander.app')}>
            <div className="settings-row-left">
              <div className="settings-row-icon">✉️</div>
              <span className="settings-row-label">Contact support</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="settings-section">
        <button className="btn btn-danger btn-block" onClick={handleLogout}>
          Sign out
        </button>
      </div>

      <div style={{ height: 16 }} />
    </>
  );
}
