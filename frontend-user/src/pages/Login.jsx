import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login, verifyLogin2FA, forgotPassword, resetPassword, resendOtp } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui/Spinner';

const SESSION_KEY = 'dander_login_otp';

function decodeJWT(token) {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return {}; }
}

export default function Login() {
  const navigate = useNavigate();
  const { login: authLogin } = useAuth();

  // ── Login flow (steps 1-2) ───────────────────────────────────────────────
  const [step, setStep]           = useState(1);
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode]   = useState('');

  // ── Forgot password flow (steps 3-5) ────────────────────────────────────
  const [forgotStep, setForgotStep]         = useState(1); // 1=email, 2=otp, 3=new password
  const [forgotEmail, setForgotEmail]       = useState('');
  const [forgotUserId, setForgotUserId]     = useState(null);
  const [forgotCode, setForgotCode]         = useState('');
  const [newPassword, setNewPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetResent, setResetResent]       = useState(false);

  const [mode, setMode]     = useState('login'); // 'login' | 'forgot'
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // Restore OTP step if page was reloaded mid-flow
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (saved?.tempToken) {
        setEmail(saved.email);
        setTempToken(saved.tempToken);
        setStep(2);
      }
    } catch {}
  }, []);

  function validatePassword(pw) {
    if (pw.length < 8)           return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(pw))       return 'Password must contain an uppercase letter.';
    if (!/[0-9]/.test(pw))       return 'Password must contain a number.';
    return null;
  }

  // ── Login handlers ───────────────────────────────────────────────────────

  async function handleCredentials(e) {
    e.preventDefault();
    setError('');
    const passwordError = validatePassword(password);
    if (passwordError) { setError(passwordError); return; }
    setLoading(true);
    try {
      const data = await login(email, password);
      if (data.requires2FA) {
        setTempToken(data.tempToken);
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email, tempToken: data.tempToken }));
        setStep(2);
      } else if (data.setupRequired) {
        navigate('/register?step=setup', { state: { email } });
      }
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'EMAIL_NOT_FOUND') {
        setError('No account found with that email address.');
      } else if (code === 'WRONG_PASSWORD') {
        setError('Incorrect password. Please try again.');
      } else {
        setError(err.response?.data?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleTotp(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await verifyLogin2FA(tempToken, totpCode);
      sessionStorage.removeItem(SESSION_KEY);
      const payload = decodeJWT(data.accessToken);
      authLogin(data.accessToken, data.refreshToken, {
        id: payload.sub, email: payload.email, role: payload.role,
        firstName: data.user?.firstName, lastName: data.user?.lastName,
        avatarUrl: data.user?.avatarUrl ?? null,
      });
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid code. Try again.');
      setTotpCode('');
    } finally {
      setLoading(false);
    }
  }

  // ── Forgot password handlers ─────────────────────────────────────────────

  function enterForgotMode() {
    setMode('forgot');
    setForgotStep(1);
    setForgotEmail(email); // pre-fill from login email if already typed
    setForgotCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setResetResent(false);
  }

  function exitForgotMode() {
    setMode('login');
    setError('');
  }

  async function handleForgotEmail(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await forgotPassword(forgotEmail);
      setForgotUserId(data.userId);
      setForgotStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotOtp(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      // Validate the code before proceeding to password step
      // We do a dry-run by attempting the reset with a dummy password check skipped —
      // actually just advance to step 3 here; the code is verified on final submit.
      setForgotStep(3);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid code. Please try again.');
      setForgotCode('');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    const pwErr = validatePassword(newPassword);
    if (pwErr) { setError(pwErr); return; }
    setLoading(true);
    try {
      await resetPassword(forgotUserId, forgotCode, newPassword);
      setForgotStep(4); // success state
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'INVALID_OTP' || code === 'OTP_EXPIRED') {
        // Code was wrong — send them back to OTP step
        setError(err.response.data.message);
        setForgotStep(2);
        setForgotCode('');
      } else {
        setError(err.response?.data?.message || 'Password reset failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResendReset() {
    setError(''); setResetResent(false);
    try {
      await resendOtp(forgotUserId, 'reset_password');
      setResetResent(true);
    } catch {
      setError('Could not resend code. Please try again.');
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="auth-page page-full">
      <div className="auth-logo">Dander</div>

      {/* ── Login: step 1 — credentials ── */}
      {mode === 'login' && step === 1 && (
        <>
          <h1 className="auth-title">Welcome back.</h1>
          <p className="auth-subtitle">Sign in to see what's near you today.</p>

          <form className="auth-form" onSubmit={handleCredentials}>
            {error && <div className="form-error">{error}</div>}

            <div className="input-group">
              <label className="input-label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading}>
              {loading ? <Spinner size="sm" /> : 'Sign in'}
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ fontSize: '0.88rem', color: 'var(--c-primary)' }}
              onClick={enterForgotMode}
            >
              Forgot password?
            </button>
          </form>

          <p className="auth-link">
            Don't have an account?{' '}
            <span onClick={() => navigate('/register')}>Create one</span>
          </p>
        </>
      )}

      {/* ── Login: step 2 — OTP ── */}
      {mode === 'login' && step === 2 && (
        <>
          <h1 className="auth-title">Check your email.</h1>
          <p className="auth-subtitle">We sent a 6-digit sign-in code to <strong>{email}</strong>.</p>

          <form className="auth-form" onSubmit={handleTotp}>
            {error && <div className="form-error">{error}</div>}

            <div className="input-group">
              <label className="input-label">Verification code</label>
              <input
                className="input"
                style={{ fontSize: '1.6rem', letterSpacing: '0.2em', textAlign: 'center', fontFamily: 'monospace' }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </div>

            <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading || totpCode.length < 6}>
              {loading ? <Spinner size="sm" /> : 'Verify'}
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => { sessionStorage.removeItem(SESSION_KEY); setStep(1); setError(''); }}
            >
              ← Back
            </button>
          </form>
        </>
      )}

      {/* ── Forgot: step 1 — enter email ── */}
      {mode === 'forgot' && forgotStep === 1 && (
        <>
          <h1 className="auth-title">Reset password.</h1>
          <p className="auth-subtitle">Enter your email and we'll send you a reset code.</p>

          <form className="auth-form" onSubmit={handleForgotEmail}>
            {error && <div className="form-error">{error}</div>}

            <div className="input-group">
              <label className="input-label">Email</label>
              <input
                className="input"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                required
              />
            </div>

            <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading}>
              {loading ? <Spinner size="sm" /> : 'Send reset code'}
            </button>

            <button type="button" className="btn btn-ghost btn-block" onClick={exitForgotMode}>
              ← Back to sign in
            </button>
          </form>
        </>
      )}

      {/* ── Forgot: step 2 — enter OTP ── */}
      {mode === 'forgot' && forgotStep === 2 && (
        <>
          <h1 className="auth-title">Check your email.</h1>
          <p className="auth-subtitle">
            We sent a 6-digit reset code to <strong>{forgotEmail}</strong>.
          </p>

          <form className="auth-form" onSubmit={handleForgotOtp}>
            {error && <div className="form-error">{error}</div>}
            {resetResent && (
              <div style={{ color: 'var(--c-success)', fontSize: '0.85rem', marginBottom: 4 }}>
                New code sent!
              </div>
            )}

            <div className="input-group">
              <label className="input-label">Reset code</label>
              <input
                className="input"
                style={{ fontSize: '1.8rem', letterSpacing: '0.24em', textAlign: 'center', fontFamily: 'monospace' }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={forgotCode}
                onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </div>

            <button
              className="btn btn-primary btn-block btn-lg"
              type="submit"
              disabled={loading || forgotCode.length < 6}
            >
              {loading ? <Spinner size="sm" /> : 'Continue'}
            </button>

            <button type="button" className="btn btn-ghost btn-block" onClick={handleResendReset}>
              Resend code
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => { setForgotStep(1); setError(''); setForgotCode(''); }}
            >
              ← Back
            </button>
          </form>
        </>
      )}

      {/* ── Forgot: step 3 — new password ── */}
      {mode === 'forgot' && forgotStep === 3 && (
        <>
          <h1 className="auth-title">New password.</h1>
          <p className="auth-subtitle">Choose a strong password for your account.</p>

          <form className="auth-form" onSubmit={handleResetPassword}>
            {error && <div className="form-error">{error}</div>}

            <div className="input-group">
              <label className="input-label">New password</label>
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                autoFocus
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label">Confirm password</label>
              <input
                className={`input ${confirmPassword && confirmPassword !== newPassword ? 'input-error' : ''}`}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                autoComplete="new-password"
                required
              />
            </div>

            <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading}>
              {loading ? <Spinner size="sm" /> : 'Reset password'}
            </button>
          </form>
        </>
      )}

      {/* ── Forgot: step 4 — success ── */}
      {mode === 'forgot' && forgotStep === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem' }}>✅</div>
          <h2 className="font-head">Password updated!</h2>
          <p className="text-muted">You can now sign in with your new password.</p>
          <button
            className="btn btn-primary btn-lg"
            style={{ marginTop: 8 }}
            onClick={() => { setMode('login'); setStep(1); setError(''); setPassword(''); }}
          >
            Sign in
          </button>
        </div>
      )}
    </div>
  );
}
