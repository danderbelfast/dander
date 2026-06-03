import React, { useState } from 'react';
import { awardPurchasePoints } from '../api/business';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';

const POINTS_PER_POUND = 5; // mirrors business_loyalty_settings default

export default function AwardPoints() {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [userId, setUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const points = (() => {
    const n = parseFloat(amount);
    return Number.isFinite(n) && n > 0 ? Math.round(n * POINTS_PER_POUND) : 0;
  })();

  async function submitManual() {
    const uid = parseInt(userId, 10);
    const amt = parseFloat(amount);
    if (!Number.isFinite(uid) || !Number.isFinite(amt) || amt <= 0) {
      toast({ message: 'Enter a customer id and a positive amount.', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const r = await awardPurchasePoints({ user_id: uid, amount_spent: amt });
      setResult(r);
      toast({ message: `+${r.points_awarded} points sent.`, type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to award.', type: 'error' });
    }
    setSubmitting(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 640 }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Award Purchase Points</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          £1 spent = {POINTS_PER_POUND} points. Award after each purchase to grow loyalty.
        </p>
      </div>

      <div className="card">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="field">
            <label className="label">Purchase amount (£)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 8.50"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ fontSize: '2rem', padding: '14px 18px', fontWeight: 700 }}
            />
          </div>
          <div style={{
            textAlign: 'center', padding: 20, borderRadius: 12,
            background: '#1a1f29', color: '#FF6B35',
          }}>
            <div style={{ fontSize: '2.4rem', fontWeight: 800 }}>{points}</div>
            <div style={{ fontSize: '0.85rem', color: '#9aa4b1', marginTop: 4 }}>
              points based on £1 = {POINTS_PER_POUND} pts
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Award via NFC</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ color: 'var(--c-text-muted)', fontSize: '0.86rem', margin: 0 }}>
            Hold this tablet's back near the customer's Dander phone. The points transfer over NFC and the
            customer sees the same coins-flying animation as a regular check-in.
          </p>
          <button
            className="btn btn-primary"
            disabled
            title="NFC writer flow ships with the staff tablet PWA — coming soon"
          >
            Award via NFC (coming soon)
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Award manually</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: 'var(--c-text-muted)', fontSize: '0.86rem', margin: 0 }}>
            Don't have the NFC tablet yet? Look up the customer by their Dander member ID (from a recent visit).
          </p>
          <div className="field">
            <label className="label">Customer ID</label>
            <input
              className="input"
              type="number"
              placeholder="e.g. 1234"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>
          <button className="btn btn-secondary" onClick={submitManual} disabled={submitting} style={{ alignSelf: 'flex-start' }}>
            {submitting ? <Spinner /> : 'Award points'}
          </button>
        </div>
      </div>

      {result && (
        <div className="card" style={{ borderColor: '#1A9E58', borderWidth: 2 }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <strong>✅ +{result.points_awarded} points sent</strong>
            <span style={{ color: 'var(--c-text-muted)', fontSize: '0.86rem' }}>
              New balance {result.total_points} · Tier {result.tier}
              {result.tier_upgraded ? ' (upgraded!)' : ''}
            </span>
            {result.rewards_unlocked?.length > 0 && (
              <span>🎁 Unlocked: {result.rewards_unlocked.map((r) => r.emoji + ' ' + r.name).join(', ')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
