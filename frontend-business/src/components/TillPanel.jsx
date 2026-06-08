import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { awardTillPoints } from '../api/business';
import { connectBusinessSocket, onBusinessEvent } from '../services/businessSocket';

const CATEGORIES = [
  'Coffee', 'Food', 'Clothing', 'Health', 'Beauty',
  'Services', 'Entertainment', 'Home', 'Sport', 'Other',
];

const SUCCESS_DISMISS_MS = 3000;

/**
 * TillPanel — always-mounted, fixed-position panel that listens for
 * till_customer / till_complete WebSocket events on the business room.
 *
 * Three states:
 *   IDLE              — small ready indicator (bottom-right)
 *   CUSTOMER ARRIVED  — slide-in form (amount + category + item + Award)
 *   POINTS AWARDED    — brief success card, auto-dismiss → IDLE
 *
 * Mounted inside AppShell so the staff member can stand at the till on
 * ANY route and react to a tap.
 */
export function TillPanel() {
  const { business } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState('IDLE');         // IDLE | ARRIVED | SUCCESS
  const [customer, setCustomer] = useState(null);
  const [success, setSuccess]   = useState(null);
  const [amount, setAmount]     = useState('');
  const [category, setCategory] = useState('');
  const [item, setItem]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const amountRef = useRef(null);
  const successTimer = useRef(null);

  // Connect + listen
  useEffect(() => {
    if (!business?.id) return;
    connectBusinessSocket(business.id);

    const offArrive = onBusinessEvent('till_customer', (payload) => {
      setCustomer(payload);
      setSuccess(null);
      setAmount('');
      setCategory('');
      setItem('');
      setState('ARRIVED');
      setTimeout(() => amountRef.current?.focus(), 100);
    });

    const offComplete = onBusinessEvent('till_complete', (payload) => {
      setSuccess(payload);
      setCustomer(null);
      setState('SUCCESS');
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setState('IDLE'), SUCCESS_DISMISS_MS);
    });

    return () => {
      offArrive();
      offComplete();
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, [business?.id]);

  async function handleAward() {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ message: 'Enter a positive amount.', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      await awardTillPoints({
        user_id: customer.user_id,
        amount_spent: amt,
        category: category || null,
        item_description: item || null,
      });
      // till_complete event arrives via WebSocket → switches state.
    } catch (err) {
      toast({
        message: err.response?.data?.message || 'Failed to award points.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    setCustomer(null);
    setState('IDLE');
  }

  if (!business?.id) return null;

  // Anticipated points preview as staff types the amount.
  const previewPoints = (() => {
    const n = parseFloat(amount);
    return Number.isFinite(n) && n > 0 ? Math.floor(n * 10) : 0;
  })();

  return (
    <>
      {state === 'IDLE' && (
        <div style={idleStyles}>
          <span style={dotStyles} />
          <span>Till ready — waiting for tap</span>
        </div>
      )}

      {state === 'ARRIVED' && customer && (
        <div style={panelStyles}>
          <div style={headerStyles}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
              👤 {customer.first_name}
            </div>
            <div style={tierBadge(customer.tier)}>
              ⭐ {String(customer.tier || 'bronze').toUpperCase()}
            </div>
          </div>

          <div style={statsRowStyles}>
            <Stat label="Points" value={customer.total_points} />
            <Stat label="Visit #" value={customer.total_visits} />
            <Stat label="Streak" value={customer.current_streak} />
          </div>

          {customer.points_to_next != null && customer.next_reward_name && (
            <div style={nextRewardStyles}>
              {customer.points_to_next} points to{' '}
              <span style={{ fontWeight: 700 }}>{customer.next_reward_name}</span>
            </div>
          )}

          {Array.isArray(customer.active_offers) && customer.active_offers.length > 0 && (
            <div style={activeOffersStyles}>
              <div style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)', fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>
                ACTIVE OFFERS
              </div>
              {customer.active_offers.map((o) => (
                <div key={o.id} style={offerRowStyles}>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{o.title}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)' }}>
                    {o.discount_percent != null
                      ? `${Number(o.discount_percent).toFixed(0)}% off`
                      : o.offer_price != null && o.original_price != null
                        ? `£${o.offer_price.toFixed(2)} (was £${o.original_price.toFixed(2)})`
                        : o.offer_price != null
                          ? `£${o.offer_price.toFixed(2)}`
                          : o.offer_type || 'Offer'}
                  </div>
                </div>
              ))}
              <div style={{ fontSize: '0.72rem', color: 'var(--c-text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                Apply by hand, enter the post-discount amount below.
              </div>
            </div>
          )}

          <div className="field" style={{ marginTop: 16 }}>
            <label className="label">Amount spent (£)</label>
            <input
              ref={amountRef}
              className="input"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 24.50"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ fontSize: '1.8rem', padding: '12px 14px', fontWeight: 700 }}
              disabled={submitting}
            />
            {previewPoints > 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--c-text-muted)', marginTop: 4 }}>
                = {previewPoints} points
              </div>
            )}
          </div>

          <div className="field">
            <label className="label">Category</label>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={submitting}
            >
              <option value="">— select —</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="field">
            <label className="label">Item</label>
            <input
              className="input"
              type="text"
              placeholder="e.g. Flat white + pastry"
              maxLength={500}
              value={item}
              onChange={(e) => setItem(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className="btn btn-primary"
              onClick={handleAward}
              disabled={submitting || !amount}
              style={{ flex: 1 }}
            >
              {submitting ? 'Awarding…' : 'Award Points'}
            </button>
            <button className="btn btn-ghost" onClick={handleCancel} disabled={submitting}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {state === 'SUCCESS' && success && (
        <div style={successStyles}>
          <div style={{ fontSize: '2rem', marginBottom: 4 }}>🎉</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            {success.first_name} earned {success.points_awarded} points
          </div>
          <div style={{ color: 'var(--c-text-muted)', marginTop: 4 }}>
            New total: {success.new_total} points
          </div>
          {success.next_reward_name && success.next_reward_at != null && (
            <div style={{ color: 'var(--c-text-muted)', marginTop: 6, fontSize: '0.9rem' }}>
              {Math.max(0, success.next_reward_at - success.new_total)} to{' '}
              <span style={{ fontWeight: 600 }}>{success.next_reward_name}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{value ?? 0}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)' }}>{label}</div>
    </div>
  );
}

function tierBadge(tier) {
  const colours = {
    bronze:   '#cd7f32',
    silver:   '#c0c0c0',
    gold:     '#f5b041',
    platinum: '#a3e4d7',
    diamond:  '#85c1e9',
    obsidian: '#212121',
    legend:   '#8e44ad',
  };
  return {
    background: colours[tier] || '#cd7f32',
    color: '#fff',
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: 0.5,
  };
}

const idleStyles = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  padding: '8px 14px',
  borderRadius: 999,
  background: 'rgba(0, 0, 0, 0.45)',
  color: '#fff',
  fontSize: '0.78rem',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  zIndex: 998,
  backdropFilter: 'blur(6px)',
};

const dotStyles = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#4ade80',
  boxShadow: '0 0 8px rgba(74, 222, 128, 0.7)',
};

const panelStyles = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  width: 360,
  maxHeight: 'calc(100vh - 32px)',
  overflowY: 'auto',
  background: 'var(--c-bg, #fff)',
  border: '1px solid var(--c-border, rgba(0,0,0,0.08))',
  borderRadius: 16,
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.2)',
  padding: 20,
  zIndex: 999,
  animation: 'tillSlideIn 220ms ease-out',
};

const headerStyles = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 12,
};

const statsRowStyles = {
  display: 'flex',
  gap: 8,
  padding: '12px 0',
  borderTop: '1px solid var(--c-border, rgba(0,0,0,0.08))',
  borderBottom: '1px solid var(--c-border, rgba(0,0,0,0.08))',
};

const nextRewardStyles = {
  marginTop: 12,
  padding: '8px 12px',
  background: 'rgba(245, 176, 65, 0.12)',
  borderLeft: '3px solid #f5b041',
  borderRadius: 6,
  fontSize: '0.88rem',
};

const activeOffersStyles = {
  marginTop: 12,
  padding: '10px 12px',
  background: 'rgba(132, 204, 22, 0.10)',
  borderLeft: '3px solid #84cc16',
  borderRadius: 6,
};

const offerRowStyles = {
  padding: '6px 0',
  borderBottom: '1px dashed rgba(132, 204, 22, 0.25)',
};

const successStyles = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  width: 320,
  background: 'var(--c-bg, #fff)',
  border: '1px solid var(--c-border, rgba(0,0,0,0.08))',
  borderRadius: 16,
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.2)',
  padding: 24,
  textAlign: 'center',
  zIndex: 999,
  animation: 'tillSlideIn 220ms ease-out',
};
