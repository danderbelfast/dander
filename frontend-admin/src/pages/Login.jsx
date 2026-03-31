import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, verifyLogin2FA } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui/Spinner';

function decodeJWT(t) { try { return JSON.parse(atob(t.split('.')[1])); } catch { return {}; } }

export default function Login() {
  const navigate = useNavigate();
  const { login: authLogin } = useAuth();

  const [step, setStep]         = useState(1);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [totp, setTotp]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleCredentials(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const data = await login(email, password);
      if (data.requires2FA) {
        setTempToken(data.tempToken);
        setStep(2);
      } else {
        setError('Admin accounts require two-factor authentication.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid email or password.';
      setError(msg.includes('not admin') || err.response?.status === 403
        ? 'This account does not have admin access.'
        : msg);
    } finally { setLoading(false); }
  }

  async function handleTotp(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const data = await verifyLogin2FA(tempToken, totp);
      const payload = decodeJWT(data.accessToken);
      if (payload.role !== 'admin') {
        setError('This account does not have admin access.');
        return;
      }
      authLogin(data.accessToken, data.refreshToken, {
        id: payload.sub, email: payload.email, role: payload.role,
        firstName: data.user?.firstName, lastName: data.user?.lastName,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid code. Try again.');
      setTotp('');
    } finally { setLoading(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-panel">
        <div className="auth-logo">
          <div className="auth-logo-mark">🔥</div>
          Dander Admin
        </div>
        <h1>Platform control centre.</h1>
        <p style={{ marginTop: 14 }}>
          Monitor businesses, manage offers, review users, and keep the platform healthy from one place.
        </p>
        <div style={{ marginTop: 40, padding: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--r-md)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--f-mono)' }}>
          Admin access only. All actions are logged.
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-card">
          {step === 1 ? (
            <>
              <div className="auth-form-title">Admin sign in</div>
              <div className="auth-form-sub">Enter your admin credentials to continue.</div>
              <form className="auth-form" onSubmit={handleCredentials}>
                {error && <div className="form-error-box">{error}</div>}
                <div className="field">
                  <label className="label">Email address</label>
                  <input className="input" type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@dander.io" autoComplete="email" required />
                </div>
                <div className="field">
                  <label className="label">Password</label>
                  <input className="input" type="password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" autoComplete="current-password" required />
                </div>
                <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading}>
                  {loading ? <Spinner white /> : 'Continue →'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="auth-form-title">Two-factor authentication</div>
              <div className="auth-form-sub">Enter the 6-digit code from your authenticator app.</div>
              <form className="auth-form" onSubmit={handleTotp}>
                {error && <div className="form-error-box">{error}</div>}
                <div className="field">
                  <label className="label">Authentication code</label>
                  <input
                    className="input input-mono"
                    type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                    value={totp}
                    onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000" autoComplete="one-time-code" autoFocus required
                  />
                </div>
                <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading || totp.length < 6}>
                  {loading ? <Spinner white /> : 'Verify & sign in'}
                </button>
                <button type="button" className="btn btn-ghost btn-block" onClick={() => { setStep(1); setError(''); setTotp(''); }}>
                  ← Back
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
