import React, { useState, useEffect } from 'react';
import { getMyCoupons } from '../api/coupons';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../context/ToastContext';
import { formatDistanceToNow } from 'date-fns';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TINY_WORDS = new Set(['a','an','the','and','but','or','for','nor','at','to','by','in','of','up','as','via']);

function toTitleCase(str) {
  if (!str) return str;
  return str.toLowerCase().replace(/(?:^|\s)\S/g, (ch, idx) => {
    const word = str.toLowerCase().slice(idx).split(/\s/)[0];
    if (idx > 0 && TINY_WORDS.has(word)) return ch;
    return ch.toUpperCase();
  });
}

function formatExpiry(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  const now   = new Date();

  const pad  = (n) => String(n).padStart(2, '0');
  const h    = date.getHours();
  const min  = pad(date.getMinutes());
  const ampm = h >= 12 ? 'pm' : 'am';
  const hr   = h % 12 || 12;
  const timeStr = min === '00' ? `${hr}${ampm}` : `${hr}:${min}${ampm}`;

  const isToday = date.toDateString() === now.toDateString();
  const tom     = new Date(now); tom.setDate(now.getDate() + 1);
  const isTom   = date.toDateString() === tom.toDateString();

  if (isToday) {
    const period = h < 12 ? 'This morning' : h < 17 ? 'This afternoon' : 'Tonight';
    return `${period} at ${timeStr}`;
  }
  if (isTom) return `Tomorrow at ${timeStr}`;

  const daysAway = Math.round((date - now) / 86_400_000);
  if (daysAway <= 6) {
    const day = date.toLocaleDateString('en-GB', { weekday: 'long' });
    return `${day} at ${timeStr}`;
  }
  const d = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${d} at ${timeStr}`;
}

// ---------------------------------------------------------------------------
// Active coupon card
// ---------------------------------------------------------------------------

function ActiveCouponCard({ coupon }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard?.writeText(coupon.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast({ type: 'error', title: 'Could not copy', message: 'Tap and hold the code to copy.' });
    });
  }

  const expiryLabel = formatExpiry(coupon.expires_at);

  return (
    <div className="cp-card-wrap">
      <div className="cp-card">

        {/* Top: offer info */}
        <div className="cp-card-top">
          <div className="cp-card-offer-row">
            <div className="cp-card-thumb">
              {coupon.offer_image_url
                ? <img src={coupon.offer_image_url} alt={coupon.offer_title} />
                : <div className="cp-card-thumb-placeholder">🏪</div>
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cp-card-biz">{coupon.business_name}</div>
              <div className="cp-card-title">{toTitleCase(coupon.offer_title)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="cp-card-status">
              <div className="cp-status-dot" />
              Active
            </div>
            {expiryLabel && (
              <div className="cp-card-expiry">Expires {expiryLabel}</div>
            )}
          </div>
        </div>

        {/* Tear-line */}
        <div className="cp-tear">
          <div className="cp-tear-circle cp-tear-circle-left" />
          <div className="cp-tear-line" />
          <div className="cp-tear-circle cp-tear-circle-right" />
        </div>

        {/* Bottom: code */}
        <div className="cp-card-bottom">
          <div className="cp-code-box">
            <span className="cp-code-text">{coupon.code}</span>
            <button className={`cp-copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History item (redeemed / expired)
// ---------------------------------------------------------------------------

function HistoryCouponItem({ coupon, tab }) {
  const timeLabel = tab === 'redeemed' && coupon.redeemed_at
    ? `Redeemed ${formatDistanceToNow(new Date(coupon.redeemed_at), { addSuffix: true })}`
    : coupon.expires_at
    ? `Expired ${formatDistanceToNow(new Date(coupon.expires_at), { addSuffix: true })}`
    : null;

  return (
    <div className="cp-history-item">
      <div className="cp-history-biz">{coupon.business_name}</div>
      <div className="cp-history-title">{toTitleCase(coupon.offer_title)}</div>
      <div className="cp-history-code">{coupon.code}</div>
      <div className="cp-history-footer">
        <span>{timeLabel}</span>
        {tab === 'redeemed' && (
          <span style={{ color: 'rgba(34,197,94,0.7)', fontWeight: 600 }}>
            ✓ Used{coupon.redeemed_by_staff_name ? ` · ${coupon.redeemed_by_staff_name}` : ''}
          </span>
        )}
        {tab === 'expired' && (
          <span>Expired</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const TABS = ['active', 'redeemed', 'expired'];

export default function MyCoupons() {
  const [data, setData]       = useState({ active: [], redeemed: [], expired: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('active');

  useEffect(() => {
    getMyCoupons()
      .then((d) => setData({ active: d.active || [], redeemed: d.redeemed || [], expired: d.expired || [] }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const items = data[tab] || [];
  const isActive = tab === 'active';

  return (
    <div className="cp-page">

      {/* Header */}
      <div className="cp-header">
        <div className="cp-header-title">My Coupons</div>
      </div>

      {/* Tabs */}
      <div className="cp-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`cp-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {data[t]?.length > 0 && (
              <span style={{
                marginLeft: 5, fontSize: '0.68rem',
                background: tab === t ? 'rgba(232,93,38,0.25)' : 'rgba(255,255,255,0.08)',
                color: tab === t ? '#E85D26' : 'rgba(255,255,255,0.3)',
                padding: '1px 6px', borderRadius: 999,
              }}>
                {data[t].length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Spinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <div className="cp-empty">
          <div className="cp-empty-icon">{tab === 'active' ? '🎟' : tab === 'redeemed' ? '✅' : '📭'}</div>
          <div className="cp-empty-title">No {tab} coupons</div>
          <p className="cp-empty-body">
            {tab === 'active'
              ? 'Browse nearby offers and tap "Get coupon" to claim deals.'
              : tab === 'redeemed'
              ? 'Redeemed coupons will appear here after staff scan them.'
              : 'Expired coupons are kept here for your records.'}
          </p>
        </div>
      ) : isActive ? (
        <>
          {/* Active coupon cards */}
          {items.map((c) => <ActiveCouponCard key={c.id} coupon={c} />)}

          {/* Warning box */}
          <div className="cp-warning">
            <span className="cp-warning-icon">⚠️</span>
            <span className="cp-warning-text">
              Show this screen to staff. Do not screenshot — code must be shown live for verification.
            </span>
          </div>

          {/* Redemption steps */}
          <div className="cp-steps">
            {[
              'Open this screen in store',
              'Show the code to staff',
              'Staff will scan and mark it as used',
            ].map((text, i) => (
              <div key={i} className="cp-step">
                <div className="cp-step-num">{i + 1}</div>
                <div className="cp-step-text">{text}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="cp-history-list">
          {items.map((c) => <HistoryCouponItem key={c.id} coupon={c} tab={tab} />)}
        </div>
      )}

    </div>
  );
}
