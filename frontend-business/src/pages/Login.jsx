import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, verifyLogin2FA } from '../api/auth';
import { getProfile } from '../api/business';
import { useAuth } from '../context/AuthContext';
import { clearAccessToken, setAccessToken } from '../api/client';
import { Spinner } from '../components/ui/Spinner';
import danderLogoWhite from '../assets/Dander_Logo_White.png';

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
      if (data.requires2FA) { setTempToken(data.tempToken); setStep(2); }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password.');
    } finally { setLoading(false); }
  }

  async function handleTotp(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const data    = await verifyLogin2FA(tempToken, totp);
      const payload = decodeJWT(data.accessToken);

      // Verify this account owns a business before granting access
      setAccessToken(data.accessToken);
      try {
        await getProfile();
      } catch {
        clearAccessToken();
        setError('No business account found for these credentials. Please register your business first.');
        setTotp('');
        return;
      }

      authLogin(data.accessToken, data.refreshToken, {
        id: payload.sub, email: payload.email, role: payload.role,
        firstName: data.user?.firstName, lastName: data.user?.lastName,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid code.');
      setTotp('');
    } finally { setLoading(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-left">
        <div className="auth-brand">
          <img src={danderLogoWhite} alt="Dander" style={{ height: 32, width: 'auto' }} />
        </div>
        <h1>Grow your business with smart local offers.</h1>
        <p style={{ marginTop: 20 }}>
          Create targeted deals, reach customers the moment they're nearby,
          and track every redemption in real time.
        </p>
      </div>

      <div className="auth-right">
        <div className="auth-form-card">
          {step === 1 ? (
            <>
              <div className="auth-form-title">Sign in</div>
              <div className="auth-form-subtitle">Welcome back to your business dashboard.</div>
              <form className="auth-form" onSubmit={handleCredentials}>
                {error && <div className="form-error-box">{error}</div>}
                <div className="field">
                  <label className="label">Email address</label>
                  <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@yourbusiness.com" autoComplete="email" required />
                </div>
                <div className="field">
                  <label className="label">Password</label>
                  <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
                </div>
                <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading}>
                  {loading ? <Spinner white /> : 'Sign in'}
                </button>
              </form>
              <p className="auth-link">
                No account yet? <span onClick={() => navigate('/register')}>Register your business</span>
              </p>
            </>
          ) : (
            <>
              <div className="auth-form-title">Check your email</div>
              <div className="auth-form-subtitle">We sent a 6-digit sign-in code to <strong>{email}</strong>.</div>
              <form className="auth-form" onSubmit={handleTotp}>
                {error && <div className="form-error-box">{error}</div>}
                <div className="field">
                  <label className="label">Verification code</label>
                  <input
                    className="input"
                    style={{ fontSize: '1.5rem', letterSpacing: '0.2em', textAlign: 'center', fontFamily: 'monospace' }}
                    type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                    value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000" autoComplete="one-time-code" autoFocus required
                  />
                </div>
                <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading || totp.length < 6}>
                  {loading ? <Spinner white /> : 'Verify & sign in'}
                </button>
                <button type="button" className="btn btn-ghost btn-block" onClick={() => { setStep(1); setError(''); }}>
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
