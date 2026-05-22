import React, { useState, useRef } from 'react';
import { redeemCoupon } from '../api/coupons';
import { Spinner } from '../components/ui/Spinner';

function SuccessScreen({ result, code, onReset, soundsEnabled, onToggleSounds }) {
  return (
    <div className="redeem-result redeem-success">
      <div className="redeem-result-icon">✓</div>
      <h2 className="redeem-result-title">Coupon redeemed!</h2>
      <div className="redeem-result-detail">
        <div className="redeem-detail-row">
          <span className="redeem-detail-label">Customer</span>
          <span className="redeem-detail-value">
            {result.user ? [result.user.firstName, result.user.lastName].filter(Boolean).join(' ') || 'Customer' : 'Customer'}
          </span>
        </div>
        <div className="redeem-detail-row">
          <span className="redeem-detail-label">Offer</span>
          <span className="redeem-detail-value">{result.offer?.title || '—'}</span>
        </div>
        <div className="redeem-detail-row">
          <span className="redeem-detail-label">Code</span>
          <span className="redeem-detail-value" style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em' }}>
            {code}
          </span>
        </div>
        <div className="redeem-detail-row">
          <span className="redeem-detail-label">Time</span>
          <span className="redeem-detail-value">
            {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn btn-primary btn-block btn-lg" onClick={onReset}>
          Redeem another
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={onToggleSounds}
          title={soundsEnabled ? 'Mute sounds' : 'Enable sounds'}
          style={{
            padding: '10px 12px',
            fontSize: '1.2rem',
            minWidth: 'auto',
          }}
        >
          {soundsEnabled ? '🔊' : '🔇'}
        </button>
      </div>
    </div>
  );
}

function FailureScreen({ message, onReset }) {
  return (
    <div className="redeem-result redeem-failure">
      <div className="redeem-result-icon">✕</div>
      <h2 className="redeem-result-title">Redemption failed</h2>
      <p className="redeem-result-message">{message}</p>
      <button className="btn btn-secondary btn-block btn-lg" style={{ marginTop: 8 }} onClick={onReset}>
        Try again
      </button>
    </div>
  );
}

export default function RedeemCoupon() {
  const [code, setCode]         = useState('');
  const [pin, setPin]           = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);  // { success, ...data } | null
  const [screen, setScreen]     = useState('form'); // 'form' | 'success' | 'failure'
  const [failMsg, setFailMsg]   = useState('');
  const [soundsEnabled, setSoundsEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('dander_business_sounds_enabled');
      return stored !== 'false';
    } catch {
      return true;
    }
  });
  const codeRef = useRef(null);

  function reset() {
    setCode(''); setPin(''); setResult(null); setScreen('form'); setFailMsg('');
    setTimeout(() => codeRef.current?.focus(), 50);
  }

  function handleToggleSounds() {
    const newState = !soundsEnabled;
    setSoundsEnabled(newState);
    localStorage.setItem('dander_business_sounds_enabled', newState);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await redeemCoupon(code.toUpperCase().trim(), pin);
      setResult(data);
      setScreen('success');

      // Play coupon redeemed sound if enabled
      if (soundsEnabled) {
        try {
          const soundGenerator = await import('../services/soundGenerator');
          if (soundGenerator.playCouponRedeemed) {
            soundGenerator.playCouponRedeemed(0.5).catch(() => {});
          }
        } catch (err) {
          console.warn('[RedeemCoupon] Sound playback failed:', err.message);
        }
      }
    } catch (err) {
      setFailMsg(err.response?.data?.message || 'Invalid code or PIN.');
      setScreen('failure');
    } finally { setLoading(false); }
  }

  if (screen === 'success') return (
    <div className="redeem-wrap">
      <SuccessScreen 
        result={result} 
        code={code} 
        onReset={reset}
        soundsEnabled={soundsEnabled}
        onToggleSounds={handleToggleSounds}
      />
    </div>
  );

  if (screen === 'failure') return (
    <div className="redeem-wrap">
      <FailureScreen message={failMsg} onReset={reset} />
    </div>
  );

  return (
    <div className="redeem-wrap">
      <div className="redeem-card">
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎟️</div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--c-heading)', margin: 0 }}>
            Redeem Coupon
          </h2>
          <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 6 }}>
            Enter the customer's coupon code and your staff PIN.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div className="field">
            <label className="label label-required">Coupon code</label>
            <input
              ref={codeRef}
              className="input redeem-code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="e.g. XK4M-RQJP"
              maxLength={16}
              autoComplete="off"
              autoCapitalize="characters"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label className="label label-required">Staff PIN</label>
            <input
              className="input redeem-pin-input"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              maxLength={8}
              autoComplete="current-password"
              required
            />
            <div className="field-hint">Your personal staff PIN assigned by your manager.</div>
          </div>

          <button
            className="btn btn-primary btn-block btn-lg"
            type="submit"
            disabled={loading || code.length < 4 || pin.length < 4}
          >
            {loading ? <Spinner white /> : 'Verify & redeem'}
          </button>

        </form>
      </div>
    </div>
  );
}
