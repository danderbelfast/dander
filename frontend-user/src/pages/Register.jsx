import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { register, verifySetup2FA, resendOtp } from '../api/auth';
import { Spinner } from '../components/ui/Spinner';
import tapproveLogoBlack from '../assets/TapProve_Logo_Black.png';
import { useAuth } from '../context/AuthContext';
import { postAuthDestination } from '../utils/postAuthDestination';

const SESSION_KEY = 'tapprove_register_otp';

function decodeJWT(token) {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return {}; }
}

export default function Register() {
  const navigate = useNavigate();
  const { login: authLogin } = useAuth();

  const [step, setStep]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [resent, setResent]   = useState(false);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [phone, setPhone]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');

  // After registration
  const [userId, setUserId]   = useState(null);
  const [otpCode, setOtpCode] = useState('');

  // Restore OTP step if page was reloaded mid-flow
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (saved?.userId) {
        setUserId(saved.userId);
        setEmail(saved.email);
        setStep(2);
      }
    } catch {}
  }, []);

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }

    if (!/[A-Z]/.test(password)) { setError('Password must contain at least one uppercase letter.'); return; }
    if (!/[0-9]/.test(password)) { setError('Password must contain at least one number.'); return; }

    setLoading(true);
    try {
      const data = await register({ email, phone: phone || undefined, firstName, lastName, password });
      setUserId(data.userId);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId: data.userId, email }));
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await verifySetup2FA(userId, otpCode);
      sessionStorage.removeItem(SESSION_KEY);

      // The backend returns full tokens here — log the new user in directly
      // (no bounce to /login) and replay any pending tap so they earn now.
      if (data?.accessToken && data?.refreshToken) {
        const payload = decodeJWT(data.accessToken);
        authLogin(data.accessToken, data.refreshToken, {
          id: payload.sub, email: payload.email, role: payload.role,
          firstName: data.user?.firstName ?? null,
          lastName: data.user?.lastName ?? null,
          avatarUrl: data.user?.avatarUrl ?? null,
        });
        navigate(postAuthDestination(), { replace: true });
      } else {
        // Fallback: backend didn't issue tokens — keep the old behaviour.
        setStep(3);
        setTimeout(() => navigate('/login'), 2000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired code. Please try again.');
      setOtpCode('');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(''); setResent(false);
    try {
      await resendOtp(userId, 'register');
      setResent(true);
    } catch {
      setError('Could not resend code. Please try again.');
    }
  }

  if (step === 3) {
    return (
      <div className="auth-page page-full" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 16 }}>
        <div style={{ fontSize: '3rem' }}>✅</div>
        <h2 className="font-head">You're all set!</h2>
        <p className="text-muted">Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <div className="auth-page page-full" style={{ overflowY: 'auto' }}>
      <button className="auth-back" onClick={() => navigate('/for-users')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <img src={tapproveLogoBlack} alt="TapProve" className="auth-logo" />

      {step === 1 && (
        <>
          <h1 className="auth-title">Create account.</h1>
          <p className="auth-subtitle">Great deals are waiting near you.</p>

          <form className="auth-form" onSubmit={handleRegister}>
            {error && <div className="form-error">{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">First name</label>
                <input className="input" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Aoife" required />
              </div>
              <div className="input-group">
                <label className="input-label">Last name</label>
                <input className="input" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Murphy" required />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
            </div>

            <div className="input-group">
              <label className="input-label">Phone <span className="text-dim">(optional)</span></label>
              <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44 7700 000000" autoComplete="tel" />
            </div>

            <div className="input-group">
              <label className="input-label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" required />
              <p style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)', marginTop: 4 }}>Must be 8+ characters with an uppercase letter and a number.</p>
            </div>

            <div className="input-group">
              <label className="input-label">Confirm password</label>
              <input className={`input ${confirm && confirm !== password ? 'input-error' : ''}`} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" autoComplete="new-password" required />
            </div>

            <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading}>
              {loading ? <Spinner size="sm" /> : 'Create account'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/login')}
              style={{
                marginTop: 12, width: '100%', padding: '12px 24px',
                border: '2px solid #E85D26', color: '#E85D26',
                background: 'transparent', borderRadius: 8,
                fontWeight: 500, fontSize: '0.9rem', cursor: 'pointer',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(232,93,38,0.06)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Already have an account? Sign in
            </button>
          </form>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="auth-title">Check your email.</h1>
          <p className="auth-subtitle">
            We sent a 6-digit code to <strong>{email}</strong>. Enter it below to verify your account.
          </p>

          <form className="auth-form" onSubmit={handleVerify}>
            {error && <div className="form-error">{error}</div>}
            {resent && <div className="form-success" style={{ color: 'var(--c-success)', fontSize: '0.85rem', marginBottom: 8 }}>New code sent!</div>}

            <div className="input-group">
              <label className="input-label">Verification code</label>
              <input
                className="input"
                style={{ fontSize: '1.8rem', letterSpacing: '0.24em', textAlign: 'center', fontFamily: 'monospace' }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </div>

            <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading || otpCode.length < 6}>
              {loading ? <Spinner size="sm" /> : 'Verify & activate account'}
            </button>

            <button type="button" className="btn btn-ghost btn-block" onClick={handleResend}>
              Resend code
            </button>
          </form>
        </>
      )}
    </div>
  );
}
